import { App, TFile, TFolder, normalizePath } from "obsidian";
import { hashContent, JevClient, JevError } from "./jev-client";
import { buildFrontmatterFields, buildRouteBlock, stripRouteBlock, upsertRouteBlock } from "./note-writer";
import type { CacheEntry, JevSettings, RouterDecision, UndoEntry } from "./types";

/** 分流结果 */
export interface RouteResult {
	decision: RouterDecision;
	fromPath: string;
	toPath: string;
	moved: boolean;
	blockedReason?: string;
	fromCache: boolean;
}

export interface RouteOptions {
	/** 只判断，不改动任何文件 */
	dryRun?: boolean;
	/** 忽略缓存，重新调用 JEV */
	force?: boolean;
	/** 是否允许移动文件 */
	allowMove?: boolean;
}

/** 宿主（由 main.ts 提供）需要暴露的能力 */
export interface RouterHost {
	getSettings(): JevSettings;
	getClient(): JevClient;
	getCache(path: string): CacheEntry | null;
	setCache(path: string, entry: CacheEntry): void;
	invalidateCache(path: string): void;
	pushUndo(entry: UndoEntry): void;
	/** 分流过程中会自己改文件并触发 modify 事件，用它开一段静默窗口 */
	beginSelfWrite(): void;
}

/** 分流被门槛拦下的原因 */
interface Gate {
	passed: boolean;
	reason?: string;
}

export class InboxRouter {
	constructor(private readonly app: App, private readonly host: RouterHost) {}

	// ---------------------------------------------------------------- 路径工具

	getAllFolders(): string[] {
		const folders: string[] = [""];
		for (const f of this.app.vault.getAllLoadedFiles()) {
			if (f instanceof TFolder) folders.push(f.path);
		}
		return folders.sort((a, b) => a.localeCompare(b));
	}

	listMarkdownFiles(folderPath: string): TFile[] {
		const folder = folderPath
			? this.app.vault.getAbstractFileByPath(normalizePath(folderPath))
			: this.app.vault.getRoot();
		const out: TFile[] = [];
		if (folder instanceof TFolder) {
			const walk = (dir: TFolder) => {
				for (const child of dir.children) {
					if (child instanceof TFile && child.extension === "md") out.push(child);
					else if (child instanceof TFolder) walk(child);
				}
			};
			walk(folder);
		} else if (folderPath === "" || folderPath === "/") {
			const walk = (dir: TFolder) => {
				for (const child of dir.children) {
					if (child instanceof TFile && child.extension === "md") out.push(child);
					else if (child instanceof TFolder) walk(child);
				}
			};
			walk(this.app.vault.getRoot());
		}
		return out;
	}

	/** 文件是否落在收件箱范围内 */
	isInInbox(file: TFile, settings: JevSettings): boolean {
		if (settings.watchScope === "vault") return true;
		const folders = settings.inboxFolders.map((f) => normalizePath(f).replace(/\/+$/, ""));
		return folders.some(
			(folder) => folder !== "" && (file.path === folder || file.path.startsWith(`${folder}/`))
		);
	}

	async ensureFolder(folderPath: string): Promise<void> {
		const path = normalizePath(folderPath).replace(/^\/+|\/+$/g, "");
		if (!path) return;
		if (this.app.vault.getAbstractFileByPath(path)) return;
		let current = "";
		for (const part of path.split("/")) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	// ---------------------------------------------------------------- 判断

	private getGate(decision: RouterDecision, settings: JevSettings): Gate {
		if (decision.confidence < settings.confidenceThreshold) {
			return {
				passed: false,
				reason: `置信度 ${Math.round(decision.confidence * 100)}% 低于门槛 ${Math.round(
					settings.confidenceThreshold * 100
				)}%`,
			};
		}
		if (Number.isFinite(decision.margin) && decision.margin < settings.marginThreshold) {
			return {
				passed: false,
				reason: `首选只比次选高 ${decision.margin.toFixed(2)} 倍，低于门槛 ${settings.marginThreshold}×`,
			};
		}
		return { passed: true };
	}

	/** 读取正文（去掉 frontmatter），供 JEV 判断 */
	private async readBody(file: TFile): Promise<string> {
		const raw = await this.app.vault.cachedRead(file);
		return raw;
	}

	/**
	 * 判断一个文件应该去哪。dryRun 时不写入任何内容。
	 */
	async route(file: TFile, options: RouteOptions = {}): Promise<RouteResult> {
		const settings = this.host.getSettings();
		const client = this.host.getClient();
		const fromPath = file.path;

		const raw = await this.readBody(file);
		const hash = hashContent(raw);

		let decision: RouterDecision | null = null;
		let fromCache = false;

		if (!options.force) {
			const cached = this.host.getCache(fromPath);
			if (
				cached &&
				cached.hash === hash &&
				Date.now() - cached.at < settings.cacheMinutes * 60_000
			) {
				decision = cached.decision;
				fromCache = true;
			}
		}

		if (!decision) {
			decision = await client.classify(
				{ title: file.basename, path: fromPath, content: raw },
				settings.categories,
				{ lowValueEnabled: settings.lowValueEnabled }
			);
		}

		const result: RouteResult = {
			decision,
			fromPath,
			toPath: fromPath,
			moved: false,
			fromCache,
		};

		if (options.dryRun) return result;

		// 缓存一份原始判断，后续只改内容不改结论时可复用
		this.host.setCache(fromPath, { hash, at: Date.now(), decision });

		// ---- 判定是否允许移动 ----
		const isDeletion = decision.categoryKey === this.getDeletionKey(settings);
		const gate = this.getGate(decision, settings);

		let blockedReason: string | undefined;
		const targetFolder = decision.targetFolder;
		let allowMove = options.allowMove !== false;

		if (isDeletion) {
			if (settings.deletionHandling === "ignore") {
				allowMove = false;
				blockedReason = "该笔记被判为「应该删除」，当前设置是不处理";
			} else if (settings.deletionHandling === "mark") {
				allowMove = false;
				blockedReason = "该笔记被判为「应该删除」，已标记但未移动（插件不会删除文件）";
			}
		}

		if (!gate.passed) {
			allowMove = false;
			blockedReason = gate.reason;
		}

		// ---- 写判断块 ----
		let previousContent: string | null = null;
		if (settings.blockEnabled) {
			const block = buildRouteBlock(decision, settings, {
				moved: allowMove,
				blockedReason,
			});
			this.host.beginSelfWrite();
			previousContent = raw;
			await this.app.vault.process(file, (data) =>
				upsertRouteBlock(data, block, settings.blockPlacement)
			);
		}

		if (settings.writeFrontmatter) {
			this.host.beginSelfWrite();
			try {
				const fields = buildFrontmatterFields(decision, settings);
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					for (const field of fields) {
						if (field.key === "tags") {
							const existing: unknown = fm[field.key];
							const list = Array.isArray(existing)
								? existing.map(String)
								: typeof existing === "string" && existing
									? [existing]
									: [];
							const incoming = field.value as string[];
							for (const t of incoming) {
								if (!list.includes(t)) list.push(t);
							}
							fm[field.key] = list;
						} else {
							fm[field.key] = field.value;
						}
					}
				});
			} catch {
				// frontmatter 不可解析时不阻塞分流
			}
		}

		// ---- 移动文件 ----
		if (allowMove) {
			const moved = await this.moveFile(file, targetFolder);
			if (moved && moved !== fromPath) {
				result.toPath = moved;
				result.moved = true;
				this.host.invalidateCache(fromPath);
				this.host.setCache(moved, { hash, at: Date.now(), decision });
				this.host.pushUndo({
					path: moved,
					previousPath: fromPath,
					previousContent,
					at: Date.now(),
				});
			}
		}

		result.blockedReason = blockedReason;
		return result;
	}

	private getDeletionKey(settings: JevSettings): string {
		// 约定：默认配置里 key 为 F 的分类是「应该删除」；找不到就退回最后一个分类
		const byKey = settings.categories.find((c) => c.key === "F");
		if (byKey) return byKey.key;
		const byLabel = settings.categories.find((c) => c.label.includes("删除"));
		if (byLabel) return byLabel.key;
		return "";
	}

	/** 把文件移动到目标文件夹，处理同名冲突，返回最终路径 */
	async moveFile(file: TFile, folder: string): Promise<string> {
		const targetDir = normalizePath(folder ?? "").replace(/^\/+|\/+$/g, "");
		const build = (dir: string, suffix: string) => {
			const name = `${file.basename}${suffix}.${file.extension}`;
			return normalizePath(dir ? `${dir}/${name}` : name);
		};

		let finalPath = build(targetDir, "");
		if (finalPath === file.path) return file.path;

		await this.ensureFolder(targetDir);

		let i = 1;
		while (this.app.vault.getAbstractFileByPath(finalPath) && i <= 100) {
			finalPath = build(targetDir, ` ${i}`);
			i++;
		}
		if (finalPath === file.path) return file.path;

		await this.app.fileManager.renameFile(file, finalPath);
		return finalPath;
	}

	/** 手动把文件挪到指定文件夹（不重新判断） */
	async moveTo(file: TFile, folder: string): Promise<string> {
		const target = await this.moveFile(file, folder);
		return target;
	}

	/** 移除文件里的判断块 */
	async removeBlock(file: TFile): Promise<void> {
		this.host.beginSelfWrite();
		await this.app.vault.process(file, (data) => stripRouteBlock(data));
	}

	/** 撤销一次分流：把文件挪回去，并恢复当时的内容 */
	async undo(entry: UndoEntry): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(entry.path);
		if (!(file instanceof TFile)) return false;

		if (entry.previousContent !== null) {
			this.host.beginSelfWrite();
			await this.app.vault.modify(file, entry.previousContent);
		}

		if (entry.previousPath && entry.previousPath !== file.path) {
			await this.ensureFolder(entry.previousPath.split("/").slice(0, -1).join("/"));
			await this.app.fileManager.renameFile(file, normalizePath(entry.previousPath));
		}

		this.host.invalidateCache(entry.path);
		this.host.invalidateCache(entry.previousPath);
		return true;
	}

	/** 内容是否太短，不值得判断 */
	tooShort(content: string, minChars: number): boolean {
		const text = content
			.replace(/^---[\s\S]*?\n---\n?/, "")
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(/[#>*`\-\s\[\]()]/g, "");
		return text.length < minChars;
	}
}

export { JevError };
