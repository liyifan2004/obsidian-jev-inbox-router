import { BLOCK_END, BLOCK_START } from "./constants";
import type { JevSettings, RouterDecision } from "./types";

export interface BlockMeta {
	/** 是否真的把文件移动了 */
	moved: boolean;
	/** 没有移动时的原因 */
	blockedReason?: string;
}

export interface FrontmatterField {
	key: string;
	value: string | number | boolean | string[];
}

/** 把 0.482 渲染成 "48%" */
export function pct(p: number): string {
	if (!Number.isFinite(p)) return "—";
	return `${Math.round(p * 100)}%`;
}

function bar(p: number, width = 5): string {
	if (!Number.isFinite(p)) return "";
	const filled = Math.max(0, Math.min(width, Math.round(p * width)));
	return "█".repeat(filled) + "░".repeat(width - filled);
}

function formatTime(at: number): string {
	const d = new Date(at);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
		d.getHours()
	)}:${pad(d.getMinutes())}`;
}

function marginText(margin: number): string {
	if (!Number.isFinite(margin)) return "远高于次选";
	return `${margin.toFixed(2)}×`;
}

/** 生成判断信息块的正文行（不含标记注释） */
function buildInnerLines(
	decision: RouterDecision,
	settings: JevSettings,
	meta: BlockMeta,
	prefix: string
): string[] {
	const lines: string[] = [];
	const target = decision.targetFolder ? `\`${decision.targetFolder}\`` : "库根目录";

	lines.push(
		`**去向**：${decision.categoryKey} ${decision.categoryLabel} → ${target}${
			meta.moved ? "" : "（未移动）"
		}`
	);
	lines.push(
		`**置信度**：${pct(decision.confidence)} · 门槛 ${pct(
			settings.confidenceThreshold
		)} · 领先优势 ${marginText(decision.margin)}`
	);
	if (decision.valueIndex !== null) {
		lines.push(
			`**长期价值**：${decision.valueIndex + 1}/${decision.valueLevels.length} — ${decision.valueLevels[decision.valueIndex]}`
		);
	}
	if (settings.blockShowProbabilities) {
		const dist = decision.ranking
			.map((r) => `${r.key} ${bar(r.p)} ${pct(r.p)}`)
			.join(" · ");
		lines.push(`**概率分布**：${dist}`);
	}
	if (meta.blockedReason) {
		lines.push(`**未自动分流的原因**：${meta.blockedReason}`);
	}
	lines.push(`**判断模型**：${decision.model} · ${formatTime(decision.at)}`);
	return lines.map((l) => prefix + l);
}

/** 生成完整的判断块文本（含首尾标记注释） */
export function buildRouteBlock(
	decision: RouterDecision,
	settings: JevSettings,
	meta: BlockMeta
): string {
	const title = `JEV 分流判断 → ${decision.categoryKey} ${decision.categoryLabel}`;
	const head = `${BLOCK_START}\n`;

	if (settings.blockStyle === "callout") {
		const body = buildInnerLines(decision, settings, meta, "> ");
		return `${head}> [!jev-route] ${title}\n${body.join("\n")}\n${BLOCK_END}`;
	}

	if (settings.blockStyle === "quote") {
		const body = buildInnerLines(decision, settings, meta, "> ");
		return `${head}> **${title}**\n${body.join("\n")}\n${BLOCK_END}`;
	}

	// details：默认可折叠，长笔记里不挡视线
	const body = buildInnerLines(decision, settings, meta, "").join("\n");
	return [
		head,
		`<details class="jev-route-block">`,
		`<summary>${title}（${pct(decision.confidence)}）</summary>`,
		"",
		body,
		"",
		"</details>",
		BLOCK_END,
	].join("\n");
}

/** 移除已经存在的判断块 */
export function stripRouteBlock(content: string): string {
	const start = content.indexOf(BLOCK_START);
	if (start === -1) return content;
	const end = content.indexOf(BLOCK_END, start);
	if (end === -1) return content;

	const before = content.slice(0, start);
	const after = content.slice(end + BLOCK_END.length);
	const merged = `${before.replace(/[ \t]+$/, "").replace(/\n{3,}/g, "\n\n")}${
		after.startsWith("\n") ? "" : "\n"
	}${after}`;
	return merged.replace(/\n{4,}/g, "\n\n\n");
}

/**
 * 把「YAML frontmatter 顶部」和「正文」拆开。
 * 没有 frontmatter 时 fm 为空串。
 */
export function splitFrontmatter(content: string): { fm: string; body: string } {
	if (!content.startsWith("---")) return { fm: "", body: content };
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { fm: "", body: content };
	return { fm: match[0], body: content.slice(match[0].length) };
}

/** 把判断块写入正文（先清旧块，再按位置插入） */
export function upsertRouteBlock(
	content: string,
	block: string,
	placement: JevSettings["blockPlacement"]
): string {
	const cleaned = stripRouteBlock(content);
	const { fm, body } = splitFrontmatter(cleaned);
	const trimmedBody = body.replace(/^\n+/, "");

	const nextBody =
		placement === "top"
			? `${block}\n\n${trimmedBody}`
			: `${trimmedBody.replace(/[ \t]*$/, "").replace(/\n*$/, "\n\n")}${block}\n`;

	return `${fm}${nextBody}`;
}

/** 需要写入 frontmatter 的字段 */
export function buildFrontmatterFields(
	decision: RouterDecision,
	settings: JevSettings
): FrontmatterField[] {
	const category = settings.categories.find((c) => c.key === decision.categoryKey);
	const fields: FrontmatterField[] = [
		{ key: "jev-category", value: `${decision.categoryKey} ${decision.categoryLabel}` },
		{ key: "jev-confidence", value: Number(decision.confidence.toFixed(3)) },
		{ key: "jev-model", value: decision.model },
		{ key: "jev-routed-at", value: new Date(decision.at).toISOString() },
	];
	if (decision.targetFolder) {
		fields.push({ key: "jev-folder", value: decision.targetFolder });
	}
	if (category?.tag) {
		fields.push({ key: "tags", value: [category.tag] });
	}
	return fields;
}
