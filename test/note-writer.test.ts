import { describe, expect, it } from "vitest";
import { BLOCK_END, BLOCK_START } from "../src/constants";
import {
	applyFrontmatterFields,
	buildFrontmatterFields,
	buildRouteBlock,
	pct,
	splitFrontmatter,
	stripRouteBlock,
	toJudgeFingerprintSource,
	toJudgeInput,
	upsertRouteBlock,
} from "../src/note-writer";
import { makeDecision, makeSettings } from "./helpers/fixtures";

const DECISION = makeDecision();
const TOP_BLOCK = buildRouteBlock(DECISION, makeSettings(), { moved: true });

describe("pct", () => {
	it("把概率四舍五入成百分比", () => {
		expect(pct(0.482)).toBe("48%");
		expect(pct(0)).toBe("0%");
		expect(pct(1)).toBe("100%");
	});

	it("非有限数返回占位符而不是 NaN%", () => {
		expect(pct(Number.POSITIVE_INFINITY)).toBe("—");
		expect(pct(Number.NaN)).toBe("—");
	});
});

describe("splitFrontmatter", () => {
	it("拆出 frontmatter 与正文", () => {
		const { fm, body } = splitFrontmatter("---\ntitle: x\n---\n\n正文");
		expect(fm).toBe("---\ntitle: x\n---\n");
		expect(body).toBe("\n正文");
	});

	it("没有 frontmatter 时 fm 为空、正文原样返回", () => {
		const { fm, body } = splitFrontmatter("正文");
		expect(fm).toBe("");
		expect(body).toBe("正文");
	});

	it("只有一条水平线时不误判为 frontmatter", () => {
		const { fm, body } = splitFrontmatter("---\n\n正文");
		expect(fm).toBe("");
		expect(body).toBe("---\n\n正文");
	});
});

describe("buildRouteBlock / callout 样式", () => {
	const block = buildRouteBlock(DECISION, makeSettings(), { moved: true });

	it("用标记注释包裹，便于可靠替换", () => {
		expect(block.startsWith(BLOCK_START)).toBe(true);
		expect(block.endsWith(BLOCK_END)).toBe(true);
	});

	it("标题行是 callout 头", () => {
		expect(block.split("\n")[1]).toBe("> [!jev-route] JEV 分流判断 → D 待办事项");
	});

	it("每一条信息都是引用块里的列表项（否则 Obsidian 会把多行挤成一段）", () => {
		const contentLines = block
			.split("\n")
			.filter((l) => l.startsWith(">") && !l.startsWith("> [!"))
			.filter((l) => l.trim().length > 0);
		expect(contentLines.length).toBeGreaterThan(3);
		for (const line of contentLines) {
			expect(line.startsWith("> - ")).toBe(true);
		}
	});

	it("写出去向、置信度、概率分布、模型与时间", () => {
		expect(block).toContain("**去向**：D 待办事项 → `要做的事`");
		expect(block).toContain("**置信度**：48%");
		expect(block).toContain("**概率分布**：");
		expect(block).toContain("jev-1.13.0 · 2026-09-21 18:20");
	});

	it("没有移动时明确标注，并写出原因", () => {
		const blocked = buildRouteBlock(
			DECISION,
			makeSettings(),
			{ moved: false, blockedReason: "置信度 48% 低于门槛 60%" }
		);
		expect(blocked).toContain("（未移动）");
		expect(blocked).toContain("**未自动分流的原因**：置信度 48% 低于门槛 60%");
	});

	it("关掉概率分布开关后不再输出该行", () => {
		const plain = buildRouteBlock(DECISION, makeSettings({ blockShowProbabilities: false }), {
			moved: true,
		});
		expect(plain).not.toContain("**概率分布**");
	});

	it("valueIndex 为 null 时不输出长期价值行", () => {
		const noValue = buildRouteBlock(
			makeDecision({ valueIndex: null }),
			makeSettings(),
			{ moved: true }
		);
		expect(noValue).not.toContain("**长期价值**");
	});
});

describe("buildRouteBlock / details 与 quote 样式", () => {
	it("details 样式用可折叠块，正文是普通列表", () => {
		const block = buildRouteBlock(DECISION, makeSettings({ blockStyle: "details" }), {
			moved: true,
		});
		expect(block).toContain('<details class="jev-route-block">');
		expect(block).toContain("<summary>JEV 分流判断 → D 待办事项（48%）</summary>");
		const listLines = block.split("\n").filter((l) => l.startsWith("- "));
		expect(listLines.length).toBeGreaterThan(3);
		expect(block).not.toContain("> - ");
	});

	it("quote 样式不带 callout 语法", () => {
		const block = buildRouteBlock(DECISION, makeSettings({ blockStyle: "quote" }), {
			moved: true,
		});
		expect(block).toContain("> **JEV 分流判断 → D 待办事项**");
		expect(block).not.toContain("[!jev-route]");
	});
});

describe("stripRouteBlock", () => {
	it("没有判断块时原样返回", () => {
		expect(stripRouteBlock("正文")).toBe("正文");
	});

	it("只有起始标记、没有结束标记时不乱删内容", () => {
		const broken = `${BLOCK_START}\n正文`;
		expect(stripRouteBlock(broken)).toBe(broken);
	});

	it("移除块后不留下多余空行", () => {
		const content = `---\ntitle: x\n---\n\n${TOP_BLOCK}\n\n正文`;
		expect(stripRouteBlock(content)).toBe("---\ntitle: x\n---\n\n正文");
	});
});

describe("upsertRouteBlock", () => {
	const cases: Array<[string, string]> = [
		["带 frontmatter", "---\ntitle: x\n---\n\n正文第一行\n\n正文第二行"],
		["不带 frontmatter", "正文第一行\n\n正文第二行"],
		["单行正文", "只有一行"],
		["空笔记", ""],
	];

	for (const [name, original] of cases) {
		it(`${name}：${"top"} 插入后 strip 能精确还原`, () => {
			const next = upsertRouteBlock(original, TOP_BLOCK, "top");
			expect(stripRouteBlock(next)).toBe(original);
		});

		it(`${name}：bottom 插入后 strip 能精确还原`, () => {
			const next = upsertRouteBlock(original, TOP_BLOCK, "bottom");
			expect(stripRouteBlock(next)).toBe(original);
		});
	}

	it("top 插入在 frontmatter 之后、正文之前", () => {
		const next = upsertRouteBlock("---\ntitle: x\n---\n\n正文", TOP_BLOCK, "top");
		expect(next.indexOf("title: x")).toBeLessThan(next.indexOf(BLOCK_START));
		expect(next.indexOf(BLOCK_START)).toBeLessThan(next.indexOf("正文"));
	});

	it("bottom 插入在正文末尾", () => {
		const next = upsertRouteBlock("---\ntitle: x\n---\n\n正文", TOP_BLOCK, "bottom");
		expect(next.indexOf("正文")).toBeLessThan(next.indexOf(BLOCK_START));
	});

	it("重复写入只保留一个块，不留旧内容", () => {
		const first = upsertRouteBlock("正文", TOP_BLOCK, "top");
		const second = upsertRouteBlock(first, TOP_BLOCK, "top");
		expect(second.split(BLOCK_START).length - 1).toBe(1);
		expect(second.split(BLOCK_END).length - 1).toBe(1);
		expect(second).toBe(first);
	});

	it("改判后旧块的痕迹不残留", () => {
		const oldBlock = buildRouteBlock(DECISION, makeSettings(), { moved: true });
		const newDecision = makeDecision({
			categoryKey: "B",
			categoryLabel: "产品灵感",
			targetFolder: "腾讯-产品",
		});
		const newBlock = buildRouteBlock(newDecision, makeSettings(), { moved: true });
		const next = upsertRouteBlock(`正文\n\n${oldBlock}`, newBlock, "top");
		expect(next).not.toContain("D 待办事项");
		expect(next).toContain("B 产品灵感");
	});
});

describe("toJudgeInput", () => {
	it("去掉判断块", () => {
		const input = toJudgeInput(`---\ntitle: x\n---\n\n${TOP_BLOCK}\n\n正文`);
		expect(input).not.toContain(BLOCK_START);
		expect(input).toContain("正文");
	});

	it("去掉自己写的 jev-* 字段，保留用户自己的 frontmatter", () => {
		const content = [
			"---",
			"title: 我的笔记",
			"jev-category: D 待办事项",
			"jev-confidence: 0.48",
			"tags:",
			"  - 待办",
			"---",
			"",
			"正文",
		].join("\n");
		const input = toJudgeInput(content);
		expect(input).toContain("title: 我的笔记");
		expect(input).not.toContain("jev-category");
		expect(input).not.toContain("jev-confidence");
		expect(input).toContain("正文");
	});

	it("frontmatter 里只剩 jev-* 字段时整段移除", () => {
		const content = "---\njev-category: D 待办事项\n---\n\n正文";
		expect(toJudgeInput(content)).toBe("正文");
	});

	it("去掉首尾空白", () => {
		expect(toJudgeInput("\n\n正文\n\n")).toBe("正文");
	});
});

describe("toJudgeFingerprintSource", () => {
	it("只看正文，不含 frontmatter", () => {
		expect(toJudgeFingerprintSource("---\ntitle: x\n---\n\n正文")).toBe("正文");
	});

	it("剥掉判断块", () => {
		expect(toJudgeFingerprintSource(`正文\n\n${TOP_BLOCK}`)).toBe("正文");
	});

	it("插件自己写进 frontmatter 的内容不影响指纹（否则缓存永远失效）", () => {
		const before = toJudgeFingerprintSource("---\ntitle: x\n---\n\n正文");
		const after = toJudgeFingerprintSource(
			"---\ntitle: x\njev-category: D 待办事项\ntags:\n  - 待办\n---\n\n正文"
		);
		expect(after).toBe(before);
	});

	it("真正改正文会改变指纹", () => {
		expect(toJudgeFingerprintSource("正文")).not.toBe(toJudgeFingerprintSource("正文，补充一句"));
	});
});

describe("buildFrontmatterFields", () => {
	it("写入四个基础字段，并带上目标文件夹", () => {
		const fields = buildFrontmatterFields(DECISION, makeSettings());
		const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
		expect(byKey["jev-category"]).toBe("D 待办事项");
		expect(byKey["jev-confidence"]).toBe(0.48);
		expect(byKey["jev-model"]).toBe("jev-1.13.0");
		expect(byKey["jev-routed-at"]).toBe(new Date(DECISION.at).toISOString());
		expect(byKey["jev-folder"]).toBe("要做的事");
		expect(byKey["tags"]).toEqual(["待办"]);
	});

	it("目标文件夹为空时不写 jev-folder", () => {
		const fields = buildFrontmatterFields(makeDecision({ targetFolder: "" }), makeSettings());
		expect(fields.some((f) => f.key === "jev-folder")).toBe(false);
	});

	it("分类没配标签时不写 tags", () => {
		const settings = makeSettings();
		settings.categories = settings.categories.map((c) =>
			c.key === "D" ? { ...c, tag: "" } : c
		);
		const fields = buildFrontmatterFields(DECISION, settings);
		expect(fields.some((f) => f.key === "tags")).toBe(false);
	});
});

describe("applyFrontmatterFields", () => {
	it("tags 与已有数组合并去重", () => {
		const fm: Record<string, unknown> = { tags: ["已有", "待办"] };
		applyFrontmatterFields(fm, [{ key: "tags", value: ["待办", "新增"] }]);
		expect(fm.tags).toEqual(["已有", "待办", "新增"]);
	});

	it("tags 是字符串时转成数组", () => {
		const fm: Record<string, unknown> = { tags: "已有" };
		applyFrontmatterFields(fm, [{ key: "tags", value: ["待办"] }]);
		expect(fm.tags).toEqual(["已有", "待办"]);
	});

	it("没有 tags 时新建", () => {
		const fm: Record<string, unknown> = {};
		applyFrontmatterFields(fm, [{ key: "tags", value: ["待办"] }]);
		expect(fm.tags).toEqual(["待办"]);
	});

	it("普通字段直接覆盖", () => {
		const fm: Record<string, unknown> = { "jev-category": "旧值" };
		applyFrontmatterFields(fm, [{ key: "jev-category", value: "D 待办事项" }]);
		expect(fm["jev-category"]).toBe("D 待办事项");
	});

	it("空标签列表不会写入空 tags 字段", () => {
		const fm: Record<string, unknown> = {};
		applyFrontmatterFields(fm, [{ key: "tags", value: [] }]);
		expect("tags" in fm).toBe(false);
	});
});
