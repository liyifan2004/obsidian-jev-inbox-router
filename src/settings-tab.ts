import { App, Menu, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, JEV_ENDPOINT, MAX_CATEGORIES } from "./constants";
import { t } from "./i18n";
import { JevError } from "./jev-client";
import { ConfirmModal } from "./modals";
import { ORGANIZATION_PRESETS, presetById, remapPresetKeys } from "./presets";
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

	display(): void {
		const { containerEl } = this;
		this.draft = this.plugin.settings;
		this.folders = this.plugin.router.getAllFolders();
		containerEl.empty();
		containerEl.addClass("jev-settings");

		containerEl.createEl("h2", { text: "JEV Inbox Router" });
		containerEl.createEl("p", {
			cls: "jev-intro",
			text: t("settingsIntro"),
		});

		this.renderApiSection(containerEl);
		this.renderOrganizationSection(containerEl);
		this.renderCategorySection(containerEl);
		this.renderAutoSection(containerEl);
		this.renderBlockSection(containerEl);
		this.renderStatusSection(containerEl);
		this.renderMaintenanceSection(containerEl);
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
	private renderApiSection(root: HTMLElement): void {
		root.createEl("h3", { text: t("sectionApi") });

		new Setting(root)
			.setName("API Key")
			.setDesc(t("apiKeyDesc"))
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.addClass("text-input", "jev-wide-input");
				text.setPlaceholder(t("apiKeyPlaceholder"))
					.setValue(this.draft.apiKey)
					.onChange(async (v) => {
						this.draft.apiKey = v.trim();
						await this.commit();
					});
			});

		new Setting(root)
			.setName(t("settingEndpoint"))
			.setDesc(t("endpointDesc", { endpoint: JEV_ENDPOINT }))
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setPlaceholder(JEV_ENDPOINT)
					.setValue(this.draft.apiUrl)
					.onChange(async (v) => {
						this.draft.apiUrl = v.trim() || JEV_ENDPOINT;
						await this.commit();
					});
			});

		new Setting(root)
			.setName(t("settingModel"))
			.setDesc(t("modelDesc"))
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setPlaceholder("jev-latest")
					.setValue(this.draft.model)
					.onChange(async (v) => {
						this.draft.model = v.trim() || "jev-latest";
						await this.commit();
					});
			});

		new Setting(root)
			.setName(t("settingTestConnection"))
			.setDesc(t("testConnectionDesc"))
			.addButton((b) =>
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
	}

	// ------------------------------------------------------------- 组织方式
	private renderOrganizationSection(root: HTMLElement): void {
		root.createEl("h3", { text: t("sectionOrganization") });
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
				this.display();
			});
		}

		// ---- 应用方式 ----
		new Setting(root)
			.setName(t("settingApplyMode"))
			.setDesc(t("applyModeDesc"))
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

		// ---- 应用（本节唯一 CTA）+ 还原 ----
		const preset = this.selectedPresetId ? presetById(this.selectedPresetId) : undefined;
		const bar = new Setting(root)
			.setName(preset ? t("applyBarWithPreset", { name: preset.name }) : t("applyBarName"))
			.setDesc(preset ? t("applyBarDescConfirm") : t("applyBarDescPick"))
			.addButton((b) =>
				b
					.setButtonText(t("btnApplyPreset"))
					.setCta()
					.setDisabled(!preset)
					.onClick(() => {
						if (preset) this.confirmApplyPreset(preset);
					})
			);

		if (this.draft.previousCategories && this.draft.previousCategories.length > 0) {
			bar.addButton((b) =>
				b.setButtonText(t("btnRestorePrevious")).onClick(() => this.confirmRestorePrevious())
			);
		}
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
					this.draft.previousCategories = JSON.parse(JSON.stringify(this.draft.categories));
					this.draft.categories = preset.categories.map((c) => JSON.parse(JSON.stringify(c)));
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
				this.display();
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
				this.draft.categories = JSON.parse(JSON.stringify(snapshot));
				this.draft.previousCategories = null;
				await this.commit();
				this.display();
				new Notice(t("noticeRestored"));
			},
		}).open();
	}

	// --------------------------------------------------------- 分类与去向
	private renderCategorySection(root: HTMLElement): void {
		root.createEl("h3", { text: t("sectionCategories") });
		root.createEl("p", {
			cls: "jev-hint",
			text: t("categoriesHint"),
		});

		const wrap = root.createDiv({ cls: "jev-cat-list" });
		this.draft.categories.forEach((cat, index) => {
			this.renderCategoryCard(wrap, cat, index);
		});

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
				this.display();
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
	}

	private confirmResetCategories(): void {
		new ConfirmModal(this.app, {
			title: t("resetCategoriesTitle"),
			body: t("resetCategoriesBody"),
			confirmText: t("confirmResetCategories"),
			onConfirm: async () => {
				this.draft.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
				this.expanded.clear();
				await this.commit();
				this.display();
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
				this.display();
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
			this.display();
		});

		const dot = head.createSpan({ cls: "jev-dot jev-ink" });
		dot.style.setProperty("--jev-cat", cat.color);

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
		labelInput.addEventListener("change", async () => {
			cat.label = labelInput.value.trim() || cat.label;
			if (!cat.short) cat.short = cat.label;
			await this.commit();
			this.display();
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
		toggle.addEventListener("change", async () => {
			cat.enabled = toggle.checked;
			// 只切换禁用类，避免重渲染导致焦点丢失；颜色由 CSS 接管
			card.toggleClass("is-disabled", !cat.enabled);
			await this.commit();
		});
		head.createEl("label", { cls: "jev-toggle-label", text: t("enable"), attr: { for: toggleId } });

		if (!isOpen) return;

		// ---- 展开区 ----
		const body = card.createDiv({ cls: "jev-cat-body" });
		body.setAttribute("id", bodyId);

		new Setting(body)
			.setName(t("settingTargetFolder"))
			.setDesc(t("targetFolderDesc"))
			.addDropdown((d) => {
				d.addOptions(folderOptions(cat.folder, this.folders));
				d.setValue(cat.folder);
				d.onChange(async (v) => {
					cat.folder = v;
					await this.commit();
					this.display();
				});
			});

		new Setting(body)
			.setName(t("settingCriteria"))
			.setDesc(t("criteriaDesc"))
			.addTextArea((t) => {
				t.inputEl.rows = 3;
				t.inputEl.addClass("text-input", "jev-wide-input");
				t.setValue(cat.description).onChange(async (v) => {
					cat.description = v;
					await this.commit();
				});
			});

		new Setting(body)
			.setName(t("settingShortName"))
			.setDesc(t("shortNameDesc"))
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(cat.short).onChange(async (v) => {
					cat.short = v.trim() || cat.label;
					await this.commit();
				});
			});

		new Setting(body)
			.setName(t("settingTag"))
			.setDesc(t("tagDesc"))
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(cat.tag).onChange(async (v) => {
					cat.tag = v.trim();
					await this.commit();
				});
			});

		let hexEl: HTMLElement | null = null;
		new Setting(body)
			.setName(t("settingColor"))
			.setDesc(t("colorDesc"))
			.addText((t) => {
				t.inputEl.type = "color";
				t.inputEl.addClass("jev-color-input");
				t.setValue(cat.color).onChange(async (v) => {
					cat.color = v;
					dot.style.setProperty("--jev-cat", v);
					hexEl?.setText(v.toUpperCase());
					await this.commit();
				});
				hexEl = t.inputEl.parentElement?.createSpan({
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
						this.display();
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
						this.display();
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
						this.display();
					})
			);
	}

	// ------------------------------------------------------------ 自动分流
	private renderAutoSection(root: HTMLElement): void {
		root.createEl("h3", { text: t("sectionAuto") });

		new Setting(root)
			.setName(t("settingMoveOnJudge"))
			.setDesc(t("moveOnJudgeDesc"))
			.addToggle((t) =>
				t.setValue(this.draft.moveOnJudge).onChange(async (v) => {
					this.draft.moveOnJudge = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName(t("settingAutoRoute"))
			.setDesc(t("autoRouteDesc"))
			.addToggle((t) =>
				t.setValue(this.draft.autoRouteEnabled).onChange(async (v) => {
					this.draft.autoRouteEnabled = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName(t("settingWatchScope"))
			.setDesc(t("watchScopeDesc"))
			.addDropdown((d) =>
				d
					.addOptions({
						inbox: t("optionWatchInbox"),
						vault: t("optionWatchVault"),
					})
					.setValue(this.draft.watchScope)
					.onChange(async (v) => {
						this.draft.watchScope = v as JevSettings["watchScope"];
						await this.commit();
						this.display();
					})
			);

		if (this.draft.watchScope === "inbox") {
			new Setting(root)
				.setName(t("settingIndexFolder"))
				.setDesc(t("indexFolderDesc"))
				.addText((t) => {
					t.inputEl.addClass("text-input");
					t.setPlaceholder("Inbox")
						.setValue(this.draft.indexFolder)
						.onChange(async (v) => {
							const clean = v.trim();
							this.draft.indexFolder = clean;
							// indexFolder 与 inboxFolders 保持同步（多收件箱是高级用法，不再从 UI 暴露）
							if (clean) this.draft.inboxFolders = [clean];
							await this.commit();
						});
				});
		}

		new Setting(root)
			.setName(t("settingDelay"))
			.setDesc(t("delayDesc"))
			.addSlider((s) =>
				s
					.setLimits(1, 60, 1)
					.setValue(Math.round(this.draft.autoRouteDelayMs / 1000))
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.draft.autoRouteDelayMs = v * 1000;
						await this.commit();
					})
			);

		new Setting(root)
			.setName(t("settingConfirm"))
			.setDesc(t("confirmDesc"))
			.addToggle((t) =>
				t.setValue(this.draft.autoRouteRequireConfirm).onChange(async (v) => {
					this.draft.autoRouteRequireConfirm = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName(t("settingMinChars"))
			.setDesc(t("minCharsDesc"))
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(String(this.draft.minChars)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					this.draft.minChars = Number.isFinite(n) && n >= 0 ? n : 12;
					await this.commit();
				});
			});

		new Setting(root)
			.setName(t("settingConfidence"))
			.setDesc(t("confidenceDesc"))
			.addSlider((s) =>
				s
					.setLimits(0.1, 0.9, 0.05)
					.setValue(this.draft.confidenceThreshold)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.draft.confidenceThreshold = v;
						await this.commit();
					})
			);

		new Setting(root)
			.setName(t("settingMargin"))
			.setDesc(t("marginDesc"))
			.addSlider((s) =>
				s
					.setLimits(1, 5, 0.1)
					.setValue(this.draft.marginThreshold)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.draft.marginThreshold = v;
						await this.commit();
					})
			);

		new Setting(root)
			.setName(t("settingLowValue"))
			.setDesc(t("lowValueDesc"))
			.addToggle((t) =>
				t.setValue(this.draft.lowValueEnabled).onChange(async (v) => {
					this.draft.lowValueEnabled = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName(t("settingDeletion"))
			.setDesc(t("deletionDesc"))
			.addDropdown((d) =>
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
	}

	// -------------------------------------------------------- 判断信息块
	private renderBlockSection(root: HTMLElement): void {
		root.createEl("h3", { text: t("sectionBlock") });

		new Setting(root)
			.setName(t("settingBlockEnabled"))
			.setDesc(t("blockEnabledDesc"))
			.addToggle((t) =>
				t.setValue(this.draft.blockEnabled).onChange(async (v) => {
					this.draft.blockEnabled = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName(t("settingPlacement"))
			.addDropdown((d) =>
				d
					.addOptions({ top: t("optionTop"), bottom: t("optionBottom") })
					.setValue(this.draft.blockPlacement)
					.onChange(async (v) => {
						this.draft.blockPlacement = v as JevSettings["blockPlacement"];
						await this.commit();
					})
			);

		new Setting(root)
			.setName(t("settingBlockStyle"))
			.setDesc(t("blockStyleDesc"))
			.addDropdown((d) =>
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

		new Setting(root)
			.setName(t("settingShowProbabilities"))
			.setDesc(t("showProbabilitiesDesc"))
			.addToggle((t) =>
				t.setValue(this.draft.blockShowProbabilities).onChange(async (v) => {
					this.draft.blockShowProbabilities = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName(t("settingFrontmatter"))
			.setDesc(t("frontmatterDesc"))
			.addToggle((t) =>
				t.setValue(this.draft.writeFrontmatter).onChange(async (v) => {
					this.draft.writeFrontmatter = v;
					await this.commit();
				})
			);
	}

	// ------------------------------------------------------------- 状态栏
	private renderStatusSection(root: HTMLElement): void {
		root.createEl("h3", { text: t("sectionStatusBar") });

		new Setting(root)
			.setName(t("settingStatusBar"))
			.setDesc(t("statusBarDesc"))
			.addToggle((t) =>
				t.setValue(this.draft.statusBarEnabled).onChange(async (v) => {
					this.draft.statusBarEnabled = v;
					await this.commit();
					this.plugin.refreshStatusBar();
				})
			);

		new Setting(root)
			.setName(t("settingClearMs"))
			.setDesc(t("clearMsDesc"))
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(String(Math.round(this.draft.statusBarClearMs / 1000))).onChange(
					async (v) => {
						const n = Number.parseInt(v, 10);
						this.draft.statusBarClearMs =
							Number.isFinite(n) && n >= 0 ? n * 1000 : 12000;
						await this.commit();
					}
				);
			});
	}

	// ---------------------------------------------------------- 缓存与重置
	private renderMaintenanceSection(root: HTMLElement): void {
		root.createEl("h3", { text: t("sectionMaintenance") });

		new Setting(root)
			.setName(t("settingCacheMinutes"))
			.setDesc(t("cacheDesc"))
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(String(this.draft.cacheMinutes)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					this.draft.cacheMinutes = Number.isFinite(n) && n >= 0 ? n : 30;
					await this.commit();
				});
			});

		const bar = new Setting(root)
			.setName(t("settingResetBar"))
			.setDesc(t("resetBarDesc", { count: this.plugin.cacheSize() }));
		this.addOverflowButton(bar, [
			{ title: t("overflowClearCache"), icon: "database", onClick: () => this.confirmClearCache() },
			{ title: t("overflowRestoreAll"), icon: "alert-triangle", onClick: () => this.confirmRestoreAll() },
		]);
	}

	private confirmClearCache(): void {
		new ConfirmModal(this.app, {
			title: t("clearCacheTitle"),
			body: t("clearCacheBody", { count: this.plugin.cacheSize() }),
			confirmText: t("confirmClearCacheBtn"),
			onConfirm: () => {
				this.plugin.clearCache();
				new Notice(t("noticeCacheCleared"));
				this.display();
			},
		}).open();
	}

	private confirmRestoreAll(): void {
		new ConfirmModal(this.app, {
			title: t("restoreAllTitle"),
			body: t("restoreAllBody"),
			confirmText: t("confirmRestoreAllBtn"),
			onConfirm: async () => {
				this.draft = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
				await this.commit();
				this.display();
				new Notice(t("noticeAllRestored"));
			},
		}).open();
	}
}
