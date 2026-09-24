import { App, Menu, Modal, Setting, SuggestModal, TFile } from "obsidian";
import { pct } from "./note-writer";
import { evaluateGate } from "./rules";
import type { CategoryConfig, JevSettings, RouterDecision } from "./types";

export interface DecisionModalActions {
	moveToFolder(folder: string): Promise<void> | void;
	/** 打开分类选择器，让用户改判到别的分类 */
	pickOther(): Promise<void> | void;
	reroute(): Promise<void> | void;
	removeBlock(): Promise<void> | void;
}

function formatTime(at: number): string {
	const d = new Date(at);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
		d.getHours()
	)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 「完整判断信息」弹窗：状态栏点一下就能看到全部细节 */
export class JevDecisionModal extends Modal {
	constructor(
		app: App,
		private readonly decision: RouterDecision,
		private readonly settings: JevSettings,
		private readonly actions: DecisionModalActions,
		private readonly file: TFile | null
	) {
		super(app);
	}

	onOpen(): void {
		super.onOpen();
		const { contentEl } = this;
		contentEl.addClass("jev-modal");
		this.titleEl.setText("JEV 分流判断");

		const d = this.decision;

		// ---- 结论行（一屏主角，去底色） ----
		const conclusion = contentEl.createDiv({ cls: "jev-conclusion" });
		const cat = conclusion.createDiv({ cls: "jev-conclusion-cat" });
		const dot = cat.createSpan({ cls: "jev-dot jev-ink" });
		dot.style.setProperty("--jev-cat", this.colorOf(d.categoryKey));
		cat.createSpan({ cls: "jev-cat-name", text: `${d.categoryKey} ${d.categoryLabel}` });

		const target = conclusion.createDiv({ cls: "jev-target" });
		target.createSpan({ cls: "jev-arrow", text: "→" });
		const targetPath = target.createSpan({
			cls: "jev-path",
			text: d.targetFolder ? d.targetFolder : "（库根目录）",
		});
		if (d.targetFolder) targetPath.setAttribute("title", d.targetFolder);

		// ---- 键值行 ----
		const meta = contentEl.createDiv({ cls: "jev-meta-line" });
		const addKv = (label: string, value: string): void => {
			const kv = meta.createDiv({ cls: "jev-kv" });
			kv.createEl("dt", { text: label });
			kv.createEl("dd", { text: value });
		};
		addKv(
			"置信度",
			`${pct(d.confidence)}（门槛 ${pct(this.settings.confidenceThreshold)}）`
		);
		addKv(
			"领先优势",
			Number.isFinite(d.margin)
				? `${d.margin.toFixed(2)}×（门槛 ${this.settings.marginThreshold}×）`
				: "远高于次选"
		);
		addKv(
			"长期价值",
			d.valueIndex === null
				? "未评估"
				: `${d.valueIndex + 1}/${d.valueLevels.length} — ${d.valueLevels[d.valueIndex]}`
		);
		const gate = evaluateGate(d, this.settings);
		addKv("要求", gate.passed ? "已过双门槛" : (gate.reason ?? "未达标"));

		// ---- 尾注 ----
		const foot = contentEl.createDiv({ cls: "jev-foot" });
		const footParts = [d.model, formatTime(d.at)];
		if (d.usage?.input_tokens) footParts.push(`${d.usage.input_tokens} input tokens`);
		if (d.modelConfidence !== null) footParts.push(`自报置信 ${pct(d.modelConfidence)}`);
		footParts.forEach((part, index) => {
			if (index > 0) foot.createSpan({ cls: "jev-foot-sep", text: " · " });
			foot.createSpan({ text: part });
		});

		// ---- 概率分布 ----
		const chart = contentEl.createDiv({ cls: "jev-chart" });
		for (const r of d.ranking) {
			const chosen = r.key === d.categoryKey;
			const row = chart.createDiv({ cls: "jev-prob-row" });
			if (chosen) row.addClass("is-chosen");

			// 分类字母键不再使用分类色，回归主题文字色（P0-1 根因）
			row.createDiv({ cls: "jev-prob-key", text: r.key });

			const label = row.createDiv({ cls: "jev-prob-label", text: r.label });
			label.setAttribute("title", r.label);

			const track = row.createDiv({ cls: "jev-prob-track" });
			const fill = track.createDiv({ cls: "jev-prob-fill" });
			fill.style.width = `${Math.max(2, Math.round(r.p * 100))}%`;
			if (chosen) {
				fill.addClass("jev-ink");
				fill.style.setProperty("--jev-cat", r.color);
			}

			row.createDiv({ cls: "jev-prob-val", text: pct(r.p) });
			row.setAttribute("aria-label", `${r.label} ${pct(r.p)}`);
		}

		// ---- 操作行：一个 CTA + 一个次级 + 一个 ⋯ ----
		const actions = contentEl.createDiv({ cls: "jev-actions" });
		const ctaText = d.targetFolder ? `移动到 ${d.targetFolder}` : "移动到 库根目录";

		new Setting(actions)
			.addButton((b) =>
				b.setButtonText(ctaText).setCta().onClick(async () => {
					this.close();
					await this.actions.moveToFolder(d.targetFolder);
				})
			)
			.addButton((b) =>
				b.setButtonText("换个去向…").onClick(() => {
					this.close();
					void this.actions.pickOther();
				})
			)
			.addExtraButton((b) => {
				b.setIcon("more-horizontal").setTooltip("更多操作");
				b.extraSettingsEl.addClass("jev-more-btn");
				b.extraSettingsEl.setAttribute("aria-label", "更多操作");
				b.onClick(() => this.openMoreMenu(b.extraSettingsEl));
			});
	}

	/** 用按钮的实际位置弹出菜单，键盘激活也能正常弹出 */
	private openMoreMenu(anchor: HTMLElement): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("重新判断")
				.setIcon("refresh-cw")
				.onClick(() => {
					this.close();
					void this.actions.reroute();
				})
		);
		menu.addItem((item) =>
			item
				.setTitle("移除判断信息块")
				.setIcon("trash")
				.onClick(() => {
					this.close();
					void this.actions.removeBlock();
				})
		);
		const rect = anchor.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
	}

	private colorOf(key: string): string {
		return this.settings.categories.find((c) => c.key === key)?.color ?? "#888";
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}
}

/** 选择另一个分类去往哪个文件夹 */
export class CategoryPickerModal extends Modal {
	constructor(
		app: App,
		private readonly categories: CategoryConfig[],
		private readonly onChoose: (categoryKey: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		super.onOpen();
		this.contentEl.addClass("jev-modal");
		this.titleEl.setText("选择去向分类");

		const enabled = this.categories.filter((c) => c.enabled);
		if (enabled.length === 0) {
			this.contentEl.createDiv({
				cls: "jev-empty",
				text: "没有启用中的分类，请先在设置里启用",
			});
			return;
		}

		const list = this.contentEl.createDiv({ cls: "jev-picker-list" });
		let first: HTMLButtonElement | null = null;
		for (const c of enabled) {
			const row = list.createEl("button", { cls: "jev-row", attr: { type: "button" } });
			const dot = row.createSpan({ cls: "jev-dot jev-ink" });
			dot.style.setProperty("--jev-cat", c.color);
			row.createSpan({ cls: "jev-picker-title", text: `${c.key} ${c.label}` });
			row.createSpan({
				cls: "jev-picker-sub",
				text: c.folder ? c.folder : "（库根目录）",
			});
			row.addEventListener("click", () => {
				this.close();
				this.onChoose(c.key);
			});
			if (!first) first = row;
		}

		// 打开时把焦点放到第一行：等 Obsidian 把弹窗挂进 DOM 后再聚焦（延后一帧，
		// 不依赖任何硬编码延迟值），此时直接聚焦会被 Modal 自身的初始聚焦覆盖。
		const firstRow = first;
		window.requestAnimationFrame(() => firstRow?.focus());
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}
}

/** 可搜索的文件夹选择器：使用 Obsidian 原生 SuggestModal，键盘导航 / 模糊搜索免费获得 */
export class FolderPickerModal extends SuggestModal<string> {
	constructor(
		app: App,
		private readonly folders: string[],
		private readonly onChoose: (folder: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		// 必须调用基类：SuggestModal 在基类 onOpen() 里创建 inputEl / resultContainerEl
		// 并启动 updateSuggestions()，不调用会导致 this.inputEl 为 undefined 而报错。
		super.onOpen();
		this.setPlaceholder("输入关键字过滤…");
		this.inputEl.addClass("text-input");
		this.inputEl.addClass("jev-search");
	}

	getSuggestions(query: string): string[] {
		const kw = query.trim().toLowerCase();
		const matches = this.folders.filter((f) => {
			if (!kw) return true;
			const text = f === "" ? "库根目录" : f;
			return f.toLowerCase().includes(kw) || text.toLowerCase().includes(kw);
		});
		return matches.slice(0, 200);
	}

	renderSuggestion(folder: string, el: HTMLElement): void {
		el.addClass("jev-row");
		el.createSpan({ cls: "jev-path", text: folder === "" ? "（库根目录）" : folder });
	}

	onChooseSuggestion(folder: string): void {
		this.onChoose(folder);
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}
}

/** 破坏性动作的二次确认：文案写明对象与后果，确认按钮用警示样式 + 动词 */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly options: {
			title: string;
			body: string;
			confirmText: string;
			onConfirm: () => void | Promise<void>;
		}
	) {
		super(app);
	}

	onOpen(): void {
		super.onOpen();
		this.contentEl.addClass("jev-modal");
		this.titleEl.setText(this.options.title);
		this.contentEl.createEl("p", { text: this.options.body });

		const bar = new Setting(this.contentEl);
		bar.addButton((b) =>
			b.setButtonText("取消").onClick(() => {
				this.close();
			})
		);
		bar.addButton((b) =>
			b
				.setButtonText(this.options.confirmText)
				.setWarning()
				.onClick(async () => {
					this.close();
					await this.options.onConfirm();
				})
		);
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}
}
