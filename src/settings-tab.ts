import {
	App,
	Menu,
	Notice,
	PluginSettingTab,
	Setting,
	setIcon,
	requireApiVersion,
} from "obsidian";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, JEV_ENDPOINT, MAX_CATEGORIES } from "./constants";
import { t } from "./i18n";
import { JevError } from "./jev-client";
import { ConfirmModal } from "./modals";
import { ORGANIZATION_PRESETS, presetById, remapPresetKeys } from "./presets";
import {
	createDeclarativeSink,
	deepCopy,
	createImperativeSink,
	sectionHeading,
	SECTION_KEYS,
} from "./settings-definitions";
import type { RowSink } from "./settings-definitions";
import type { SettingDefinitionItem } from "obsidian";
import type { CategoryConfig, JevSettings } from "./types";
import type { PresetDefinition } from "./presets";
import type JevInboxRouterPlugin from "./main";

/** 节末 ⋯ 菜单里的一项 */
interface OverflowItem {
	title: string;
	icon: string;
	onClick: () => void | Promise<void>;
}

/** 给下拉框补上「库里已有文件夹 + 当前值」 */
function folderOptions(current: string, folders: string[]): Record<string, string> {
	const options: Record<string, string> = { "": t("rootParens") };
	for (const f of folders) options[f] = f;
	if (current && !(current in options)) options[current] = `${current}${t("folderMissing")}`;
	return options;
}

export class JevSettingTab extends PluginSettingTab {
	private draft: JevSettings;
	private folders: string[] = [];
	private expanded = new Set<string>();
	/** 组织方式：当前点选的预设（只是高亮，不生效；应用由「应用」按钮统一触发） */
	private selectedPresetId: string | null = null;
	/** 组织方式：应用方式（替换 / 追加），会话内记忆 */
	private applyMode: "replace" | "append" = "replace";
	/** 组织方式：应用时是否预建预设的文件夹 */
	private applyCreateFolders = true;

	constructor(app: App, private readonly plugin: JevInboxRouterPlugin) {
		super(app, plugin);
		this.draft = plugin.settings;
	}

	/**
	 * 声明式设置定义（Obsidian 1.13+）。
	 *
	 * 1.13+ 由 Obsidian 自己渲染这些定义，并把每一项登记进**设置搜索**
	 * （用户在设置里搜「分类」「阈值」能直接定位到本插件）。
	 * 没有它，本插件的设置在 1.13+ 的搜索里**完全不出现** ——
	 * Obsidian 商店审查把这条列为 Warning。
	 *
	 * 与旧版路径的关系：**跑的是同一批节实现**（都经过 {@link RowSink}），
	 * 所以不会出现「1.13+ 有、旧版没有」的不一致。
	 * 见 src/settings-definitions.ts 的说明。
	 *
	 * 商店审查的两条硬约束在这里落地：
	 *   - 分组标题不含插件名（`sectionHeading` 的注释）
	 *   - 不用 `createEl("h2"/"h3")` 造标题（声明式由 Obsidian 渲染分组标题）
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const sink = createDeclarativeSink();

		// 命令式路径的 `renderImperative()` 做两件这里也必须做的事：
		//
		// 1. **同步草稿与文件夹列表**。`this.draft` 与 `this.folders` 是
		//    命令式渲染的输入；声明式路径的 render 回调同样要读它们。
		//    此前只有 renderImperative() 赋值，1.13+ 上这两个字段
		//    一直是构造时的初值 —— 分类卡片里的「目标文件夹」下拉框
		//    因此只剩一个空选项，用户选不了任何真实文件夹。
		// 2. **给容器加 `jev-settings` 类**。CSS 里的 `.jev-settings …`
		//    规则（平板断点下的堆叠布局、控件宽度）全都以这个类为前提；
		//    1.13+ 上没有它，响应式布局整个失效。
		this.draft = this.plugin.settings;
		this.folders = this.plugin.router.getAllFolders();
		this.containerEl.addClass("jev-settings");

		// 3. **开场说明**。命令式路径在第一行之前有一段 `jev-intro`
		//    （说明 JEV 只做分类与投递、不改写内容）。
		//    1.13+ 上没有它 —— 用户看不到这段定位说明，
		//    而它正是设置页要回答的第一个问题（这插件会动我的内容吗）。
		sink.topBlock(
			"settingsIntro",
			(root) => {
				root.createEl("p", {
					cls: "jev-intro",
					text: t("settingsIntro"),
				});
			},
			"jev-intro-row"
		);

		sink.heading(SECTION_KEYS.api);
		this.renderApiSection(sink);

		sink.heading(SECTION_KEYS.organization);
		this.renderOrganizationSection(sink);

		sink.heading(SECTION_KEYS.categories);
		this.renderCategorySection(sink);

		sink.heading(SECTION_KEYS.auto);
		this.renderAutoSection(sink);

		sink.heading(SECTION_KEYS.block);
		this.renderBlockSection(sink);

		sink.heading(SECTION_KEYS.statusBar);
		this.renderStatusSection(sink);

		sink.heading(SECTION_KEYS.maintenance);
		this.renderMaintenanceSection(sink);

		return sink.groups;
	}

	/**
	 * 旧版命令式渲染入口（Obsidian 1.5.0–1.12）。
	 *
	 * 1.13+ 一旦 {@link getSettingDefinitions} 返回非空数组，Obsidian 就完全绕过
	 * 这个方法，改为按声明式定义渲染并把每一项登记进「设置搜索」。
	 * 两条路径共存、不会重复渲染。
	 *
	 * 方法体放在 {@link renderImperative} 里，是为了让刷新路径可以重画而不必
	 * 调用 `this.display()` —— `display()` 在 1.13+ 的类型定义里标了 `@deprecated`，
	 * 而官方 eslint 插件禁止用屏蔽注释压掉这条告警
	 * （`eslint-comments/no-restricted-disable`）。
	 * 官方规则 `obsidianmd/settings-tab/require-display` 也要求在
	 * minAppVersion < 1.13.0 时保留 display() —— 本插件的 minAppVersion 是 1.5.0。
	 *
	 * 与同 fleet 的 obsidian-folio、obsidian-media-speed-enhancer 同一套模式。
	 */
	display(): void {
		this.renderImperative();
	}

	/**
	 * 重画设置页。
	 *
	 * 两条渲染路径要用不同的调用：
	 *   - Obsidian 1.13+：声明式树由框架持有，重调 `display()` 不生效，
	 *     必须用官方刷新 API `update()`。
	 *   - Obsidian 1.13 以下：命令式渲染器就是渲染器本身，得重跑。
	 *
	 * `requireApiVersion` 是 Obsidian 官方的运行时特性探测，
	 * 即使构建时的类型定义更旧也能正确判断。
	 */
	private refresh(): void {
		if (requireApiVersion("1.13.0")) {
			this.update();
		} else {
			this.renderImperative();
		}
	}

	/**
	 * 命令式渲染本体（Obsidian 1.5.0–1.12）。
	 *
	 * 与声明式路径**共用同一批节实现**（都经过 {@link RowSink}），
	 * 所以不会出现「1.13+ 有、旧版没有」的不一致。
	 */
	private renderImperative(): void {
		const { containerEl } = this;
		this.draft = this.plugin.settings;
		this.folders = this.plugin.router.getAllFolders();
		containerEl.empty();
		containerEl.addClass("jev-settings");

		const sink = createImperativeSink(containerEl);

		// 开场说明走 sink.block —— 与声明式路径同一个块名，
		// 两条路径的行集合才能对上（双轨一致性断言依赖这一点）。
		sink.block("settingsIntro", (root) => {
			root.createEl("p", {
				cls: "jev-intro",
				text: t("settingsIntro"),
			});
		});

		// 分组标题：命令式路径下没有声明式的 group 概念，
		// 所以自己用 setHeading() 画一条。标题文本来自同一个 sectionHeading()，
		// 两边一致。
		new Setting(containerEl).setName(sectionHeading(SECTION_KEYS.api)).setHeading();
		this.renderApiSection(sink);

		new Setting(containerEl).setName(sectionHeading(SECTION_KEYS.organization)).setHeading();
		this.renderOrganizationSection(sink);

		new Setting(containerEl).setName(sectionHeading(SECTION_KEYS.categories)).setHeading();
		this.renderCategorySection(sink);

		new Setting(containerEl).setName(sectionHeading(SECTION_KEYS.auto)).setHeading();
		this.renderAutoSection(sink);

		new Setting(containerEl).setName(sectionHeading(SECTION_KEYS.block)).setHeading();
		this.renderBlockSection(sink);

		new Setting(containerEl).setName(sectionHeading(SECTION_KEYS.statusBar)).setHeading();
		this.renderStatusSection(sink);

		new Setting(containerEl).setName(sectionHeading(SECTION_KEYS.maintenance)).setHeading();
		this.renderMaintenanceSection(sink);
	}

	private async commit(): Promise<void> {
		await this.plugin.saveSettings(this.draft);
	}

	/** 把一个 ⋯ 图标按钮挂到设置项右侧，用来收纳同类动作 */
	private addOverflowButton(setting: Setting, items: OverflowItem[]): void {
		setting.addExtraButton((b) => {
			b.setIcon("more-horizontal").setTooltip(t("moreActions"));
			b.extraSettingsEl.addClass("jev-more-btn");
			b.extraSettingsEl.setAttribute("aria-label", t("moreActions"));
			b.onClick(() => {
				const menu = new Menu();
				for (const it of items) {
					menu.addItem((item) =>
						item
							.setTitle(it.title)
							.setIcon(it.icon)
							.onClick(() => void it.onClick())
					);
				}
				const rect = b.extraSettingsEl.getBoundingClientRect();
				menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
			});
		});
	}

	// ------------------------------------------------------------- JEV 接口
	private renderApiSection(sink: RowSink): void {
		sink.row("API Key", t("apiKeyDesc"), (setting) => {
			setting.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.addClass("text-input", "jev-wide-input");
				text.setPlaceholder(t("apiKeyPlaceholder"))
					.setValue(this.draft.apiKey)
					.onChange(async (v) => {
						this.draft.apiKey = v.trim();
						await this.commit();
					});
			});
		});

		sink.row(t("settingEndpoint"), t("endpointDesc", { endpoint: JEV_ENDPOINT }), (setting) => {
			setting.addText((text) => {
				text.inputEl.addClass("text-input");
				text.setPlaceholder(JEV_ENDPOINT)
					.setValue(this.draft.apiUrl)
					.onChange(async (v) => {
						this.draft.apiUrl = v.trim() || JEV_ENDPOINT;
						await this.commit();
					});
			});
		});

		sink.row(t("settingModel"), t("modelDesc"), (setting) => {
			setting.addText((text) => {
				text.inputEl.addClass("text-input");
				text.setPlaceholder("jev-latest")
					.setValue(this.draft.model)
					.onChange(async (v) => {
						this.draft.model = v.trim() || "jev-latest";
						await this.commit();
					});
			});
		});

		sink.row(t("settingTestConnection"), t("testConnectionDesc"), (setting) => {
			setting.addButton((b) =>
				b.setButtonText(t("btnTest")).onClick(async () => {
					b.setDisabled(true).setButtonText(t("btnTesting"));
					try {
						const enabled = this.draft.categories.filter((c) => c.enabled);
						const decision = await this.plugin
							.getClient()
							.classify(
								{
									title: t("testSampleTitle"),
									path: t("testSamplePath"),
									content: t("testSampleContent"),
								},
								this.draft.categories,
								{ lowValueEnabled: this.draft.lowValueEnabled }
							);
						new Notice(
							t("testOk", {
								key: decision.categoryKey,
								label: decision.categoryLabel,
								pct: Math.round(decision.confidence * 100),
								folder: decision.targetFolder || t("vaultRoot"),
								model: decision.model,
							}),
							8000
						);
						if (enabled.length < 2) {
							new Notice(t("testFewCategories"), 6000);
						}
					} catch (error) {
						const message = error instanceof JevError ? error.message : String(error);
						new Notice(t("testFailed", { message }), 12000);
					} finally {
						b.setDisabled(false).setButtonText(t("btnTest"));
					}
				})
			);
		});
	}

	// ------------------------------------------------------------- 组织方式
	private renderOrganizationSection(sink: RowSink): void {
		sink.block("presetList", (root) => {
			root.createEl("p", {
				cls: "jev-hint",
				text: t("orgHint"),
			});

			// ---- 预设选择：真按钮行，点选只高亮，不立即生效 ----
			const list = root.createDiv({ cls: "jev-preset-list" });
			for (const preset of ORGANIZATION_PRESETS) {
				const selected = this.selectedPresetId === preset.id;
				const row = list.createEl("button", {
					cls: "jev-row jev-preset-row",
					attr: { type: "button" },
				});
				row.setAttribute("aria-pressed", String(selected));
				if (selected) row.addClass("is-selected");

				// 左侧圆点用该预设第一个分类的色，走 --jev-cat 按主题折算
				const dot = row.createSpan({ cls: "jev-dot jev-ink" });
				dot.style.setProperty("--jev-cat", preset.categories[0]?.color ?? "#7F8C99");

				const main = row.createSpan({ cls: "jev-preset-main" });
				main.createSpan({ cls: "jev-preset-name", text: preset.name });
				main.createSpan({ cls: "jev-preset-desc", text: preset.description });

				const meta = row.createSpan({
					cls: "jev-preset-meta",
					text: t("presetMeta", { count: preset.categories.length, folder: preset.inboxFolder }),
				});
				meta.setAttribute(
					"title",
					preset.categories
						.map((c) => `${c.key} ${c.label} → ${c.folder || t("vaultRoot")}`)
						.join("\n")
				);

				row.addEventListener("click", () => {
					this.selectedPresetId = preset.id;
					this.refresh();
				});
			}
		});

		// ---- 应用方式 ----
		sink.row(t("settingApplyMode"), t("applyModeDesc"), (setting) => {
			setting
				.addDropdown((d) =>
					d
						.addOptions({ replace: t("optionReplace"), append: t("optionAppend") })
						.setValue(this.applyMode)
						.onChange((v) => {
							this.applyMode = v === "append" ? "append" : "replace";
						})
				)
				.addToggle((toggle) => {
					toggle.setValue(this.applyCreateFolders).onChange((v) => {
						this.applyCreateFolders = v;
					});
					toggle.toggleEl.setAttribute("aria-label", t("ariaCreateFolders"));
					toggle.toggleEl.setAttribute("title", t("ariaCreateFolders"));
					return toggle;
				});
		});

		// ---- 应用（本节唯一 CTA）+ 还原 ----
		const preset = this.selectedPresetId ? presetById(this.selectedPresetId) : undefined;
		sink.row(
			preset ? t("applyBarWithPreset", { name: preset.name }) : t("applyBarName"),
			preset ? t("applyBarDescConfirm") : t("applyBarDescPick"),
			(setting) => {
				setting.addButton((b) =>
					b
						.setButtonText(t("btnApplyPreset"))
						.setCta()
						.setDisabled(!preset)
						.onClick(() => {
							if (preset) this.confirmApplyPreset(preset);
						})
				);

				if (this.draft.previousCategories && this.draft.previousCategories.length > 0) {
					setting.addButton((b) =>
						b
							.setButtonText(t("btnRestorePrevious"))
							.onClick(() => this.confirmRestorePrevious())
					);
				}
		});
	}

	/** 应用预设前，把文件夹清单写进确认文案（含 index 目录，去重） */
	private presetFolderList(preset: PresetDefinition): string[] {
		const paths = new Set<string>();
		if (preset.inboxFolder.trim()) paths.add(preset.inboxFolder);
		for (const c of preset.categories) {
			if (c.folder.trim()) paths.add(c.folder);
		}
		return [...paths];
	}

	private confirmApplyPreset(preset: PresetDefinition): void {
		const replace = this.applyMode === "replace";
		const existingCount = this.draft.categories.length;
		const preview = preset.categories
			.map((c) => `${c.key} ${c.label} → ${c.folder || t("vaultRoot")}`)
			.join("；");

		const lines: string[] = replace
			? [
					t("applyReplaceLine1", { count: preset.categories.length, name: preset.name, preview }),
					t("applyReplaceLine2", { count: existingCount }),
				]
			: [
					t("applyAppendLine", {
						name: preset.name,
						count: preset.categories.length,
						existing: existingCount,
						total: existingCount + preset.categories.length,
					}),
				];
		if (this.applyCreateFolders) {
			lines.push(t("applyCreateFoldersLine", { folders: this.presetFolderList(preset).join("、") }));
		}
		lines.push(t("applyIndexLine", { folder: preset.inboxFolder }));

		new ConfirmModal(this.app, {
			title: replace
				? t("applyConfirmTitleReplace", { name: preset.name })
				: t("applyConfirmTitleAppend", { name: preset.name }),
			body: lines.join(""),
			confirmText: replace ? t("confirmReplace") : t("confirmAppend"),
			onConfirm: async () => {
				if (replace) {
					// 快照先行：存完再整体替换
					this.draft.previousCategories = deepCopy(this.draft.categories);
					this.draft.categories = preset.categories.map((c) => deepCopy(c));
				} else {
					const total = this.draft.categories.length + preset.categories.length;
					if (total > MAX_CATEGORIES) {
						new Notice(
							t("noticeAppendOverLimit", { total, max: MAX_CATEGORIES })
						);
						return;
					}
					const taken = new Set(this.draft.categories.map((c) => c.key));
					this.draft.categories = [
						...this.draft.categories,
						...remapPresetKeys(preset.categories, taken),
					];
				}
				if (this.applyCreateFolders) await this.createPresetFolders(preset);
				// index 目录与多收件箱保持同步
				this.draft.indexFolder = preset.inboxFolder;
				this.draft.inboxFolders = [preset.inboxFolder];
				await this.commit();
				this.selectedPresetId = null;
				this.refresh();
				new Notice(
					replace
						? t("noticePresetReplaced", { name: preset.name })
						: t("noticePresetAppended", { name: preset.name })
				);
			},
		}).open();
	}

	/** 预建预设的文件夹：已存在则跳过；单个失败只提示，不中断整体应用 */
	private async createPresetFolders(preset: PresetDefinition): Promise<void> {
		for (const path of this.presetFolderList(preset)) {
			try {
				await this.plugin.router.ensureFolder(path);
			} catch (error) {
				new Notice(
					t("errCreateFolder", {
						path,
						message: error instanceof Error ? error.message : String(error),
					})
				);
			}
		}
	}

	private confirmRestorePrevious(): void {
		const snapshot = this.draft.previousCategories;
		if (!snapshot || snapshot.length === 0) return;
		new ConfirmModal(this.app, {
			title: t("restorePreviousTitle"),
			body: t("restorePreviousBody", {
				snapshot: snapshot.length,
				current: this.draft.categories.length,
			}),
			confirmText: t("confirmRestore"),
			onConfirm: async () => {
				this.draft.categories = deepCopy(snapshot);
				this.draft.previousCategories = null;
				await this.commit();
				this.refresh();
				new Notice(t("noticeRestored"));
			},
		}).open();
	}

	// --------------------------------------------------------- 分类与去向
	private renderCategorySection(sink: RowSink): void {
		sink.block("categoryList", (root) => {
			root.createEl("p", {
				cls: "jev-hint",
				text: t("categoriesHint"),
			});

			const wrap = root.createDiv({ cls: "jev-cat-list" });
			this.draft.categories.forEach((cat, index) => {
				this.renderCategoryCard(wrap, cat, index);
			});
		});

		sink.block("categoryActions", (root) => {
			const bar = new Setting(root);
			bar.addButton((b) =>
				b.setButtonText(t("btnAddCategory")).onClick(async () => {
					if (this.draft.categories.length >= MAX_CATEGORIES) {
						new Notice(t("noticeMaxCategories", { max: MAX_CATEGORIES }));
						return;
					}
					const used = new Set(this.draft.categories.map((c) => c.key));
					const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
					const key = alphabet.find((k) => !used.has(k)) ?? `K${Date.now() % 1000}`;
					this.draft.categories.push({
						key,
						label: t("newCategoryName"),
						short: t("newCategoryName"),
						description: "",
						folder: "",
						tag: "",
						enabled: true,
						color: "#7F8C99",
					});
					this.expanded.add(key);
					await this.commit();
					this.refresh();
				})
			);
			this.addOverflowButton(bar, [
				{
					title: t("overflowResetAll"),
					icon: "rotate-ccw",
					onClick: () => this.confirmResetCategories(),
				},
				{
					title: t("overflowResetNames"),
					icon: "type",
					onClick: () => this.confirmResetNames(),
				},
			]);
		});
	}

	private confirmResetCategories(): void {
		new ConfirmModal(this.app, {
			title: t("resetCategoriesTitle"),
			body: t("resetCategoriesBody"),
			confirmText: t("confirmResetCategories"),
			onConfirm: async () => {
				this.draft.categories = deepCopy(DEFAULT_CATEGORIES);
				this.expanded.clear();
				await this.commit();
				this.refresh();
				new Notice(t("noticeResetCategories"));
			},
		}).open();
	}

	private confirmResetNames(): void {
		new ConfirmModal(this.app, {
			title: t("resetNamesTitle"),
			body: t("resetNamesBody"),
			confirmText: t("confirmResetNames"),
			onConfirm: async () => {
				for (const def of DEFAULT_CATEGORIES) {
					const mine = this.draft.categories.find((c) => c.key === def.key);
					if (mine) {
						mine.label = def.label;
						mine.short = def.short;
						mine.description = def.description;
					}
				}
				await this.commit();
				this.refresh();
				new Notice(t("noticeResetNames"));
			},
		}).open();
	}

	private renderCategoryCard(wrap: HTMLElement, cat: CategoryConfig, index: number): void {
		const card = wrap.createDiv({ cls: "jev-cat-card" });
		if (!cat.enabled) card.addClass("is-disabled");
		const isOpen = this.expanded.has(cat.key);
		const bodyId = `jev-cat-body-${cat.key}`;

		// ---- 头部 ----
		// 注意：头部不能做成整行 <button>（行内含输入控件与开关，嵌套控件是无效 HTML），
		// 因此用一个独立的 chevron 按钮承担展开 / 折叠。
		const head = card.createDiv({ cls: "jev-cat-head" });

		const chev = head.createEl("button", { cls: "jev-chev-btn", attr: { type: "button" } });
		if (isOpen) chev.addClass("is-open");
		chev.setAttribute("aria-expanded", String(isOpen));
		if (isOpen) chev.setAttribute("aria-controls", bodyId);
		chev.setAttribute(
			"aria-label",
			`${isOpen ? t("collapse") : t("expand")} ${cat.key} ${cat.label}`
		);
		setIcon(chev, "chevron-right");
		chev.addEventListener("click", () => {
			if (this.expanded.has(cat.key)) this.expanded.delete(cat.key);
			else this.expanded.add(cat.key);
			this.refresh();
		});

		const dot = head.createSpan({ cls: "jev-dot jev-ink" });
		// 禁用态不写 inline --jev-cat，让它回落到 :root 的中性默认色。
		// 之前是在 CSS 里用 `--jev-cat: var(--text-faint) !important` 覆盖
		// inline 值 —— inline style 的优先级高于任何样式表规则，不用
		// !important 根本覆盖不掉；而 !important 又会被 Obsidian 商店审查
		// 警告。移除 inline 属性是唯一干净的做法（inline 优先级最低）。
		if (cat.enabled) {
			dot.style.setProperty("--jev-cat", cat.color);
		}

		const keyEl = head.createSpan({ cls: "jev-cat-key", text: cat.key });
		keyEl.setAttribute("title", t("catKeyTooltip"));

		const labelInput = head.createEl("input", {
			cls: "text-input jev-cat-label-input",
			attr: {
				type: "text",
				value: cat.label,
				placeholder: t("placeholderCategoryName"),
				"aria-label": t("ariaCategoryName", { key: cat.key }),
			},
		});
		// DOM 事件监听器不消费返回的 Promise（@typescript-eslint/no-misused-promises），
		// 所以用 void 显式标注。commit() 内部自己处理保存失败，不会变成 unhandled rejection。
		labelInput.addEventListener("change", () => {
			cat.label = labelInput.value.trim() || cat.label;
			if (!cat.short) cat.short = cat.label;
			void this.commit().then(() => this.refresh());
		});

		const preview = head.createSpan({
			cls: "jev-cat-folder-preview",
			text: cat.folder ? `→ ${cat.folder}` : `→ ${t("vaultRoot")}`,
		});
		preview.setAttribute("title", cat.folder || t("vaultRoot"));

		head.createDiv({ cls: "jev-spacer" });

		// 启用开关：Obsidian 原生外观，键盘可达
		const toggleWrap = head.createDiv({ cls: "checkbox-container" });
		const toggleId = `jev-cat-toggle-${cat.key}`;
		const toggle = toggleWrap.createEl("input", {
			attr: {
				type: "checkbox",
				id: toggleId,
				"aria-label": t("ariaEnableCategory", { key: cat.key, label: cat.label }),
			},
		});
		toggle.checked = cat.enabled;
		// 同上：DOM 事件监听器不消费 Promise，用 void 显式标注。
		toggle.addEventListener("change", () => {
			cat.enabled = toggle.checked;
			// 只切换禁用类，避免重渲染导致焦点丢失；颜色由 CSS 接管
			card.toggleClass("is-disabled", !cat.enabled);
			// 启用时补回 inline 颜色，禁用时移除让它回落到中性默认色
			// （CSS 侧无法用普通规则覆盖 inline style —— 见上面创建 dot 处的注释）
			if (cat.enabled) {
				dot.style.setProperty("--jev-cat", cat.color);
			} else {
				dot.style.removeProperty("--jev-cat");
			}
			void this.commit();
		});
		head.createEl("label", { cls: "jev-toggle-label", text: t("enable"), attr: { for: toggleId } });

		if (!isOpen) return;

		// ---- 展开区 ----
		const body = card.createDiv({ cls: "jev-cat-body" });
		body.setAttribute("id", bodyId);

		// 展开区里的每一项都是标准设置行。用命令式 sink 画：
		// 这一段只在「分类卡片」内部出现，声明式路径下同样是自定义块，
		// 不参与声明式的行定义。
		const bodySink = createImperativeSink(body);

		bodySink.row(t("settingTargetFolder"), t("targetFolderDesc"), (setting) => {
			setting.addDropdown((d) => {
				d.addOptions(folderOptions(cat.folder, this.folders));
				d.setValue(cat.folder);
				d.onChange(async (v) => {
					cat.folder = v;
					await this.commit();
					this.refresh();
				});
			});
		});

		bodySink.row(t("settingCriteria"), t("criteriaDesc"), (setting) => {
			setting.addTextArea((text) => {
				text.inputEl.rows = 3;
				text.inputEl.addClass("text-input", "jev-wide-input");
				text.setValue(cat.description).onChange(async (v) => {
					cat.description = v;
					await this.commit();
				});
			});
		});

		bodySink.row(t("settingShortName"), t("shortNameDesc"), (setting) => {
			setting.addText((text) => {
				text.inputEl.addClass("text-input");
				text.setValue(cat.short).onChange(async (v) => {
					cat.short = v.trim() || cat.label;
					await this.commit();
				});
			});
		});

		bodySink.row(t("settingTag"), t("tagDesc"), (setting) => {
			setting.addText((text) => {
				text.inputEl.addClass("text-input");
				text.setValue(cat.tag).onChange(async (v) => {
					cat.tag = v.trim();
					await this.commit();
				});
			});
		});

		let hexEl: HTMLElement | null = null;
		bodySink.row(t("settingColor"), t("colorDesc"), (setting) => {
			setting
				.addText((text) => {
					text.inputEl.type = "color";
					text.inputEl.addClass("jev-color-input");
					text.setValue(cat.color).onChange(async (v) => {
						cat.color = v;
						// 禁用时不要写 inline --jev-cat ——
						// 否则会绕过禁用态的灰色（那条 CSS 规则只在没有 inline 值时生效）
						if (cat.enabled) {
							dot.style.setProperty("--jev-cat", v);
						}
						hexEl?.setText(v.toUpperCase());
						await this.commit();
					});
					hexEl = text.inputEl.parentElement?.createSpan({
						cls: "jev-color-hex",
						text: cat.color.toUpperCase(),
					}) ?? null;
				})
				.addExtraButton((b) =>
					b
						.setIcon("arrow-up")
						.setTooltip(t("tooltipMoveUp"))
					.onClick(async () => {
						if (index === 0) return;
						const arr = this.draft.categories;
						[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
						await this.commit();
						this.refresh();
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("arrow-down")
					.setTooltip(t("tooltipMoveDown"))
					.onClick(async () => {
						const arr = this.draft.categories;
						if (index >= arr.length - 1) return;
						[arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
						await this.commit();
						this.refresh();
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("trash")
					.setTooltip(t("tooltipDelete"))
					.onClick(async () => {
						if (this.draft.categories.length <= 2) {
							new Notice(t("noticeMinCategories"));
							return;
						}
						this.draft.categories.splice(index, 1);
						this.expanded.delete(cat.key);
						await this.commit();
						this.refresh();
					})
			);
		});
	}

	// ------------------------------------------------------------ 自动分流
	private renderAutoSection(sink: RowSink): void {
		sink.row(t("settingMoveOnJudge"), t("moveOnJudgeDesc"), (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.draft.moveOnJudge).onChange(async (v) => {
					this.draft.moveOnJudge = v;
					await this.commit();
				})
			);
		});

		sink.row(t("settingAutoRoute"), t("autoRouteDesc"), (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.draft.autoRouteEnabled).onChange(async (v) => {
					this.draft.autoRouteEnabled = v;
					await this.commit();
				})
			);
		});

		sink.row(t("settingWatchScope"), t("watchScopeDesc"), (setting) => {
			setting.addDropdown((d) =>
				d
					.addOptions({
						inbox: t("optionWatchInbox"),
						vault: t("optionWatchVault"),
					})
					.setValue(this.draft.watchScope)
					.onChange(async (v) => {
						this.draft.watchScope = v as JevSettings["watchScope"];
						await this.commit();
						this.refresh();
					})
			);
		});

		if (this.draft.watchScope === "inbox") {
			sink.row(t("settingIndexFolder"), t("indexFolderDesc"), (setting) => {
				setting.addText((text) => {
					text.inputEl.addClass("text-input");
					text.setPlaceholder("Inbox")
						.setValue(this.draft.indexFolder)
						.onChange(async (v) => {
							const clean = v.trim();
							this.draft.indexFolder = clean;
							// indexFolder 与 inboxFolders 保持同步（多收件箱是高级用法，不再从 UI 暴露）
							if (clean) this.draft.inboxFolders = [clean];
							await this.commit();
						});
				});
			});
		}

		sink.row(t("settingDelay"), t("delayDesc"), (setting) => {
			setting.addSlider((s) =>
				s
					.setLimits(1, 60, 1)
					.setValue(Math.round(this.draft.autoRouteDelayMs / 1000))
					.onChange(async (v) => {
						this.draft.autoRouteDelayMs = v * 1000;
						await this.commit();
					})
			);
		});

		sink.row(t("settingConfirm"), t("confirmDesc"), (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.draft.autoRouteRequireConfirm).onChange(async (v) => {
					this.draft.autoRouteRequireConfirm = v;
					await this.commit();
				})
			);
		});

		sink.row(t("settingMinChars"), t("minCharsDesc"), (setting) => {
			setting.addText((text) => {
				text.inputEl.addClass("text-input");
				text.setValue(String(this.draft.minChars)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					this.draft.minChars = Number.isFinite(n) && n >= 0 ? n : 12;
					await this.commit();
				});
			});
		});

		sink.row(t("settingConfidence"), t("confidenceDesc"), (setting) => {
			setting.addSlider((s) =>
				s
					.setLimits(0.1, 0.9, 0.05)
					.setValue(this.draft.confidenceThreshold)
					.onChange(async (v) => {
						this.draft.confidenceThreshold = v;
						await this.commit();
					})
			);
		});

		sink.row(t("settingMargin"), t("marginDesc"), (setting) => {
			setting.addSlider((s) =>
				s
					.setLimits(1, 5, 0.1)
					.setValue(this.draft.marginThreshold)
					.onChange(async (v) => {
						this.draft.marginThreshold = v;
						await this.commit();
					})
			);
		});

		sink.row(t("settingLowValue"), t("lowValueDesc"), (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.draft.lowValueEnabled).onChange(async (v) => {
					this.draft.lowValueEnabled = v;
					await this.commit();
				})
			);
		});

		sink.row(t("settingDeletion"), t("deletionDesc"), (setting) => {
			setting.addDropdown((d) =>
				d
					.addOptions({
						mark: t("optionDeletionMark"),
						move: t("optionDeletionMove"),
						ignore: t("optionDeletionIgnore"),
					})
					.setValue(this.draft.deletionHandling)
					.onChange(async (v) => {
						this.draft.deletionHandling = v as JevSettings["deletionHandling"];
						await this.commit();
					})
			);
		});
	}

	// -------------------------------------------------------- 判断信息块
	private renderBlockSection(sink: RowSink): void {
		sink.row(t("settingBlockEnabled"), t("blockEnabledDesc"), (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.draft.blockEnabled).onChange(async (v) => {
					this.draft.blockEnabled = v;
					await this.commit();
				})
			);
		});

		sink.row(t("settingPlacement"), undefined, (setting) => {
			setting.addDropdown((d) =>
				d
					.addOptions({ top: t("optionTop"), bottom: t("optionBottom") })
					.setValue(this.draft.blockPlacement)
					.onChange(async (v) => {
						this.draft.blockPlacement = v as JevSettings["blockPlacement"];
						await this.commit();
					})
			);
		});

		sink.row(t("settingBlockStyle"), t("blockStyleDesc"), (setting) => {
			setting.addDropdown((d) =>
				d
					.addOptions({
						callout: t("optionCallout"),
						details: t("optionDetails"),
						quote: t("optionQuote"),
					})
					.setValue(this.draft.blockStyle)
					.onChange(async (v) => {
						this.draft.blockStyle = v as JevSettings["blockStyle"];
						await this.commit();
					})
			);
		});

		sink.row(t("settingShowProbabilities"), t("showProbabilitiesDesc"), (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.draft.blockShowProbabilities).onChange(async (v) => {
					this.draft.blockShowProbabilities = v;
					await this.commit();
				})
			);
		});

		sink.row(t("settingFrontmatter"), t("frontmatterDesc"), (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.draft.writeFrontmatter).onChange(async (v) => {
					this.draft.writeFrontmatter = v;
					await this.commit();
				})
			);
		});
	}

	// ------------------------------------------------------------- 状态栏
	private renderStatusSection(sink: RowSink): void {
		sink.row(t("settingStatusBar"), t("statusBarDesc"), (setting) => {
			setting.addToggle((toggle) =>
				toggle.setValue(this.draft.statusBarEnabled).onChange(async (v) => {
					this.draft.statusBarEnabled = v;
					await this.commit();
					this.plugin.refreshStatusBar();
				})
			);
		});

		sink.row(t("settingClearMs"), t("clearMsDesc"), (setting) => {
			setting.addText((text) => {
				text.inputEl.addClass("text-input");
				text.setValue(String(Math.round(this.draft.statusBarClearMs / 1000))).onChange(
					async (v) => {
						const n = Number.parseInt(v, 10);
						this.draft.statusBarClearMs =
							Number.isFinite(n) && n >= 0 ? n * 1000 : 12000;
						await this.commit();
					}
				);
			});
		});
	}

	// ---------------------------------------------------------- 缓存与重置
	private renderMaintenanceSection(sink: RowSink): void {
		sink.row(t("settingCacheMinutes"), t("cacheDesc"), (setting) => {
			setting.addText((text) => {
				text.inputEl.addClass("text-input");
				text.setValue(String(this.draft.cacheMinutes)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					this.draft.cacheMinutes = Number.isFinite(n) && n >= 0 ? n : 30;
					await this.commit();
				});
			});
		});

		sink.row(t("settingResetBar"), t("resetBarDesc", { count: this.plugin.cacheSize() }), (setting) => {
			this.addOverflowButton(setting, [
				{ title: t("overflowClearCache"), icon: "database", onClick: () => this.confirmClearCache() },
				{ title: t("overflowRestoreAll"), icon: "alert-triangle", onClick: () => this.confirmRestoreAll() },
			]);
		});
	}

	private confirmClearCache(): void {
		new ConfirmModal(this.app, {
			title: t("clearCacheTitle"),
			body: t("clearCacheBody", { count: this.plugin.cacheSize() }),
			confirmText: t("confirmClearCacheBtn"),
			onConfirm: () => {
				this.plugin.clearCache();
				new Notice(t("noticeCacheCleared"));
				this.refresh();
			},
		}).open();
	}

	private confirmRestoreAll(): void {
		new ConfirmModal(this.app, {
			title: t("restoreAllTitle"),
			body: t("restoreAllBody"),
			confirmText: t("confirmRestoreAllBtn"),
			onConfirm: async () => {
				this.draft = deepCopy(DEFAULT_SETTINGS);
				await this.commit();
				this.refresh();
				new Notice(t("noticeAllRestored"));
			},
		}).open();
	}
}
