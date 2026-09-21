import { describe, expect, it } from "vitest";
import {
	evaluateGate,
	isDeletionDecision,
	isInInboxPath,
	isTooShort,
	normalizeFolder,
	resolveDeletionKey,
	statusViewForRoute,
} from "../src/rules";
import { makeDecision, makeSettings } from "./helpers/fixtures";

describe("evaluateGate", () => {
	it("置信度与领先优势都达标时放行", () => {
		const gate = evaluateGate(makeDecision(), makeSettings());
		expect(gate.passed).toBe(true);
		expect(gate.reason).toBeUndefined();
	});

	it("置信度不足时拦下，并说明差在哪", () => {
		const gate = evaluateGate(makeDecision({ confidence: 0.3 }), makeSettings());
		expect(gate.passed).toBe(false);
		expect(gate.reason).toContain("置信度");
		expect(gate.reason).toContain("30%");
	});

	it("领先优势不足时拦下，即使置信度达标", () => {
		const gate = evaluateGate(
			makeDecision({ confidence: 0.5, margin: 1.05 }),
			makeSettings()
		);
		expect(gate.passed).toBe(false);
		expect(gate.reason).toContain("1.05");
	});

	it("刚好等于门槛时放行（门槛是含端点的下限）", () => {
		const settings = makeSettings({ confidenceThreshold: 0.48, marginThreshold: 1.41 });
		const decision = makeDecision({ confidence: 0.48, margin: 1.412 });
		expect(evaluateGate(decision, settings).passed).toBe(true);
	});

	it("只有一个候选（margin 为无穷）时不受领先优势门槛影响", () => {
		const decision = makeDecision({ margin: Number.POSITIVE_INFINITY });
		expect(evaluateGate(decision, makeSettings()).passed).toBe(true);
	});

	it("门槛可配置：调高后同样的判断会被拦下", () => {
		const strict = makeSettings({ confidenceThreshold: 0.6 });
		expect(evaluateGate(makeDecision(), strict).passed).toBe(false);
	});
});

describe("resolveDeletionKey", () => {
	it("默认配置返回 F", () => {
		expect(resolveDeletionKey(makeSettings())).toBe("F");
	});

	it("没有 F 时退回标签里含「删除」的分类", () => {
		const settings = makeSettings();
		settings.categories = settings.categories
			.filter((c) => c.key !== "F")
			.map((c) => (c.key === "E" ? { ...c, label: "应该删除" } : c));
		expect(resolveDeletionKey(settings)).toBe("E");
	});

	it("找不到删除类分类时返回 null", () => {
		const settings = makeSettings();
		settings.categories = settings.categories
			.filter((c) => c.key !== "F")
			.map((c) => ({ ...c, label: c.label.replace("删除", "废弃") }));
		expect(resolveDeletionKey(settings)).toBeNull();
	});

	it("F 被禁用时视为没有删除分类", () => {
		const settings = makeSettings();
		settings.categories = settings.categories.map((c) =>
			c.key === "F" ? { ...c, enabled: false } : c
		);
		expect(resolveDeletionKey(settings)).toBeNull();
	});
});

describe("isDeletionDecision", () => {
	it("判为 F 时成立", () => {
		const decision = makeDecision({ categoryKey: "F", categoryLabel: "应该删除" });
		expect(isDeletionDecision(decision, makeSettings())).toBe(true);
	});

	it("普通分类不成立", () => {
		expect(isDeletionDecision(makeDecision(), makeSettings())).toBe(false);
	});

	it("没有删除分类时永远不成立", () => {
		const settings = makeSettings();
		settings.categories = settings.categories.filter((c) => c.key !== "F");
		const decision = makeDecision({ categoryKey: "F", categoryLabel: "应该删除" });
		expect(isDeletionDecision(decision, settings)).toBe(false);
	});
});

describe("normalizeFolder", () => {
	it("去掉首尾斜杠", () => {
		expect(normalizeFolder("/Inbox/")).toBe("Inbox");
	});

	it("反斜杠归一成正斜杠", () => {
		expect(normalizeFolder("\\Inbox\\子目录")).toBe("Inbox/子目录");
	});

	it("空值返回空串", () => {
		expect(normalizeFolder("")).toBe("");
		expect(normalizeFolder(undefined as unknown as string)).toBe("");
	});
});

describe("isInInboxPath", () => {
	it("监听整个库时任何路径都成立", () => {
		const settings = makeSettings({ watchScope: "vault" });
		expect(isInInboxPath("任意/位置/文件.md", settings)).toBe(true);
	});

	it("收件箱内的文件成立", () => {
		expect(isInInboxPath("Inbox/随手记.md", makeSettings())).toBe(true);
	});

	it("收件箱子目录里的文件成立", () => {
		expect(isInInboxPath("Inbox/网页剪藏/文章.md", makeSettings())).toBe(true);
	});

	it("前缀相同但不是收件箱的目录不成立", () => {
		expect(isInInboxPath("Inbox2/文件.md", makeSettings())).toBe(false);
		expect(isInInboxPath("Inbox归档/文件.md", makeSettings())).toBe(false);
	});

	it("库根目录的文件不成立", () => {
		expect(isInInboxPath("文件.md", makeSettings())).toBe(false);
	});

	it("多个收件箱文件夹都成立", () => {
		const settings = makeSettings({ inboxFolders: ["Inbox", "临时"] });
		expect(isInInboxPath("临时/a.md", settings)).toBe(true);
		expect(isInInboxPath("Inbox/a.md", settings)).toBe(true);
	});

	it("收件箱配置里出现空串时不会把整个库当成收件箱", () => {
		const settings = makeSettings({ inboxFolders: [""] });
		expect(isInInboxPath("文件.md", settings)).toBe(false);
	});

	it("带首尾斜杠或反斜杠的配置也能匹配", () => {
		const settings = makeSettings({ inboxFolders: ["/Inbox/"] });
		expect(isInInboxPath("Inbox/a.md", settings)).toBe(true);
	});
});

describe("isTooShort", () => {
	const min = 12;

	it("空白内容算太短", () => {
		expect(isTooShort("   \n\n  ", min)).toBe(true);
	});

	it("只有 frontmatter 算太短", () => {
		expect(isTooShort("---\ntitle: 标题\n---\n", min)).toBe(true);
	});

	it("只有判断块算太短", () => {
		const onlyBlock = "<!-- jev-route:start -->\n> [!jev-route] x\n<!-- jev-route:end -->";
		expect(isTooShort(onlyBlock, min)).toBe(true);
	});

	it("标记符号不计入字数", () => {
		expect(isTooShort("### --- ** *** ``` ---", min)).toBe(true);
	});

	it("实字够多时不算太短", () => {
		expect(isTooShort("明天上午十点跟张总过一下三季度路线图", min)).toBe(false);
	});

	it("minChars 为 0 时永远不算太短", () => {
		expect(isTooShort("", 0)).toBe(false);
	});
});

describe("statusViewForRoute", () => {
	it("移动成功时显示分类短名、置信度与去向", () => {
		const view = statusViewForRoute({
			decision: makeDecision(),
			settings: makeSettings(),
			moved: true,
		});
		expect(view.kind).toBe("ok");
		expect(view.text).toBe("待办 48% → 要做的事");
		expect(view.color).toBe("#FFC53D");
	});

	it("目标是库根目录时文案写清楚", () => {
		const view = statusViewForRoute({
			decision: makeDecision({ targetFolder: "" }),
			settings: makeSettings(),
			moved: true,
		});
		expect(view.text).toBe("待办 48% → 库根目录");
	});

	it("被门槛拦下时提示存疑", () => {
		const view = statusViewForRoute({
			decision: makeDecision(),
			settings: makeSettings(),
			moved: false,
			blockedReason: "置信度不够",
		});
		expect(view.kind).toBe("warn");
		expect(view.text).toBe("待办 48% 存疑");
	});

	it("本来就在目标位置时另给一句", () => {
		const view = statusViewForRoute({
			decision: makeDecision(),
			settings: makeSettings(),
			moved: false,
		});
		expect(view.kind).toBe("warn");
		expect(view.text).toBe("待办 已在目标位置");
	});

	it("分类已从设置里删掉时退回分类全名，不显示 undefined", () => {
		const settings = makeSettings();
		settings.categories = settings.categories.filter((c) => c.key !== "D");
		const view = statusViewForRoute({
			decision: makeDecision(),
			settings,
			moved: true,
		});
		expect(view.text).toBe("待办事项 48% → 要做的事");
		expect(view.color).toBe("#7F8C99");
	});
});
