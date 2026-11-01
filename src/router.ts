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
import { t } from "./i18n";
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

/** 撤销时内容回写的结果 */
export type UndoContentOutcome = "restored" | "skipped" | "none";

/** 撤销失败的原因：missing=文件已找不到；conflict=原位置被占；error=其他错误 */
export type UndoFailureReason = "missing" | "conflict" | "error";

export interface UndoOutcome {
	ok: boolean;
	/** restored=内容已回写；skipped=笔记在分流后被改过，只挪回位置；none=没有内容快照 */
	content: UndoContentOutcome;
	/** ok=false 时给出原因，宿主据此决定撤销记录是保留（可重试）还是丢弃 */
	reason?: UndoFailureReason;
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

		// 缓存这次判断，内容没变时下次直接复用。
		// dryRun 也写缓存（ISS-007）：dryRun 不写任何文件内容，指纹依然有效，
		// 否则「自动分流前确认」每改一次笔记都要重新调用 JEV，白白计费。
		this.host.setCache(fromPath, { hash, at: Date.now(), decision });

		if (options.dryRun) return result;

		// ---- 判定是否允许移动 ----
		const targetFolder = decision.targetFolder;
		let allowMove = options.allowMove !== false;
		let blockedReason: string | undefined;

		if (isDeletionDecision(decision, settings)) {
			if (settings.deletionHandling === "ignore") {
				allowMove = false;
				blockedReason = t("blockedDeletionIgnore");
			} else if (settings.deletionHandling === "mark") {
				allowMove = false;
				blockedReason = t("blockedDeletionMark");
			}
		}

		const gate = evaluateGate(decision, settings);
		if (!gate.passed) {
			allowMove = false;
			blockedReason = gate.reason;
		}

		// 建议模式（调用方显式不许移动）：写明原因，
		// 否则日后翻到判断块只看到「（未移动）」，分不清是建议模式还是被门槛拦下
		if (!allowMove && !blockedReason && options.allowMove === false) {
			blockedReason = t("blockedSuggestionMode");
		}

		// ---- 写判断块 / frontmatter ----
		// 只要写过任何东西就留快照，撤销才有得还原（以前只在写判断块时留，漏了只写 frontmatter 的情况）
		let previousContent: string | null = null;
		if (settings.blockEnabled || settings.writeFrontmatter) previousContent = raw;
		if (settings.blockEnabled) {
			const block = buildRouteBlock(decision, settings, {
				moved: allowMove,
				blockedReason,
			});
			this.host.beginSelfWrite();
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

		// ---- 记录写完后的指纹：撤销时据此判断笔记是否又被编辑过 ----
		let writtenHash: string | null = null;
		if (previousContent !== null) {
			try {
				writtenHash = hashContent(await this.app.vault.read(file));
			} catch {
				writtenHash = null;
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
					writtenHash,
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

	/**
	 * 撤销一次分流：把文件挪回去，并在安全时恢复当时的内容。
	 *
	 * 内容回写前先比对 writtenHash：分流之后用户又编辑过的笔记只挪回位置、
	 * 不回写内容，避免用旧快照覆盖用户的改动。
	 *
	 * 失败不抛错，用 reason 区分：
	 * - missing：文件已不存在，记录无法再用（宿主可丢弃）；
	 * - conflict：原位置被别的文件占住，什么都没动（宿主保留记录，用户解决后可重试）；
	 * - error：移动/回写过程出错（宿主保留记录，可重试）。
	 */
	async undo(entry: UndoEntry): Promise<UndoOutcome> {
		const file = this.app.vault.getAbstractFileByPath(entry.path);
		if (!(file instanceof TFile)) return { ok: false, content: "none", reason: "missing" };

		// 冲突预检放在任何写操作之前：原位置被占就整体不动，保证「失败即无副作用」
		if (entry.previousPath && entry.previousPath !== file.path) {
			const occupied = this.app.vault.getAbstractFileByPath(entry.previousPath);
			if (occupied) return { ok: false, content: "none", reason: "conflict" };
		}

		let content: UndoContentOutcome = "none";
		try {
			if (entry.previousContent !== null) {
				let safeToRestore = true;
				if (entry.writtenHash) {
					const current = await this.app.vault.read(file);
					safeToRestore = hashContent(current) === entry.writtenHash;
				}
				if (safeToRestore) {
					this.host.beginSelfWrite();
					const restored = entry.previousContent;
					await this.app.vault.process(file, () => restored);
					content = "restored";
				} else {
					content = "skipped";
				}
			}

			if (entry.previousPath && entry.previousPath !== file.path) {
				const dir = entry.previousPath.split("/").slice(0, -1).join("/");
				await this.ensureFolder(dir);
				await this.app.fileManager.renameFile(file, normalizePath(entry.previousPath));
			}
		} catch {
			// 保持记录可重试：内容/位置可能已部分还原，但 writtenHash 校验保证重试不覆盖用户改动
			return { ok: false, content, reason: "error" };
		}

		this.host.invalidateCache(entry.path);
		this.host.invalidateCache(entry.previousPath);
		return { ok: true, content };
	}
}

export { JevError };
