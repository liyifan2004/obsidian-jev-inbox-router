import { App, Menu, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, JEV_ENDPOINT, MAX_CATEGORIES } from "./constants";
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
	const options: Record<string, string> = { "": "（库根目录）" };
	for (const f of folders) options[f] = f;
	if (current && !(current in options)) options[current] = `${current}（不存在）`;
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
			text:
				"JEV 只做一件事：判断这条笔记属于哪一类，然后把它送到对应的文件夹。它不会改写、扩写、总结你的任何内容。",
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
			b.setIcon("more-horizontal").setTooltip("更多操作");
			b.extraSettingsEl.addClass("jev-more-btn");
			b.extraSettingsEl.setAttribute("aria-label", "更多操作");
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
		root.createEl("h3", { text: "JEV 接口" });

		new Setting(root)
			.setName("API Key")
			.setDesc(
				"TypeSafe 的 key，在 console.typesafe.ai/settings/keys 获取。以明文存在本插件的 data.json 里，不会上传到别的地方。"
			)
			.addText((t) => {
				t.inputEl.type = "password";
				t.inputEl.addClass("text-input", "jev-wide-input");
				t.setPlaceholder("apikey_… 或 sk-…")
					.setValue(this.draft.apiKey)
					.onChange(async (v) => {
						this.draft.apiKey = v.trim();
						await this.commit();
					});
			});

		new Setting(root)
			.setName("端点地址")
			.setDesc(`默认 ${JEV_ENDPOINT}。只有走自建代理时才需要改。`)
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
			.setName("模型")
			.setDesc("jev-latest 会跟随最新版本；也可以写死版本号，例如 jev-1.13.0。")
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
			.setName("测试连接")
			.setDesc("发一条样例笔记给 JEV，确认 Key、端点、分类配置都能正常工作。")
			.addButton((b) =>
				b.setButtonText("测试").onClick(async () => {
					b.setDisabled(true).setButtonText("测试中…");
					try {
						const enabled = this.draft.categories.filter((c) => c.enabled);
						const decision = await this.plugin
							.getClient()
							.classify(
								{
									title: "明天的产品评审",
									path: "Inbox/明天的产品评审.md",
									content:
										"明天上午十点跟张总过 Q3 路线图，要提前把竞品对比那一页补上，另外记得问一下预算什么时候批。",
								},
								this.draft.categories,
								{ lowValueEnabled: this.draft.lowValueEnabled }
							);
						new Notice(
							`连接正常：判为 ${decision.categoryKey} ${decision.categoryLabel}（${Math.round(
								decision.confidence * 100
							)}%）→ ${decision.targetFolder || "库根目录"}\n模型 ${decision.model}`,
							8000
						);
						if (enabled.length < 2) {
							new Notice("提示：启用的分类少于 2 个，实际使用会报错。", 6000);
						}
					} catch (error) {
						const message = error instanceof JevError ? error.message : String(error);
						new Notice(`测试失败：${message}`, 12000);
					} finally {
						b.setDisabled(false).setButtonText("测试");
					}
				})
			);
	}

	// ------------------------------------------------------------- 组织方式
	private renderOrganizationSection(root: HTMLElement): void {
		root.createEl("h3", { text: "组织方式" });
		root.createEl("p", {
			cls: "jev-hint",
			text:
				"内置几套主流知识管理理论的分类方案，也可以之后在「分类与去向」里逐条改成自己的目录习惯。点选一套预设，再点下面的「应用」才会生效。",
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
				text: `${preset.categories.length} 个分类 · → ${preset.inboxFolder}`,
			});
			meta.setAttribute(
				"title",
				preset.categories
					.map((c) => `${c.key} ${c.label} → ${c.folder || "库根目录"}`)
					.join("\n")
			);

			row.addEventListener("click", () => {
				this.selectedPresetId = preset.id;
				this.display();
			});
		}

		// ---- 应用方式 ----
		new Setting(root)
			.setName("应用方式")
			.setDesc(
				"替换会用预设覆盖现有分类（应用前自动存快照，可一键还原）；追加则保留现有分类，把预设排在后面。"
			)
			.addDropdown((d) =>
				d
					.addOptions({ replace: "替换现有分类（推荐）", append: "追加为新分类" })
					.setValue(this.applyMode)
					.onChange((v) => {
						this.applyMode = v === "append" ? "append" : "replace";
					})
			)
			.addToggle((t) => {
				t.setValue(this.applyCreateFolders).onChange((v) => {
					this.applyCreateFolders = v;
				});
				t.toggleEl.setAttribute("aria-label", "同时创建预设的文件夹");
				t.toggleEl.setAttribute("title", "同时创建预设的文件夹");
				return t;
			});

		// ---- 应用（本节唯一 CTA）+ 还原 ----
		const preset = this.selectedPresetId ? presetById(this.selectedPresetId) : undefined;
		const bar = new Setting(root)
			.setName(preset ? `将应用：${preset.name}` : "应用预设")
			.setDesc(preset ? "应用前会弹窗确认，写清楚会改动什么。" : "先在上面点选一套预设。")
			.addButton((b) =>
				b
					.setButtonText("应用选中的预设")
					.setCta()
					.setDisabled(!preset)
					.onClick(() => {
						if (preset) this.confirmApplyPreset(preset);
					})
			);

		if (this.draft.previousCategories && this.draft.previousCategories.length > 0) {
			bar.addButton((b) =>
				b.setButtonText("还原上一次组织方式").onClick(() => this.confirmRestorePrevious())
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
			.map((c) => `${c.key} ${c.label} → ${c.folder || "库根目录"}`)
			.join("；");

		const lines: string[] = replace
			? [
					`将把 ${preset.categories.length} 个分类替换为「${preset.name}」预设（${preview}）。`,
					`你现有的 ${existingCount} 个分类会先存为快照，可在下方一键还原。`,
				]
			: [
					`将把「${preset.name}」预设的 ${preset.categories.length} 个分类追加到现有 ${existingCount} 个分类之后（共 ${existingCount + preset.categories.length} 个，超过上限会中止）。`,
				];
		if (this.applyCreateFolders) {
			lines.push(`并创建缺失的文件夹：${this.presetFolderList(preset).join("、")}。`);
		}
		lines.push(`index 目录会设为 ${preset.inboxFolder}。`);

		new ConfirmModal(this.app, {
			title: replace ? `应用「${preset.name}」预设（替换）` : `应用「${preset.name}」预设（追加）`,
			body: lines.join(""),
			confirmText: replace ? "替换分类" : "追加分类",
			onConfirm: async () => {
				if (replace) {
					// 快照先行：存完再整体替换
					this.draft.previousCategories = JSON.parse(JSON.stringify(this.draft.categories));
					this.draft.categories = preset.categories.map((c) => JSON.parse(JSON.stringify(c)));
				} else {
					const total = this.draft.categories.length + preset.categories.length;
					if (total > MAX_CATEGORIES) {
						new Notice(
							`追加后共 ${total} 个分类，超过上限 ${MAX_CATEGORIES}，已中止，未改动任何数据。`
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
				new Notice(`已${replace ? "替换" : "追加"}为「${preset.name}」预设。`);
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
					`创建文件夹 ${path} 失败：${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	}

	private confirmRestorePrevious(): void {
		const snapshot = this.draft.previousCategories;
		if (!snapshot || snapshot.length === 0) return;
		new ConfirmModal(this.app, {
			title: "还原上一次组织方式",
			body: `将把分类恢复为应用预设前的 ${snapshot.length} 个分类（名称、判据、去向与配色都会还原），当前的 ${this.draft.categories.length} 个分类会被替换。此操作不可撤销。`,
			confirmText: "还原分类",
			onConfirm: async () => {
				this.draft.categories = JSON.parse(JSON.stringify(snapshot));
				this.draft.previousCategories = null;
				await this.commit();
				this.display();
				new Notice("已还原上一次组织方式。");
			},
		}).open();
	}

	// --------------------------------------------------------- 分类与去向
	private renderCategorySection(root: HTMLElement): void {
		root.createEl("h3", { text: "分类与去向" });
		root.createEl("p", {
			cls: "jev-hint",
			text:
				"每一行是一个分类。判据描述是喂给 JEV 的说明，写得越具体，判断越准。去向决定这条笔记被送到哪个文件夹。想换个整体的组织方式，去上面的「组织方式」选预设；单个分类随时可以改。",
		});

		const wrap = root.createDiv({ cls: "jev-cat-list" });
		this.draft.categories.forEach((cat, index) => {
			this.renderCategoryCard(wrap, cat, index);
		});

		const bar = new Setting(root);
		bar.addButton((b) =>
			b.setButtonText("新增分类").onClick(async () => {
				if (this.draft.categories.length >= MAX_CATEGORIES) {
					new Notice(`最多 ${MAX_CATEGORIES} 个分类。`);
					return;
				}
				const used = new Set(this.draft.categories.map((c) => c.key));
				const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
				const key = alphabet.find((k) => !used.has(k)) ?? `K${Date.now() % 1000}`;
				this.draft.categories.push({
					key,
					label: "新分类",
					short: "新分类",
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
				title: "重置为默认分类（含文件夹）",
				icon: "rotate-ccw",
				onClick: () => this.confirmResetCategories(),
			},
			{
				title: "只重置名称与描述",
				icon: "type",
				onClick: () => this.confirmResetNames(),
			},
		]);
	}

	private confirmResetCategories(): void {
		new ConfirmModal(this.app, {
			title: "重置为默认分类",
			body:
				"所有分类的名称、短名、判据描述、目标文件夹与配色都会恢复成初始的 6 个分类；你新增或改过的分类会被移除。此操作不可撤销。",
			confirmText: "重置分类",
			onConfirm: async () => {
				this.draft.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
				this.expanded.clear();
				await this.commit();
				this.display();
				new Notice("已重置为默认分类。");
			},
		}).open();
	}

	private confirmResetNames(): void {
		new ConfirmModal(this.app, {
			title: "只重置名称与描述",
			body:
				"只会把每个分类的名称、短名和判据描述恢复成初始文案。你已选好的目标文件夹、标签、顺序与配色都会保留。",
			confirmText: "重置名称与描述",
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
				new Notice("已重置分类名称与描述。");
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
		chev.setAttribute("aria-label", `${isOpen ? "收起" : "展开"} ${cat.key} ${cat.label}`);
		setIcon(chev, "chevron-right");
		chev.addEventListener("click", () => {
			if (this.expanded.has(cat.key)) this.expanded.delete(cat.key);
			else this.expanded.add(cat.key);
			this.display();
		});

		const dot = head.createSpan({ cls: "jev-dot jev-ink" });
		dot.style.setProperty("--jev-cat", cat.color);

		const keyEl = head.createSpan({ cls: "jev-cat-key", text: cat.key });
		keyEl.setAttribute("title", "分类标识，作为 JEV 的选项 key；改动后需要重新判断已有的笔记");

		const labelInput = head.createEl("input", {
			cls: "text-input jev-cat-label-input",
			attr: {
				type: "text",
				value: cat.label,
				placeholder: "分类名",
				"aria-label": `分类 ${cat.key} 的名称`,
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
			text: cat.folder ? `→ ${cat.folder}` : "→ 库根目录",
		});
		preview.setAttribute("title", cat.folder || "库根目录");

		head.createDiv({ cls: "jev-spacer" });

		// 启用开关：Obsidian 原生外观，键盘可达
		const toggleWrap = head.createDiv({ cls: "checkbox-container" });
		const toggleId = `jev-cat-toggle-${cat.key}`;
		const toggle = toggleWrap.createEl("input", {
			attr: { type: "checkbox", id: toggleId, "aria-label": `启用 ${cat.key} ${cat.label}` },
		});
		toggle.checked = cat.enabled;
		toggle.addEventListener("change", async () => {
			cat.enabled = toggle.checked;
			// 只切换禁用类，避免重渲染导致焦点丢失；颜色由 CSS 接管
			card.toggleClass("is-disabled", !cat.enabled);
			await this.commit();
		});
		head.createEl("label", { cls: "jev-toggle-label", text: "启用", attr: { for: toggleId } });

		if (!isOpen) return;

		// ---- 展开区 ----
		const body = card.createDiv({ cls: "jev-cat-body" });
		body.setAttribute("id", bodyId);

		new Setting(body)
			.setName("目标文件夹")
			.setDesc("这条笔记最终被送到哪里。")
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
			.setName("判据描述")
			.setDesc("告诉 JEV 什么内容算这一类。写得越具体越准。")
			.addTextArea((t) => {
				t.inputEl.rows = 3;
				t.inputEl.addClass("text-input", "jev-wide-input");
				t.setValue(cat.description).onChange(async (v) => {
					cat.description = v;
					await this.commit();
				});
			});

		new Setting(body)
			.setName("状态栏短名")
			.setDesc("状态栏空间有限，用两三个字概括。")
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(cat.short).onChange(async (v) => {
					cat.short = v.trim() || cat.label;
					await this.commit();
				});
			});

		new Setting(body)
			.setName("写入标签")
			.setDesc("分流时写进 frontmatter 的 tags，留空则不写。")
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(cat.tag).onChange(async (v) => {
					cat.tag = v.trim();
					await this.commit();
				});
			});

		let hexEl: HTMLElement | null = null;
		new Setting(body)
			.setName("配色")
			.setDesc("界面上的小圆点和概率条颜色。")
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
					.setTooltip("上移")
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
					.setTooltip("下移")
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
					.setTooltip("删除该分类")
					.onClick(async () => {
						if (this.draft.categories.length <= 2) {
							new Notice("至少保留 2 个分类。");
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
		root.createEl("h3", { text: "自动分流" });

		new Setting(root)
			.setName("判断后自动移动")
			.setDesc(
				"关闭（推荐）= 判断后只在状态栏给建议，由你一键接受；开启 = 判断达标后直接移动文件，无需确认。"
			)
			.addToggle((t) =>
				t.setValue(this.draft.moveOnJudge).onChange(async (v) => {
					this.draft.moveOnJudge = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName("启用自动分流")
			.setDesc(
				"开启后，落在 index 目录里的笔记在停止编辑若干秒后会被自动判断。建议先用手动命令试几次再打开。"
			)
			.addToggle((t) =>
				t.setValue(this.draft.autoRouteEnabled).onChange(async (v) => {
					this.draft.autoRouteEnabled = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName("监听范围")
			.setDesc("index 目录：只处理指定文件夹里的笔记。整个库：新建的笔记都会被判断（范围更大，慎用）。")
			.addDropdown((d) =>
				d
					.addOptions({
						inbox: "只监听 index 目录",
						vault: "监听整个库",
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
				.setName("index 目录（新建笔记的落点）")
				.setDesc(
					"JEV 监听这个目录，判断后给出建议去向。建议把 Obsidian 的「新笔记默认位置」也设到这里（设置 → 文件与链接）。"
				)
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
			.setName("停止编辑后等待")
			.setDesc("单位秒。你还在打字时不会触发判断。")
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
			.setName("自动分流前确认")
			.setDesc("打开后，每次自动分流都会先弹窗让你看一眼去向，再决定是否移动。")
			.addToggle((t) =>
				t.setValue(this.draft.autoRouteRequireConfirm).onChange(async (v) => {
					this.draft.autoRouteRequireConfirm = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName("最短内容长度")
			.setDesc("去掉标记符号后不足这么多字符就不判断，避免为空白笔记浪费调用。")
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(String(this.draft.minChars)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					this.draft.minChars = Number.isFinite(n) && n >= 0 ? n : 12;
					await this.commit();
				});
			});

		new Setting(root)
			.setName("置信度门槛")
			.setDesc(
				"被选中选项的概率下限（0~1）。六个分类做单选时概率天然分散，0.4 左右比较合适；调高会更保守。"
			)
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
			.setName("领先优势门槛")
			.setDesc(
				"首选概率 ÷ 次选概率。低于这个倍数说明 JEV 在两三类之间摇摆，此时只标记不移动。"
			)
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
			.setName("同时询问长期价值")
			.setDesc("额外问一句这条笔记值不值得留，结果写在判断块里，帮助你决定要不要清理。")
			.addToggle((t) =>
				t.setValue(this.draft.lowValueEnabled).onChange(async (v) => {
					this.draft.lowValueEnabled = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName("被判为「应该删除」时")
			.setDesc("无论如何插件都不会删除文件。")
			.addDropdown((d) =>
				d
					.addOptions({
						mark: "只标记，不移动（推荐）",
						move: "移动到该分类的文件夹",
						ignore: "完全不处理",
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
		root.createEl("h3", { text: "笔记内的判断信息" });

		new Setting(root)
			.setName("写入判断信息")
			.setDesc("在笔记里留一段判断结果，方便日后回溯「它为什么在这里」。只写数据，不改动你的正文。")
			.addToggle((t) =>
				t.setValue(this.draft.blockEnabled).onChange(async (v) => {
					this.draft.blockEnabled = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName("插入位置")
			.addDropdown((d) =>
				d
					.addOptions({ top: "正文开头", bottom: "正文末尾" })
					.setValue(this.draft.blockPlacement)
					.onChange(async (v) => {
						this.draft.blockPlacement = v as JevSettings["blockPlacement"];
						await this.commit();
					})
			);

		new Setting(root)
			.setName("显示样式")
			.setDesc("折叠样式在长笔记里最不挡视线。")
			.addDropdown((d) =>
				d
					.addOptions({
						callout: "Callout 卡片",
						details: "可折叠块",
						quote: "普通引用",
					})
					.setValue(this.draft.blockStyle)
					.onChange(async (v) => {
						this.draft.blockStyle = v as JevSettings["blockStyle"];
						await this.commit();
					})
			);

		new Setting(root)
			.setName("显示完整概率分布")
			.setDesc("把每个分类的概率都列出来，含进度条字符。关掉则只留结论。")
			.addToggle((t) =>
				t.setValue(this.draft.blockShowProbabilities).onChange(async (v) => {
					this.draft.blockShowProbabilities = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName("写入 frontmatter 字段")
			.setDesc("写入 jev-category / jev-confidence / jev-model / jev-routed-at，可用 Dataview 聚合。")
			.addToggle((t) =>
				t.setValue(this.draft.writeFrontmatter).onChange(async (v) => {
					this.draft.writeFrontmatter = v;
					await this.commit();
				})
			);
	}

	// ------------------------------------------------------------- 状态栏
	private renderStatusSection(root: HTMLElement): void {
		root.createEl("h3", { text: "状态栏" });

		new Setting(root)
			.setName("在状态栏显示判断结果")
			.setDesc("就绪时只显示「JEV」，有结果时显示「分类短名 置信度」。点一下可以打开完整判断信息。")
			.addToggle((t) =>
				t.setValue(this.draft.statusBarEnabled).onChange(async (v) => {
					this.draft.statusBarEnabled = v;
					await this.commit();
					this.plugin.refreshStatusBar();
				})
			);

		new Setting(root)
			.setName("结果保留时长")
			.setDesc("单位秒，到点后收成「就绪」。填 0 表示一直显示。")
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
		root.createEl("h3", { text: "缓存与重置" });

		new Setting(root)
			.setName("判断结果缓存时长")
			.setDesc("单位分钟。内容没变就直接复用上一次的判断，省调用。")
			.addText((t) => {
				t.inputEl.addClass("text-input");
				t.setValue(String(this.draft.cacheMinutes)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					this.draft.cacheMinutes = Number.isFinite(n) && n >= 0 ? n : 30;
					await this.commit();
				});
			});

		const bar = new Setting(root)
			.setName("重置与清空")
			.setDesc(`当前缓存 ${this.plugin.cacheSize()} 条。以下动作都会先弹窗确认。`);
		this.addOverflowButton(bar, [
			{ title: "清空判断缓存", icon: "database", onClick: () => this.confirmClearCache() },
			{ title: "恢复全部默认设置（含 API Key）", icon: "alert-triangle", onClick: () => this.confirmRestoreAll() },
		]);
	}

	private confirmClearCache(): void {
		new ConfirmModal(this.app, {
			title: "清空判断缓存",
			body: `当前缓存 ${this.plugin.cacheSize()} 条。清空后，所有笔记下次都需要重新调用 JEV 判断，会消耗额外调用。`,
			confirmText: "清空缓存",
			onConfirm: () => {
				this.plugin.clearCache();
				new Notice("缓存已清空。");
				this.display();
			},
		}).open();
	}

	private confirmRestoreAll(): void {
		new ConfirmModal(this.app, {
			title: "恢复全部默认设置",
			body:
				"包括 API Key、分类、门槛与缓存时长在内的全部设置都会回到初始状态，并清空判断缓存。此操作不可撤销。",
			confirmText: "恢复全部设置",
			onConfirm: async () => {
				this.draft = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
				await this.commit();
				this.display();
				new Notice("已恢复默认设置。");
			},
		}).open();
	}
}
