import { App, TFile, TFolder, normalizePath } from "obsidian";
import { hashContent, JevClient, JevError } from "./jev-client";
import {
	applyFrontmatterFields,
	buildFrontmatterFields,
	buildRouteBlock,
	stripRouteBlock,
	toJudgeFingerprintSource,
	toJudgeInput,
	upsertRouteBlock,
} from "./note-writer";
import { evaluateGate, isDeletionDecision, isInInboxPath, isTooShort, normalizeFolder } from "./rules";
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

export class InboxRouter {
	constructor(
		private readonly app: App,
		private readonly host: RouterHost
	) {}

	// ---------------------------------------------------------------- 路径工具

	getAllFolders(): string[] {
		const folders: string[] = [""];
		for (const f of this.app.vault.getAllLoadedFiles()) {
			if (f instanceof TFolder) folders.push(f.path);
		}
		return folders.sort((a, b) => a.localeCompare(b));
	}

	/** 列出某个文件夹（含子文件夹）下的所有 Markdown 文件；folderPath 为空表示整个库 */
	listMarkdownFiles(folderPath: string): TFile[] {
		const clean = normalizeFolder(folderPath);
		const root: TFolder | null = clean
			? (() => {
					const found = this.app.vault.getAbstractFileByPath(normalizePath(clean));
					return found instanceof TFolder ? found : null;
				})()
			: this.app.vault.getRoot();

		if (!root) return [];

		const out: TFile[] = [];
		const walk = (dir: TFolder) => {
			for (const child of dir.children) {
				if (child instanceof TFile) {
					if (child.extension === "md") out.push(child);
				} else if (child instanceof TFolder) {
					walk(child);
				}
			}
		};
		walk(root);
		return out;
	}

	/** 文件是否落在收件箱范围内 */
	isInInbox(file: TFile, settings: JevSettings): boolean {
		return isInInboxPath(file.path, settings);
	}

	/** 内容是否太短，不值得判断 */
	tooShort(content: string, minChars: number): boolean {
		return isTooShort(content, minChars);
	}

	async ensureFolder(folderPath: string): Promise<void> {
		const path = normalizeFolder(folderPath);
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

	/**
	 * 送去给 JEV 的正文：剥掉自己写的判断块与 jev-* 字段。
	 * 这样重新判断时既不会被上次的结论带偏，内容没变时缓存也能命中。
	 */
	private async readJudgeInput(file: TFile): Promise<{ raw: string; judgeInput: string }> {
		const raw = await this.app.vault.cachedRead(file);
		return { raw, judgeInput: toJudgeInput(raw) };
	}

	/**
	 * 判断一个文件应该去哪。dryRun 时不写入任何内容。
	 */
	async route(file: TFile, options: RouteOptions = {}): Promise<RouteResult> {
		const settings = this.host.getSettings();
		const client = this.host.getClient();
		const fromPath = file.path;

		const { raw, judgeInput } = await this.readJudgeInput(file);
		const hash = hashContent(toJudgeFingerprintSource(raw));

		let decision: RouterDecision | null = null;
		let fromCache = false;

		if (!options.force) {
			const cached = this.host.getCache(fromPath);
			if (cached && cached.hash === hash && Date.now() - cached.at < settings.cacheMinutes * 60_000) {
				decision = cached.decision;
				fromCache = true;
			}
		}

		if (!decision) {
			decision = await client.classify(
				{ title: file.basename, path: fromPath, content: judgeInput },
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

		// 缓存这次判断，内容没变时下次直接复用
		this.host.setCache(fromPath, { hash, at: Date.now(), decision });

		// ---- 判定是否允许移动 ----
		const targetFolder = decision.targetFolder;
		let allowMove = options.allowMove !== false;
		let blockedReason: string | undefined;

		if (isDeletionDecision(decision, settings)) {
			if (settings.deletionHandling === "ignore") {
				allowMove = false;
				blockedReason = "该笔记被判为「应该删除」，当前设置是不处理";
			} else if (settings.deletionHandling === "mark") {
				allowMove = false;
				blockedReason = "该笔记被判为「应该删除」，已标记但未移动（插件不会删除文件）";
			}
		}

		const gate = evaluateGate(decision, settings);
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

		// ---- 写 frontmatter ----
		if (settings.writeFrontmatter) {
			this.host.beginSelfWrite();
			const fields = buildFrontmatterFields(decision, settings);
			try {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					applyFrontmatterFields(fm as Record<string, unknown>, fields);
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

	/** 把文件移动到目标文件夹，处理同名冲突，返回最终路径 */
	async moveFile(file: TFile, folder: string): Promise<string> {
		const targetDir = normalizeFolder(folder);
		const build = (suffix: string) => {
			const name = `${file.basename}${suffix}.${file.extension}`;
			return normalizePath(targetDir ? `${targetDir}/${name}` : name);
		};

		let finalPath = build("");
		if (finalPath === file.path) return file.path;

		await this.ensureFolder(targetDir);

		let i = 1;
		while (this.app.vault.getAbstractFileByPath(finalPath) && i <= 100) {
			finalPath = build(` ${i}`);
			i++;
		}
		if (finalPath === file.path) return file.path;

		await this.app.fileManager.renameFile(file, finalPath);
		return finalPath;
	}

	/** 手动把文件挪到指定文件夹（不重新判断） */
	async moveTo(file: TFile, folder: string): Promise<string> {
		return this.moveFile(file, folder);
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
			const dir = entry.previousPath.split("/").slice(0, -1).join("/");
			await this.ensureFolder(dir);
			await this.app.fileManager.renameFile(file, normalizePath(entry.previousPath));
		}

		this.host.invalidateCache(entry.path);
		this.host.invalidateCache(entry.previousPath);
		return true;
	}
}

export { JevError };
