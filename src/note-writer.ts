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

/** 判断块里的每一条信息（不含前缀） */
function buildItems(
	decision: RouterDecision,
	settings: JevSettings,
	meta: BlockMeta
): string[] {
	const items: string[] = [];
	const target = decision.targetFolder ? `\`${decision.targetFolder}\`` : "库根目录";

	items.push(
		`**去向**：${decision.categoryKey} ${decision.categoryLabel} → ${target}${
			meta.moved ? "" : "（未移动）"
		}`
	);
	items.push(
		`**置信度**：${pct(decision.confidence)} · 门槛 ${pct(
			settings.confidenceThreshold
		)} · 领先优势 ${marginText(decision.margin)}`
	);
	if (decision.valueIndex !== null) {
		items.push(
			`**长期价值**：${decision.valueIndex + 1}/${decision.valueLevels.length} — ${
				decision.valueLevels[decision.valueIndex]
			}`
		);
	}
	if (settings.blockShowProbabilities) {
		items.push(
			`**概率分布**：${decision.ranking
				.map((r) => `${r.key} ${bar(r.p)} ${pct(r.p)}`)
				.join(" · ")}`
		);
	}
	if (meta.blockedReason) {
		items.push(`**未自动分流的原因**：${meta.blockedReason}`);
	}
	items.push(`**判断模型**：${decision.model} · ${formatTime(decision.at)}`);
	return items;
}

/**
 * 生成完整的判断块文本（含首尾标记注释）。
 *
 * 每条信息都渲染成列表项：Obsidian 会把 callout 内连续的普通行合并成一段，
 * 用 `- ` 才能保证每条各占一行。
 */
export function buildRouteBlock(
	decision: RouterDecision,
	settings: JevSettings,
	meta: BlockMeta
): string {
	const title = `JEV 分流判断 → ${decision.categoryKey} ${decision.categoryLabel}`;
	const items = buildItems(decision, settings, meta);

	if (settings.blockStyle === "callout") {
		const body = items.map((i) => `> - ${i}`).join("\n");
		return `${BLOCK_START}\n> [!jev-route] ${title}\n${body}\n${BLOCK_END}`;
	}

	if (settings.blockStyle === "quote") {
		const body = items.map((i) => `> - ${i}`).join("\n");
		return `${BLOCK_START}\n> **${title}**\n${body}\n${BLOCK_END}`;
	}

	// details：默认可折叠，长笔记里不挡视线
	const body = items.map((i) => `- ${i}`).join("\n");
	return [
		BLOCK_START,
		`<details class="jev-route-block">`,
		`<summary>${title}（${pct(decision.confidence)}）</summary>`,
		"",
		body,
		"",
		"</details>",
		BLOCK_END,
	].join("\n");
}

/** 移除已经存在的判断块；没有块或块不完整时原样返回 */
export function stripRouteBlock(content: string): string {
	const start = content.indexOf(BLOCK_START);
	if (start === -1) return content;
	const end = content.indexOf(BLOCK_END, start);
	if (end === -1) return content;

	const before = content.slice(0, start).replace(/\s+$/, "");
	const after = content
		.slice(end + BLOCK_END.length)
		.replace(/^\n+/, "")
		.replace(/\s+$/, "");

	if (!before) return after;
	if (!after) return before;
	return `${before}\n\n${after}`;
}

/**
 * 把「YAML frontmatter 顶部」和「正文」拆开。
 * 没有 frontmatter 时 fm 为空串。
 */
export function splitFrontmatter(content: string): { fm: string; body: string } {
	if (!content.startsWith("---")) return { fm: "", body: content };
	const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
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
	const inner = body.replace(/^\n+/, "").replace(/\s+$/, "");

	const nextBody =
		placement === "top"
			? inner
				? `${block}\n\n${inner}`
				: block
			: inner
				? `${inner}\n\n${block}`
				: block;

	if (!fm) return nextBody;
	return `${fm}\n${nextBody}`;
}

/**
 * 送去给 JEV 判断的内容。
 *
 * 必须剥掉上一次写入的判断块和 jev-* frontmatter 字段：
 * 它们由插件自己生成，留在输入里既浪费 token，又会让下一次判断被上一次的结论带偏。
 */
export function toJudgeInput(content: string): string {
	const withoutBlock = stripRouteBlock(content);
	const { fm, body } = splitFrontmatter(withoutBlock);
	if (!fm) return body.trim();

	const inner = fm.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?$/, "$1");
	const kept = inner
		.split(/\r?\n/)
		.filter((line) => !/^\s*jev-/.test(line))
		.join("\n")
		.trim();

	const head = kept ? `---\n${kept}\n---\n` : "";
	return `${head}${body}`.trim();
}

/**
 * 缓存指纹的来源：只看正文，不含任何 frontmatter。
 *
 * 插件分流时会往 frontmatter 里写 jev-* 字段和标签。如果把这些也算进指纹，
 * 第一次分流后指纹必然变，缓存就永远命不中——每次打开笔记都会重新调用 JEV。
 */
export function toJudgeFingerprintSource(content: string): string {
	return splitFrontmatter(stripRouteBlock(content)).body.trim();
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

/**
 * 把字段合并进 frontmatter 对象。
 * tags 做去重追加（不覆盖用户已有的标签），其余字段直接覆盖。
 */
export function applyFrontmatterFields(
	fm: Record<string, unknown>,
	fields: FrontmatterField[]
): void {
	for (const field of fields) {
		if (field.key === "tags") {
			const incoming = (Array.isArray(field.value) ? field.value : [field.value])
				.map((v) => String(v))
				.filter((v) => v !== "");
			if (incoming.length === 0) continue;

			const existing = fm[field.key];
			const list = Array.isArray(existing)
				? existing.map((v) => String(v))
				: typeof existing === "string" && existing
					? [existing]
					: [];
			for (const tag of incoming) {
				if (!list.includes(tag)) list.push(tag);
			}
			fm[field.key] = list;
			continue;
		}
		fm[field.key] = field.value;
	}
}
