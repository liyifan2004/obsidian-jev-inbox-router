import { Menu, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "./constants";
import { JevClient, JevError } from "./jev-client";
import { CategoryPickerModal, FolderPickerModal, JevDecisionModal } from "./modals";
import { InboxRouter, type RouteResult, type RouterHost } from "./router";
import { JevSettingTab } from "./settings-tab";
import type { CacheEntry, CategoryConfig, JevSettings, RouterDecision, UndoEntry } from "./types";

interface PersistedData {
	settings: Partial<JevSettings>;
	cache?: Record<string, CacheEntry>;
	undo?: UndoEntry[];
}

const MAX_CACHE_ENTRIES = 300;
const MAX_UNDO_ENTRIES = 10;
const MAX_UNDO_CONTENT = 20_000;

type StatusKind = "ready" | "busy" | "ok" | "warn" | "error";

export default class JevInboxRouterPlugin extends Plugin implements RouterHost {
	settings: JevSettings = DEFAULT_SETTINGS;
	router!: InboxRouter;

	private client!: JevClient;
	private statusEl: HTMLElement | null = null;
	private statusTimer: number | null = null;
	private cacheMap = new Map<string, CacheEntry>();
	private undoStack: UndoEntry[] = [];
	private timers = new Map<string, number>();
	private busy = new Set<string>();
	private suppressUntil = 0;
	private lastResult: { result: RouteResult; file: TFile | null } | null = null;

	// ------------------------------------------------------------- 生命周期

	async onload(): Promise<void> {
		await this.loadSettings();

		this.client = new JevClient(() => ({
			apiKey: this.settings.apiKey,
			apiUrl: this.settings.apiUrl,
			model: this.settings.model,
		}));
		this.router = new InboxRouter(this.app, this);

		this.addSettingTab(new JevSettingTab(this.app, this));
		this.setupStatusBar();
		this.registerCommands();
		this.registerMenus();
		this.registerVaultEvents();

		this.addRibbonIcon("inbox", "JEV：扫描收件箱并分流", () => void this.scanInbox());
	}

	onunload(): void {
		for (const timer of this.timers.values()) window.clearTimeout(timer);
		this.timers.clear();
	}

	// ------------------------------------------------------- RouterHost 实现

	getSettings(): JevSettings {
		return this.settings;
	}

	getClient(): JevClient {
		return this.client;
	}

	getCache(path: string): CacheEntry | null {
		return this.cacheMap.get(path) ?? null;
	}

	setCache(path: string, entry: CacheEntry): void {
		this.cacheMap.set(path, entry);
		if (this.cacheMap.size > MAX_CACHE_ENTRIES) {
			const oldest = [...this.cacheMap.entries()].sort((a, b) => a[1].at - b[1].at);
			for (const [key] of oldest.slice(0, this.cacheMap.size - MAX_CACHE_ENTRIES)) {
				this.cacheMap.delete(key);
			}
		}
		this.scheduleSave();
	}

	invalidateCache(path: string): void {
		if (this.cacheMap.delete(path)) this.scheduleSave();
	}

	pushUndo(entry: UndoEntry): void {
		this.undoStack.push({
			...entry,
			previousContent:
				entry.previousContent && entry.previousContent.length > MAX_UNDO_CONTENT
					? null
					: entry.previousContent,
		});
		if (this.undoStack.length > MAX_UNDO_ENTRIES) {
			this.undoStack.splice(0, this.undoStack.length - MAX_UNDO_ENTRIES);
		}
		this.scheduleSave();
	}

	/** RouterHost：分流期间自己写文件，开一段静默窗口，避免自动分流自己触发自己 */
	beginSelfWrite(): void {
		this.suppressUntil = Date.now() + 5000;
	}

	cacheSize(): number {
		return this.cacheMap.size;
	}

	clearCache(): void {
		this.cacheMap.clear();
		void this.saveSettings(this.settings);
	}

	// ------------------------------------------------------------- 设置持久化

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) as PersistedData | null;
		this.settings = normalizeSettings(raw?.settings ?? {});
		this.cacheMap = new Map(Object.entries(raw?.cache ?? {}));
		this.undoStack = Array.isArray(raw?.undo) ? raw.undo : [];
	}

	async saveSettings(settings: JevSettings): Promise<void> {
		this.settings = settings;
		await this.persist();
	}

	private saveTimer: number | null = null;

	private scheduleSave(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.persist();
		}, 800);
	}

	private async persist(): Promise<void> {
		const cache: Record<string, CacheEntry> = {};
		for (const [key, value] of this.cacheMap) cache[key] = value;
		const data: PersistedData = {
			settings: this.settings,
			cache,
			undo: this.undoStack,
		};
		await this.saveData(data);
	}

	// ---------------------------------------------------------------- 状态栏

	private setupStatusBar(): void {
		if (this.settings.statusBarEnabled) {
			if (!this.statusEl) {
				this.statusEl = this.addStatusBarItem();
				this.statusEl.addEventListener("click", () => this.showLastDecision());
				this.statusEl.addClass("jev-status");
			}
			this.setStatus("ready", "就绪");
		} else if (this.statusEl) {
			this.statusEl.detach();
			this.statusEl = null;
		}
	}

	refreshStatusBar(): void {
		this.setupStatusBar();
	}

	private setStatus(kind: StatusKind, text: string, color?: string): void {
		if (this.statusTimer !== null) {
			window.clearTimeout(this.statusTimer);
			this.statusTimer = null;
		}
		const el = this.statusEl;
		if (!el) return;

		el.removeClass("is-busy", "is-ok", "is-warn", "is-error");
		el.addClass(`is-${kind}`);
		el.empty();
		const dot = el.createSpan({ cls: "jev-dot" });
		dot.style.background = color ?? "";
		el.createSpan({ text: `JEV · ${text}` });

		if ((kind === "ok" || kind === "warn" || kind === "error") && this.settings.statusBarClearMs > 0) {
			this.statusTimer = window.setTimeout(() => this.setStatus("ready", "就绪"), this.settings.statusBarClearMs);
		}
	}

	// ---------------------------------------------------------------- 命令

	private registerCommands(): void {
		this.addCommand({
			id: "route-current-note",
			name: "判断当前笔记并分流",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) void this.runRoute(file, { force: true });
				return true;
			},
		});

		this.addCommand({
			id: "analyze-current-note",
			name: "只判断当前笔记（不移动）",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) void this.runRoute(file, { dryRun: true, force: true });
				return true;
			},
		});

		this.addCommand({
			id: "scan-inbox",
			name: "扫描收件箱并批量分流",
			callback: () => void this.scanInbox(),
		});

		this.addCommand({
			id: "undo-last-route",
			name: "撤销上一次分流",
			callback: () => void this.undoLast(),
		});

		this.addCommand({
			id: "show-last-decision",
			name: "查看最近一次判断详情",
			callback: () => this.showLastDecision(),
		});

		this.addCommand({
			id: "toggle-auto-route",
			name: "切换自动分流开关",
			callback: async () => {
				this.settings.autoRouteEnabled = !this.settings.autoRouteEnabled;
				await this.persist();
				new Notice(`自动分流已${this.settings.autoRouteEnabled ? "开启" : "关闭"}`);
				this.setStatus(
					this.settings.autoRouteEnabled ? "ok" : "ready",
					`自动分流 ${this.settings.autoRouteEnabled ? "开" : "关"}`
				);
			},
		});
	}

	private registerMenus(): void {
		const addItems = (menu: Menu, file: TFile) => {
			menu.addItem((item) =>
				item
					.setTitle("JEV：判断并分流")
					.setIcon("inbox")
					.onClick(() => void this.runRoute(file, { force: true }))
			);
			menu.addItem((item) =>
				item
					.setTitle("JEV：只判断（不移动）")
					.setIcon("search")
					.onClick(() => void this.runRoute(file, { dryRun: true, force: true }))
			);
			menu.addItem((item) =>
				item
					.setTitle("JEV：移动到指定文件夹…")
					.setIcon("folder-input")
					.onClick(() => {
						new FolderPickerModal(this.app, this.router.getAllFolders(), (folder) => {
							void this.moveFileTo(file, folder);
						}).open();
					})
			);
		};

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") addItems(menu, file);
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu) => {
				const file = this.activeMarkdownFile();
				if (file) addItems(menu, file);
			})
		);
	}

	private registerVaultEvents(): void {
		const onChange = (file: unknown) => {
			if (!(file instanceof TFile)) return;
			if (file.extension !== "md") return;
			this.scheduleAutoRoute(file);
		};

		this.registerEvent(this.app.vault.on("create", onChange));
		this.registerEvent(this.app.vault.on("modify", onChange));
	}

	private activeMarkdownFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (file && file.extension === "md") return file;
		return null;
	}

	// ------------------------------------------------------------ 自动分流

	private scheduleAutoRoute(file: TFile): void {
		if (!this.settings.autoRouteEnabled) return;
		if (Date.now() < this.suppressUntil) return;
		if (!this.router.isInInbox(file, this.settings)) return;
		if (this.busy.has(file.path)) return;

		const existing = this.timers.get(file.path);
		if (existing !== undefined) window.clearTimeout(existing);

		const timer = window.setTimeout(() => {
			this.timers.delete(file.path);
			const current = this.app.vault.getAbstractFileByPath(file.path);
			if (!(current instanceof TFile)) return;
			void this.runRoute(current, { silent: true, quiet: true });
		}, this.settings.autoRouteDelayMs);

		this.timers.set(file.path, timer);
	}

	// ------------------------------------------------------------ 主流程

	private async runRoute(
		file: TFile,
		options: {
			dryRun?: boolean;
			force?: boolean;
			silent?: boolean;
			/** 自动触发时更安静：不弹通知，只更新状态栏 */
			quiet?: boolean;
			/** 手动指定目标文件夹（跳过 JEV 判断） */
			overrideFolder?: string;
		} = {}
	): Promise<RouteResult | null> {
		if (this.busy.has(file.path)) return null;

		if (!this.settings.apiKey.trim()) {
			this.setStatus("error", "缺少 API Key");
			new Notice("请在 设置 → JEV Inbox Router 里填写 API Key。", 8000);
			return null;
		}

		this.busy.add(file.path);
		this.suppressUntil = Date.now() + 5000;
		this.setStatus("busy", `分析中：${file.basename}`);

		try {
			if (options.overrideFolder !== undefined) {
				const moved = await this.moveFileTo(file, options.overrideFolder, options.quiet ?? false);
				return moved;
			}

			if (!options.force) {
				const raw = await this.app.vault.cachedRead(file);
				if (this.router.tooShort(raw, this.settings.minChars)) {
					this.setStatus("ready", "内容太短，跳过");
					return null;
				}
			}

			const result = await this.router.route(file, {
				dryRun: options.dryRun,
				force: options.force,
			});

			const after = this.app.vault.getAbstractFileByPath(result.toPath);
			this.lastResult = {
				result,
				file: after instanceof TFile ? after : file,
			};
			this.report(result, options);
			return result;
		} catch (error) {
			const message = error instanceof JevError ? error.message : String(error);
			this.setStatus("error", "判断失败");
			if (!options.quiet) new Notice(`JEV 判断失败：${message}`, 12000);
			else console.error("[jev-inbox-router]", error);
			return null;
		} finally {
			this.busy.delete(file.path);
			this.suppressUntil = Date.now() + 2500;
		}
	}

	private report(result: RouteResult, options: { dryRun?: boolean; quiet?: boolean }): void {
		const d = result.decision;
		const color = this.settings.categories.find((c) => c.key === d.categoryKey)?.color;
		const short =
			this.settings.categories.find((c) => c.key === d.categoryKey)?.short ?? d.categoryLabel;

		if (options.dryRun) {
			this.setStatus("ok", `${short} ${Math.round(d.confidence * 100)}%`, color);
			this.showDecisionModal(result);
			return;
		}

		if (result.moved) {
			this.setStatus(
				"ok",
				`${short} ${Math.round(d.confidence * 100)}% → ${d.targetFolder || "库根目录"}`,
				color
			);
			if (!options.quiet) {
				new Notice(
					`已分流：${d.categoryKey} ${d.categoryLabel}（${Math.round(
						d.confidence * 100
					)}%）→ ${d.targetFolder || "库根目录"}`,
					5000
				);
			}
			return;
		}

		if (result.blockedReason) {
			this.setStatus("warn", `${short} ${Math.round(d.confidence * 100)}% 存疑`, color);
			if (!options.quiet) {
				new Notice(`已标记但未移动：${result.blockedReason}`, 8000);
			}
			return;
		}

		this.setStatus("warn", `${short} 已在目标位置`, color);
	}

	private async moveFileTo(file: TFile, folder: string, quiet = false): Promise<RouteResult | null> {
		this.busy.add(file.path);
		this.suppressUntil = Date.now() + 5000;
		try {
			const fromPath = file.path;
			const target = await this.router.moveTo(file, folder);
			const decision: RouterDecision = this.lastResult?.result.decision ?? {
				categoryKey: "自定义",
				categoryLabel: "手动指定",
				targetFolder: folder,
				confidence: 1,
				modelConfidence: null,
				margin: Number.POSITIVE_INFINITY,
				ranking: [],
				valueIndex: null,
				valueLevels: [],
				model: "manual",
				at: Date.now(),
			};
			const result: RouteResult = {
				decision,
				fromPath,
				toPath: target,
				moved: target !== fromPath,
				fromCache: false,
			};
			const after = this.app.vault.getAbstractFileByPath(target);
			this.lastResult = { result, file: after instanceof TFile ? after : file };
			if (result.moved) {
				this.pushUndo({ path: target, previousPath: fromPath, previousContent: null, at: Date.now() });
				this.setStatus("ok", `已移到 ${folder || "库根目录"}`);
				if (!quiet) new Notice(`已移动到 ${folder || "库根目录"}`);
			} else {
				this.setStatus("ready", "已经在目标文件夹");
			}
			return result;
		} catch (error) {
			this.setStatus("error", "移动失败");
			new Notice(`移动失败：${error instanceof Error ? error.message : String(error)}`, 8000);
			return null;
		} finally {
			this.busy.delete(file.path);
			this.suppressUntil = Date.now() + 2500;
		}
	}

	// ------------------------------------------------------------ 批量扫描

	private async scanInbox(): Promise<void> {
		const folders =
			this.settings.watchScope === "vault"
				? [""]
				: this.settings.inboxFolders.length > 0
					? this.settings.inboxFolders
					: ["Inbox"];

		const seen = new Set<string>();
		const files: TFile[] = [];
		for (const folder of folders) {
			for (const file of this.router.listMarkdownFiles(folder)) {
				if (!seen.has(file.path)) {
					seen.add(file.path);
					files.push(file);
				}
			}
		}

		if (files.length === 0) {
			new Notice(`收件箱里没有待处理的 Markdown 笔记（${folders.join(" / ")}）`, 6000);
			return;
		}

		const notice = new Notice("", 0);
		let index = 0;
		let moved = 0;
		let blocked = 0;
		let failed = 0;
		let skipped = 0;

		for (const file of files) {
			index++;
			notice.setMessage(`JEV 分流中… ${index}/${files.length}\n${file.path}`);
			const current = this.app.vault.getAbstractFileByPath(file.path);
			if (!(current instanceof TFile)) {
				skipped++;
				continue;
			}
			const raw = await this.app.vault.cachedRead(current);
			if (this.router.tooShort(raw, this.settings.minChars)) {
				skipped++;
				continue;
			}
			const result = await this.runRoute(current, { quiet: true, silent: true });
			if (!result) failed++;
			else if (result.moved) moved++;
			else blocked++;
			await new Promise((resolve) => window.setTimeout(resolve, 150));
		}

		notice.hide();
		new Notice(
			`扫描完成：共 ${index} 篇 · 移动 ${moved} · 仅标记 ${blocked} · 跳过 ${skipped} · 失败 ${failed}`,
			9000
		);
		this.setStatus("ok", `扫描完成 ${moved} 篇已移动`);
	}

	// ---------------------------------------------------------------- 撤销

	private async undoLast(): Promise<void> {
		const entry = this.undoStack.pop();
		if (!entry) {
			new Notice("没有可撤销的分流记录（插件重启后只保留最近几次）。", 6000);
			return;
		}
		this.suppressUntil = Date.now() + 4000;
		const ok = await this.router.undo(entry);
		if (ok) {
			new Notice(`已撤销：${entry.path} → ${entry.previousPath}`, 6000);
			this.setStatus("ok", "已撤销上一次分流");
		} else {
			new Notice(`撤销失败：找不到 ${entry.path}（可能已被移动或删除）。`, 8000);
			this.setStatus("error", "撤销失败");
		}
		void this.persist();
	}

	// ------------------------------------------------------------ 详情弹窗

	showLastDecision(): void {
		if (!this.lastResult) {
			new Notice("这个会话里还没有产生过判断结果。", 5000);
			return;
		}
		this.showDecisionModal(this.lastResult.result);
	}

	private showDecisionModal(result: RouteResult): void {
		const file = this.lastResult?.file ?? null;
		new JevDecisionModal(
			this.app,
			result.decision,
			this.settings,
			{
				moveToFolder: async (folder) => {
					if (!file) return;
					await this.moveFileTo(file, folder);
				},
				pickOther: () => {
					if (!file) return;
					new CategoryPickerModal(this.app, this.settings.categories, (key) => {
						const category = this.settings.categories.find((c) => c.key === key);
						if (category) void this.moveFileTo(file, category.folder);
					}).open();
				},
				reroute: async () => {
					if (!file) return;
					await this.runRoute(file, { force: true });
				},
				removeBlock: async () => {
					if (!file) return;
					await this.router.removeBlock(file);
					new Notice("已移除判断块。");
				},
			},
			file
		).open();
	}
}

/**
 * 把持久化的设置补齐成完整的 JevSettings。
 * 分类按 key 合并，避免插件升级后丢掉用户已有配置。
 */
function normalizeSettings(raw: Partial<JevSettings>): JevSettings {
	const merged: JevSettings = {
		...DEFAULT_SETTINGS,
		...raw,
		categories: Array.isArray(raw.categories) && raw.categories.length > 0
			? raw.categories.map((c) => normalizeCategory(c))
			: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.categories)),
		inboxFolders:
			Array.isArray(raw.inboxFolders) && raw.inboxFolders.length > 0
				? raw.inboxFolders
				: DEFAULT_SETTINGS.inboxFolders.slice(),
	};
	if (!merged.apiUrl) merged.apiUrl = DEFAULT_SETTINGS.apiUrl;
	if (!merged.model) merged.model = DEFAULT_SETTINGS.model;
	return merged;
}

function normalizeCategory(raw: Partial<CategoryConfig>): CategoryConfig {
	const key = typeof raw.key === "string" && raw.key ? raw.key : "?";
	const fallback = DEFAULT_SETTINGS.categories.find((c) => c.key === key);
	return {
		key,
		label: raw.label ?? fallback?.label ?? key,
		short: raw.short ?? fallback?.short ?? raw.label ?? key,
		description: raw.description ?? fallback?.description ?? "",
		folder: typeof raw.folder === "string" ? raw.folder : (fallback?.folder ?? ""),
		tag: raw.tag ?? fallback?.tag ?? "",
		enabled: raw.enabled !== false,
		color: raw.color ?? fallback?.color ?? "#7F8C99",
	};
}
