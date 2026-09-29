import { Menu, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "./constants";
import { t } from "./i18n";
import { JevClient, JevError } from "./jev-client";
import { CategoryPickerModal, FolderPickerModal, JevDecisionModal } from "./modals";
import { buildRouteBlock, upsertRouteBlock } from "./note-writer";
import { InboxRouter, type RouteResult, type RouterHost } from "./router";
import { JevSettingTab } from "./settings-tab";
import { normalizeSettings } from "./settings-normalize";
import { normalizeFolder, statusViewForRoute, statusViewForSuggestion } from "./rules";
import type { CacheEntry, JevSettings, RouterDecision, UndoEntry } from "./types";

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
	/** 独立的撤销状态栏项：只在「刚刚成功移动过文件」后的窗口内存在 */
	private undoStatusEl: HTMLElement | null = null;
	private undoStatusTimer: number | null = null;
	/** 独立的「接受」状态栏项：只在「刚给出建议且未处理」的窗口内存在 */
	private acceptStatusEl: HTMLElement | null = null;
	private acceptStatusTimer: number | null = null;
	/** 最近一条未处理建议：状态栏「接受」与 accept-last-suggestion 命令都用它 */
	private lastSuggestion: { decision: RouterDecision; file: TFile } | null = null;
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

		this.addRibbonIcon("inbox", t("ribbonScan"), () => void this.scanInbox());
	}

	onunload(): void {
		for (const timer of this.timers.values()) window.clearTimeout(timer);
		this.timers.clear();
		if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
		this.statusTimer = null;
		if (this.undoStatusTimer !== null) window.clearTimeout(this.undoStatusTimer);
		this.undoStatusTimer = null;
		if (this.acceptStatusTimer !== null) window.clearTimeout(this.acceptStatusTimer);
		this.acceptStatusTimer = null;
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = null;
		// 显式移除状态栏节点，不依赖 Obsidian 自动回收
		this.statusEl?.detach();
		this.statusEl = null;
		this.undoStatusEl?.detach();
		this.undoStatusEl = null;
		this.acceptStatusEl?.detach();
		this.acceptStatusEl = null;
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
				this.statusEl.addClass("jev-status");
				// 状态栏主项是真控件：可聚焦、Enter/Space 可激活
				this.statusEl.setAttribute("role", "button");
				this.statusEl.setAttribute("tabindex", "0");
				this.statusEl.setAttribute("aria-label", t("ariaShowDecision"));
				this.statusEl.addEventListener("click", () => this.showLastDecision());
				this.statusEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						this.showLastDecision();
					}
				});
			}
			this.setStatus("ready", t("statusReady"));
		} else {
			if (this.statusEl) {
				this.statusEl.detach();
				this.statusEl = null;
			}
			this.hideUndoStatus();
			this.hideAcceptStatus();
			this.lastSuggestion = null;
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

		el.removeClass("is-idle", "is-busy", "is-ok", "is-warn", "is-error");
		el.addClass(`is-${kind}`);
		if (kind === "ready") el.addClass("is-idle");
		el.empty();

		const dot = el.createSpan({ cls: "jev-dot jev-ink" });
		// 分类色只写进 --jev-cat，由 CSS 按主题折算；未提供时用 :root 的中性默认值
		if (color) dot.style.setProperty("--jev-cat", color);
		// 就绪态只留「JEV」；结果态直接显示内容（不再有常驻「JEV ·」前缀）
		el.createSpan({ cls: "jev-status-text", text: kind === "ready" ? "JEV" : text });
		el.createSpan({ cls: "jev-hint", text: t("statusHint") });

		if ((kind === "ok" || kind === "warn" || kind === "error") && this.settings.statusBarClearMs > 0) {
			this.statusTimer = window.setTimeout(() => this.setStatus("ready", t("statusReady")), this.settings.statusBarClearMs);
		}
	}

	/** 成功移动后在 statusBarClearMs 窗口内提供独立的「撤销」入口 */
	private showUndoStatus(): void {
		if (!this.settings.statusBarEnabled) return;

		if (!this.undoStatusEl) {
			const el = this.addStatusBarItem();
			el.addClass("jev-status", "jev-undo");
			el.setAttribute("role", "button");
			el.setAttribute("tabindex", "0");
			el.setAttribute("aria-label", t("ariaUndo"));
			el.setText(t("undoLabel"));
			const activate = () => void this.undoLast();
			el.addEventListener("click", activate);
			el.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					activate();
				}
			});
			this.undoStatusEl = el;
		}

		if (this.undoStatusTimer !== null) window.clearTimeout(this.undoStatusTimer);
		const windowMs = this.settings.statusBarClearMs > 0 ? this.settings.statusBarClearMs : 12000;
		this.undoStatusTimer = window.setTimeout(() => this.hideUndoStatus(), windowMs);
	}

	private hideUndoStatus(): void {
		if (this.undoStatusTimer !== null) {
			window.clearTimeout(this.undoStatusTimer);
			this.undoStatusTimer = null;
		}
		if (this.undoStatusEl) {
			this.undoStatusEl.detach();
			this.undoStatusEl = null;
		}
	}

	/**
	 * 建议模式下：在 statusBarClearMs 窗口内提供独立的「接受」入口。
	 * 与撤销项同一套模式：创建/显示/detach/置 null，不允许节点残留。
	 */
	private showAcceptStatus(ariaLabel: string): void {
		if (!this.settings.statusBarEnabled) return;

		if (!this.acceptStatusEl) {
			const el = this.addStatusBarItem();
			el.addClass("jev-status", "jev-accept");
			el.setAttribute("role", "button");
			el.setAttribute("tabindex", "0");
			el.setText(t("acceptLabel"));
			const activate = () => void this.acceptSuggestion();
			el.addEventListener("click", activate);
			el.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					activate();
				}
			});
			this.acceptStatusEl = el;
		}
		this.acceptStatusEl.setAttribute("aria-label", ariaLabel);

		if (this.acceptStatusTimer !== null) window.clearTimeout(this.acceptStatusTimer);
		const windowMs = this.settings.statusBarClearMs > 0 ? this.settings.statusBarClearMs : 12000;
		this.acceptStatusTimer = window.setTimeout(() => this.hideAcceptStatus(), windowMs);
	}

	private hideAcceptStatus(): void {
		if (this.acceptStatusTimer !== null) {
			window.clearTimeout(this.acceptStatusTimer);
			this.acceptStatusTimer = null;
		}
		if (this.acceptStatusEl) {
			this.acceptStatusEl.detach();
			this.acceptStatusEl = null;
		}
	}

	/** 一键接受建议：用户亲手点的接受等同人工确认，直接移动（复用 moveFileTo 的已移动状态 + 撤销项） */
	private async acceptSuggestion(): Promise<void> {
		const suggestion = this.lastSuggestion;
		if (!suggestion) return;
		this.lastSuggestion = null;
		this.hideAcceptStatus();

		const file = this.app.vault.getAbstractFileByPath(suggestion.file.path);
		if (!(file instanceof TFile)) {
			new Notice(t("noticeNoteMissing"), 6000);
			return;
		}
		const result = await this.moveFileTo(file, suggestion.decision.targetFolder);

		// 接受移动后回写判断块为「已移动」，不留「（未移动）」的旧结论
		if (result?.moved && this.settings.blockEnabled) {
			const moved = this.app.vault.getAbstractFileByPath(result.toPath);
			if (moved instanceof TFile) {
				try {
					const block = buildRouteBlock(suggestion.decision, this.settings, { moved: true });
					this.beginSelfWrite();
					await this.app.vault.process(moved, (data) =>
						upsertRouteBlock(data, block, this.settings.blockPlacement)
					);
				} catch {
					// 回写失败不影响移动结果
				}
			}
		}
	}

	/** 当前文件是否已在目标文件夹里（无需移动） */
	private isAlreadyAtTarget(currentPath: string, targetFolder: string): boolean {
		const at = normalizeFolder(currentPath);
		const goal = normalizeFolder(targetFolder);
		if (goal === "") return !at.includes("/");
		return at === goal || at.startsWith(`${goal}/`);
	}

	// ---------------------------------------------------------------- 命令

	private registerCommands(): void {
		this.addCommand({
			id: "route-current-note",
			name: t("cmdRouteSuggest"),
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) void this.runRoute(file, { force: true, suggest: true });
				return true;
			},
		});

		this.addCommand({
			id: "route-current-note-move",
			name: t("cmdRouteMove"),
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) void this.runRoute(file, { force: true, suggest: false });
				return true;
			},
		});

		this.addCommand({
			id: "analyze-current-note",
			name: t("cmdJudgeOnly"),
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) void this.runRoute(file, { dryRun: true, force: true });
				return true;
			},
		});

		this.addCommand({
			id: "scan-inbox",
			name: t("cmdScanInbox"),
			callback: () => void this.scanInbox(),
		});

		this.addCommand({
			id: "accept-last-suggestion",
			name: t("cmdAcceptLast"),
			checkCallback: (checking) => {
				if (!this.lastSuggestion) return false;
				if (!checking) void this.acceptSuggestion();
				return true;
			},
		});

		this.addCommand({
			id: "undo-last-route",
			name: t("cmdUndoLast"),
			callback: () => void this.undoLast(),
		});

		this.addCommand({
			id: "show-last-decision",
			name: t("cmdShowDecision"),
			callback: () => this.showLastDecision(),
		});

		this.addCommand({
			id: "toggle-auto-route",
			name: t("cmdToggleAutoRoute"),
			callback: async () => {
				this.settings.autoRouteEnabled = !this.settings.autoRouteEnabled;
				await this.persist();
				new Notice(this.settings.autoRouteEnabled ? t("noticeAutoRouteOn") : t("noticeAutoRouteOff"));
				this.setStatus(
					this.settings.autoRouteEnabled ? "ok" : "ready",
					this.settings.autoRouteEnabled ? t("statusAutoRouteOn") : t("statusAutoRouteOff")
				);
			},
		});
	}

	private registerMenus(): void {
		const addItems = (menu: Menu, file: TFile) => {
			menu.addItem((item) =>
				item
					.setTitle(t("menuSuggest"))
					.setIcon("inbox")
					.onClick(() => void this.runRoute(file, { force: true, suggest: true }))
			);
			menu.addItem((item) =>
				item
					.setTitle(t("menuJudgeOnly"))
					.setIcon("search")
					.onClick(() => void this.runRoute(file, { dryRun: true, force: true }))
			);
			menu.addItem((item) =>
				item
					.setTitle(t("menuMoveTo"))
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
			// 开了「自动分流前确认」时，这里只判断并弹窗，是否移动交给用户在弹窗里决定。
			void this.runRoute(current, {
				quiet: true,
				dryRun: this.settings.autoRouteRequireConfirm,
			});
		}, this.settings.autoRouteDelayMs);

		this.timers.set(file.path, timer);
	}

	// ------------------------------------------------------------ 主流程

	private async runRoute(
		file: TFile,
		options: {
			dryRun?: boolean;
			force?: boolean;
			/** 自动触发时更安静：不弹通知，只更新状态栏与弹窗 */
			quiet?: boolean;
			/**
			 * 建议/移动模式的显式指定：
			 * true  = 判断后不动文件，状态栏给建议 + 一键接受；
			 * false = 判断达标后直接移动（v0.1 行为）；
			 * 省略  = 按设置 moveOnJudge 决定（默认建议模式）。
			 */
			suggest?: boolean;
		} = {}
	): Promise<RouteResult | null> {
		if (this.busy.has(file.path)) return null;

		if (!this.settings.apiKey.trim()) {
			this.setStatus("error", t("statusMissingKey"));
			new Notice(t("noticeMissingKey"), 8000);
			return null;
		}

		// 新判断产生时，先清掉上一次的接受项与撤销项，避免状态栏残留旧建议
		const suggestionMode =
			options.dryRun !== true && (options.suggest ?? !this.settings.moveOnJudge);
		this.lastSuggestion = null;
		this.hideAcceptStatus();
		this.hideUndoStatus();

		this.busy.add(file.path);
		this.suppressUntil = Date.now() + 5000;
		this.setStatus("busy", t("statusAnalyzing", { name: file.basename }));

		try {
			if (!options.force) {
				const raw = await this.app.vault.cachedRead(file);
				if (this.router.tooShort(raw, this.settings.minChars)) {
					this.setStatus("ready", t("statusTooShort"));
					return null;
				}
			}

			const result = await this.router.route(file, {
				dryRun: options.dryRun,
				force: options.force,
				// 建议模式：只判断不动文件（判断块 / frontmatter 照常写，结果照常进缓存）
				allowMove: suggestionMode ? false : undefined,
			});

			const after = this.app.vault.getAbstractFileByPath(result.toPath);
			this.lastResult = {
				result,
				file: after instanceof TFile ? after : file,
			};
			this.report(result, options, suggestionMode);
			return result;
		} catch (error) {
			const message = error instanceof JevError ? error.message : String(error);
			this.setStatus("error", t("statusJudgeFailed"));
			if (!options.quiet) new Notice(t("noticeJudgeFailed", { message }), 12000);
			else console.error("[jev-inbox-router]", error);
			return null;
		} finally {
			this.busy.delete(file.path);
			this.suppressUntil = Date.now() + 2500;
		}
	}

	private report(
		result: RouteResult,
		options: { dryRun?: boolean; quiet?: boolean },
		suggestionMode: boolean
	): void {
		const d = result.decision;

		if (options.dryRun) {
			const category = this.settings.categories.find((c) => c.key === d.categoryKey);
			this.setStatus(
				"ok",
				`${category?.short ?? d.categoryLabel} ${Math.round(d.confidence * 100)}%`,
				category?.color
			);
			this.showDecisionModal(result);
			return;
		}

		// 建议模式：不动文件，状态栏给建议 + 一键接受
		if (suggestionMode && !result.moved) {
			this.reportSuggestion(result);
			return;
		}

		const view = statusViewForRoute({
			decision: d,
			settings: this.settings,
			moved: result.moved,
			blockedReason: result.blockedReason,
		});
		this.setStatus(view.kind, view.text, view.color);
		// 自动分流（quiet）也要有就地退路：先挂上撤销入口，再决定是否发通知
		if (result.moved) this.showUndoStatus();

		if (options.quiet) return;

		if (result.moved) {
			new Notice(
				t("noticeRouted", {
					key: d.categoryKey,
					label: d.categoryLabel,
					pct: Math.round(d.confidence * 100),
					folder: d.targetFolder || t("vaultRoot"),
				}),
				5000
			);
		} else if (result.blockedReason) {
			new Notice(t("noticeMarkedOnly", { reason: result.blockedReason }), 8000);
		}
	}

	/** 建议模式的结果呈现：目标 ≠ 当前位置时给建议 + 接受项；已在目标位置则只提示 */
	private reportSuggestion(result: RouteResult): void {
		const d = result.decision;
		const file = this.lastResult?.file ?? null;
		const currentPath = result.toPath || file?.path || "";

		if (this.isAlreadyAtTarget(currentPath, d.targetFolder)) {
			this.lastSuggestion = null;
			this.hideAcceptStatus();
			const view = statusViewForSuggestion({
				decision: d,
				settings: this.settings,
				currentPath,
			});
			this.setStatus(view.kind, view.text, view.color);
			return;
		}

		const view = statusViewForSuggestion({ decision: d, settings: this.settings });
		this.setStatus(view.kind, view.text, view.color);
		if (file) {
			this.lastSuggestion = { decision: d, file };
			this.showAcceptStatus(t("ariaAccept", { folder: d.targetFolder || t("vaultRoot") }));
		}
	}

	private async moveFileTo(file: TFile, folder: string, quiet = false): Promise<RouteResult | null> {
		this.busy.add(file.path);
		this.suppressUntil = Date.now() + 5000;
		try {
			const fromPath = file.path;
			const target = await this.router.moveTo(file, folder);
			const decision: RouterDecision = this.lastResult?.result.decision ?? {
				categoryKey: t("manualKey"),
				categoryLabel: t("manualLabel"),
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
				this.setStatus("ok", t("statusMovedTo", { folder: folder || t("vaultRoot") }));
				this.showUndoStatus();
				if (!quiet) new Notice(t("noticeMovedTo", { folder: folder || t("vaultRoot") }));
			} else {
				this.setStatus("ready", t("statusAlreadyAtTarget"));
			}
			return result;
		} catch (error) {
			this.setStatus("error", t("statusMoveFailed"));
			new Notice(
				t("noticeMoveFailed", {
					message: error instanceof Error ? error.message : String(error),
				}),
				8000
			);
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
			new Notice(t("noticeInboxEmpty", { folders: folders.join(" / ") }), 6000);
			return;
		}

		const notice = new Notice("", 0);
		let index = 0;
		let moved = 0;
		let suggested = 0;
		let blocked = 0;
		let failed = 0;
		let skipped = 0;
		// 建议模式下批量扫描只判断不移动（runRoute 按 moveOnJudge 自动进入建议流）
		const suggestionMode = !this.settings.moveOnJudge;

		for (const file of files) {
			index++;
			notice.setMessage(t("noticeScanProgress", { index, total: files.length, path: file.path }));
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
			const result = await this.runRoute(current, { quiet: true });
			if (!result) failed++;
			else if (result.moved) moved++;
			else if (suggestionMode) suggested++;
			else blocked++;
			await new Promise((resolve) => window.setTimeout(resolve, 150));
		}

		notice.hide();
		new Notice(
			suggestionMode
				? t("noticeScanSuggest", {
						total: index,
						suggested,
						skipped,
						failed,
					})
				: t("noticeScanMoved", {
						total: index,
						moved,
						marked: blocked,
						skipped,
						failed,
					}),
			9000
		);
		this.setStatus(
			"ok",
			suggestionMode
				? t("statusScanSuggest", { count: suggested })
				: t("statusScanMoved", { count: moved })
		);
	}

	// ---------------------------------------------------------------- 撤销

	private async undoLast(): Promise<void> {
		const entry = this.undoStack.pop();
		if (!entry) {
			new Notice(t("noticeNothingToUndo"), 6000);
			return;
		}
		this.suppressUntil = Date.now() + 4000;
		const ok = await this.router.undo(entry);
		if (ok) {
			new Notice(t("noticeUndone", { path: entry.path, previousPath: entry.previousPath }), 6000);
			this.setStatus("ok", t("statusUndone"));
		} else {
			new Notice(t("noticeUndoFailed", { path: entry.path }), 8000);
			this.setStatus("error", t("statusUndoFailed"));
		}
		// 无论成败都立刻收起撤销入口，不依赖 12s 定时器回收
		this.hideUndoStatus();
		void this.persist();
	}

	// ------------------------------------------------------------ 详情弹窗

	showLastDecision(): void {
		if (!this.lastResult) {
			new Notice(t("noticeNoDecisionYet"), 5000);
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
					new Notice(t("noticeBlockRemoved"));
				},
			},
			file
		).open();
	}
}
