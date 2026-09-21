import { App, Modal, Setting, TFile } from "obsidian";
import { pct } from "./note-writer";
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
		const { contentEl } = this;
		contentEl.addClass("jev-modal");
		contentEl.createEl("h2", { text: "JEV 分流判断" });

		const d = this.decision;

		// ---- 结论条 ----
		const verdict = contentEl.createDiv({ cls: "jev-verdict" });
		const cat = verdict.createDiv({ cls: "jev-verdict-cat" });
		const dot = cat.createSpan({ cls: "jev-dot" });
		dot.style.background = this.colorOf(d.categoryKey);
		cat.createSpan({ text: `${d.categoryKey} ${d.categoryLabel}` });
		verdict.createSpan({ cls: "jev-arrow", text: "→" });
		verdict.createSpan({
			cls: "jev-verdict-folder",
			text: d.targetFolder ? d.targetFolder : "（库根目录）",
		});

		// ---- 元信息 ----
		const meta = contentEl.createDiv({ cls: "jev-meta-grid" });
		const addMeta = (label: string, value: string) => {
			const cell = meta.createDiv({ cls: "jev-meta-cell" });
			cell.createDiv({ cls: "jev-meta-label", text: label });
			cell.createDiv({ cls: "jev-meta-value", text: value });
		};
		addMeta(
			"置信度",
			`${pct(d.confidence)}（门槛 ${pct(this.settings.confidenceThreshold)}）`
		);
		addMeta(
			"领先优势",
			Number.isFinite(d.margin) ? `${d.margin.toFixed(2)}×（门槛 ${this.settings.marginThreshold}×）` : "远高于次选"
		);
		addMeta(
			"长期价值",
			d.valueIndex === null
				? "未评估"
				: `${d.valueIndex + 1}/${d.valueLevels.length} — ${d.valueLevels[d.valueIndex]}`
		);
		addMeta("判断模型", d.model);
		addMeta("判断时间", formatTime(d.at));
		if (d.modelConfidence !== null) {
			addMeta("模型自报置信", pct(d.modelConfidence));
		}
		if (d.usage?.input_tokens) {
			addMeta("本次消耗", `${d.usage.input_tokens} input tokens`);
		}

		// ---- 概率分布 ----
		contentEl.createEl("h3", { text: "概率分布" });
		const chart = contentEl.createDiv({ cls: "jev-chart" });
		for (const r of d.ranking) {
			const row = chart.createDiv({ cls: "jev-prob-row" });
			if (r.key === d.categoryKey) row.addClass("is-chosen");
			const key = row.createDiv({ cls: "jev-prob-key", text: r.key });
			key.style.color = r.color;
			const label = row.createDiv({ cls: "jev-prob-label", text: r.label });
			const track = row.createDiv({ cls: "jev-prob-track" });
			const fill = track.createDiv({ cls: "jev-prob-fill" });
			fill.style.width = `${Math.max(2, Math.round(r.p * 100))}%`;
			fill.style.background = r.color;
			row.createDiv({ cls: "jev-prob-val", text: pct(r.p) });
			row.setAttribute("aria-label", `${r.label} ${pct(r.p)}`);
			label.setAttribute("title", r.label);
		}

		// ---- 操作 ----
		const actions = contentEl.createDiv({ cls: "jev-actions" });

		new Setting(actions)
			.addButton((b) =>
				b
					.setButtonText(d.targetFolder ? "移动到目标文件夹" : "移动到库根目录")
					.setCta()
					.onClick(async () => {
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
			.addButton((b) =>
				b.setButtonText("重新判断").onClick(async () => {
					this.close();
					await this.actions.reroute();
				})
			)
			.addButton((b) =>
				b.setButtonText("移除判断块").onClick(async () => {
					this.close();
					await this.actions.removeBlock();
				})
			);
	}

	private colorOf(key: string): string {
		return this.settings.categories.find((c) => c.key === key)?.color ?? "#888";
	}

	onClose(): void {
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
		this.contentEl.addClass("jev-modal");
		this.titleEl.setText("选择去向分类");
		const list = this.contentEl.createDiv({ cls: "jev-picker-list" });
		for (const c of this.categories) {
			if (!c.enabled) continue;
			const item = list.createDiv({ cls: "jev-picker-item" });
			const dot = item.createSpan({ cls: "jev-dot" });
			dot.style.background = c.color;
			item.createSpan({ cls: "jev-picker-title", text: `${c.key} ${c.label}` });
			item.createSpan({
				cls: "jev-picker-sub",
				text: c.folder ? c.folder : "（库根目录）",
			});
			item.onClickEvent(() => {
				this.close();
				this.onChoose(c.key);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** 可搜索的文件夹选择器 */
export class FolderPickerModal extends Modal {
	constructor(
		app: App,
		private readonly folders: string[],
		private readonly onChoose: (folder: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("jev-modal");
		this.titleEl.setText("选择目标文件夹");

		const input = this.contentEl.createEl("input", {
			cls: "jev-search",
			attr: { type: "text", placeholder: "输入关键字过滤…" },
		});

		const list = this.contentEl.createDiv({ cls: "jev-picker-list" });

		const render = (keyword: string) => {
			list.empty();
			const kw = keyword.trim().toLowerCase();
			const matches = this.folders.filter(
				(f) => !kw || f.toLowerCase().includes(kw)
			);
			if (matches.length === 0) {
				list.createDiv({ cls: "jev-empty", text: "没有匹配的文件夹" });
				return;
			}
			for (const f of matches.slice(0, 200)) {
				const item = list.createDiv({ cls: "jev-picker-item" });
				item.createSpan({ cls: "jev-picker-title", text: f === "" ? "（库根目录）" : f });
				item.onClickEvent(() => {
					this.close();
					this.onChoose(f);
				});
			}
		};

		input.addEventListener("input", () => render(input.value));
		render("");
		window.setTimeout(() => input.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
