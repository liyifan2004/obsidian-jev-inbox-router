import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, JEV_ENDPOINT, MAX_CATEGORIES } from "./constants";
import { JevError } from "./jev-client";
import type { CategoryConfig, JevSettings } from "./types";
import type JevInboxRouterPlugin from "./main";

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
		this.renderCategorySection(containerEl);
		this.renderAutoSection(containerEl);
		this.renderBlockSection(containerEl);
		this.renderStatusSection(containerEl);
		this.renderMaintenanceSection(containerEl);
	}

	private async commit(): Promise<void> {
		await this.plugin.saveSettings(this.draft);
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
				t.inputEl.addClass("jev-wide-input");
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
			.addText((t) =>
				t
					.setPlaceholder(JEV_ENDPOINT)
					.setValue(this.draft.apiUrl)
					.onChange(async (v) => {
						this.draft.apiUrl = v.trim() || JEV_ENDPOINT;
						await this.commit();
					})
			);

		new Setting(root)
			.setName("模型")
			.setDesc("jev-latest 会跟随最新版本；也可以写死版本号，例如 jev-1.13.0。")
			.addText((t) =>
				t
					.setPlaceholder("jev-latest")
					.setValue(this.draft.model)
					.onChange(async (v) => {
						this.draft.model = v.trim() || "jev-latest";
						await this.commit();
					})
			);

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

	// --------------------------------------------------------- 分类与去向
	private renderCategorySection(root: HTMLElement): void {
		root.createEl("h3", { text: "分类与去向" });
		root.createEl("p", {
			cls: "jev-hint",
			text:
				"每一行是一个分类。判据描述是喂给 JEV 的说明，写得越具体，判断越准。去向决定这条笔记被送到哪个文件夹。",
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
		bar.addButton((b) =>
			b.setButtonText("恢复默认分类").onClick(async () => {
				this.draft.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
				this.expanded.clear();
				await this.commit();
				this.display();
			})
		);
		bar.addButton((b) =>
			b
				.setButtonText("恢复默认分类名称与描述")
				.setTooltip("只重置文字说明，保留你已选好的文件夹")
				.onClick(async () => {
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
				})
		);
	}

	private renderCategoryCard(wrap: HTMLElement, cat: CategoryConfig, index: number): void {
		const card = wrap.createDiv({ cls: "jev-cat-card" });
		if (!cat.enabled) card.addClass("is-disabled");
		const isOpen = this.expanded.has(cat.key);

		// ---- 头部 ----
		const head = card.createDiv({ cls: "jev-cat-head" });

		const dot = head.createSpan({ cls: "jev-dot" });
		dot.style.background = cat.color;

		const keyEl = head.createSpan({ cls: "jev-cat-key", text: cat.key });
		keyEl.setAttribute("title", "分类标识，作为 JEV 的选项 key；改动后需要重新判断已有的笔记");

		const labelInput = head.createEl("input", {
			cls: "jev-cat-label-input",
			attr: { type: "text", value: cat.label, placeholder: "分类名" },
		});
		labelInput.addEventListener("change", async () => {
			cat.label = labelInput.value.trim() || cat.label;
			if (!cat.short) cat.short = cat.label;
			await this.commit();
			this.display();
		});

		head.createSpan({
			cls: "jev-cat-folder-preview",
			text: cat.folder ? `→ ${cat.folder}` : "→ 库根目录",
		});

		const spacer = head.createDiv({ cls: "jev-spacer" });

		const toggle = head.createEl("input", { attr: { type: "checkbox" } });
		toggle.checked = cat.enabled;
		toggle.addEventListener("change", async () => {
			cat.enabled = toggle.checked;
			await this.commit();
			card.toggleClass("is-disabled", !cat.enabled);
		});
		head.createSpan({ cls: "jev-toggle-label", text: "启用" });

		const more = head.createEl("button", {
			cls: "jev-icon-btn",
			text: isOpen ? "收起" : "展开",
		});
		more.addEventListener("click", () => {
			if (this.expanded.has(cat.key)) this.expanded.delete(cat.key);
			else this.expanded.add(cat.key);
			this.display();
		});

		if (!isOpen) {
			head.addEventListener("dblclick", () => {
				this.expanded.add(cat.key);
				this.display();
			});
			return;
		}

		// ---- 展开区 ----
		const body = card.createDiv({ cls: "jev-cat-body" });

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
				t.inputEl.addClass("jev-wide-input");
				t.setValue(cat.description).onChange(async (v) => {
					cat.description = v;
					await this.commit();
				});
			});

		new Setting(body)
			.setName("状态栏短名")
			.setDesc("状态栏空间有限，用两三个字概括。")
			.addText((t) =>
				t.setValue(cat.short).onChange(async (v) => {
					cat.short = v.trim() || cat.label;
					await this.commit();
				})
			);

		new Setting(body)
			.setName("写入标签")
			.setDesc("分流时写进 frontmatter 的 tags，留空则不写。")
			.addText((t) =>
				t.setValue(cat.tag).onChange(async (v) => {
					cat.tag = v.trim();
					await this.commit();
				})
			);

		new Setting(body)
			.setName("配色")
			.setDesc("界面上的小圆点和概率条颜色。")
			.addText((t) => {
				t.inputEl.type = "color";
				t.inputEl.addClass("jev-color-input");
				t.setValue(cat.color).onChange(async (v) => {
					cat.color = v;
					dot.style.background = v;
					await this.commit();
				});
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
			.setName("启用自动分流")
			.setDesc(
				"开启后，落在收件箱里的笔记在停止编辑若干秒后会被自动判断并搬走。建议先用手动命令试几次再打开。"
			)
			.addToggle((t) =>
				t.setValue(this.draft.autoRouteEnabled).onChange(async (v) => {
					this.draft.autoRouteEnabled = v;
					await this.commit();
				})
			);

		new Setting(root)
			.setName("监听范围")
			.setDesc("收件箱：只处理指定文件夹里的笔记。整个库：新建的笔记都会被判断（范围更大，慎用）。")
			.addDropdown((d) =>
				d
					.addOptions({
						inbox: "只监听收件箱文件夹",
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
				.setName("收件箱文件夹")
				.setDesc("一行一个，支持多个。插件会在分流时自动创建不存在的文件夹。")
				.addTextArea((t) => {
					t.inputEl.rows = 3;
					t.inputEl.addClass("jev-wide-input");
					t.setPlaceholder("Inbox");
					t.setValue(this.draft.inboxFolders.join("\n")).onChange(async (v) => {
						this.draft.inboxFolders = v
							.split("\n")
							.map((s) => s.trim())
							.filter(Boolean);
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
			.addText((t) =>
				t.setValue(String(this.draft.minChars)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					this.draft.minChars = Number.isFinite(n) && n >= 0 ? n : 12;
					await this.commit();
				})
			);

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
			.setDesc("格式：JEV · 分类短名 置信度。点一下可以打开完整判断信息。")
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
			.addText((t) =>
				t.setValue(String(Math.round(this.draft.statusBarClearMs / 1000))).onChange(
					async (v) => {
						const n = Number.parseInt(v, 10);
						this.draft.statusBarClearMs =
							Number.isFinite(n) && n >= 0 ? n * 1000 : 12000;
						await this.commit();
					}
				)
			);
	}

	// ---------------------------------------------------------- 缓存与重置
	private renderMaintenanceSection(root: HTMLElement): void {
		root.createEl("h3", { text: "缓存与重置" });

		new Setting(root)
			.setName("判断结果缓存时长")
			.setDesc("单位分钟。内容没变就直接复用上一次的判断，省调用。")
			.addText((t) =>
				t.setValue(String(this.draft.cacheMinutes)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					this.draft.cacheMinutes = Number.isFinite(n) && n >= 0 ? n : 30;
					await this.commit();
				})
			);

		new Setting(root)
			.setName("清空判断缓存")
			.setDesc(`当前缓存 ${this.plugin.cacheSize()} 条。`)
			.addButton((b) =>
				b.setButtonText("清空").onClick(async () => {
					this.plugin.clearCache();
					new Notice("缓存已清空。");
					this.display();
				})
			);

		new Setting(root)
			.setName("恢复全部默认设置")
			.setDesc("包括 API Key 在内的所有设置都会回到初始状态。")
			.addButton((b) =>
				b
					.setButtonText("恢复默认")
					.setWarning()
					.onClick(async () => {
						this.draft = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
						await this.commit();
						this.display();
						new Notice("已恢复默认设置。");
					})
			);
	}
}
