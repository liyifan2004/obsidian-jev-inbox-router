import type { App } from "obsidian";
import { afterEach, describe, expect, it } from "vitest";
import { BLOCK_END, BLOCK_START, MAX_CONTENT_CHARS } from "../src/constants";
import { JevClient } from "../src/jev-client";
import { InboxRouter, type RouterHost } from "../src/router";
import type { CacheEntry, JevSettings, UndoEntry } from "../src/types";
import { FakeVault, parseFrontmatter } from "./helpers/fake-vault";
import { makeSettings } from "./helpers/fixtures";
import { __setRequestHandler, makeResponse, type RequestUrlParam } from "./mocks/obsidian";

// ------------------------------------------------------------------ 测试脚手架

interface Captured {
	param: RequestUrlParam;
	body: {
		model: string;
		state: { note_title: string; note_path: string; note_content: string };
		questions: Record<string, unknown>;
	};
}

/** 装一个假 http 层，固定返回「判为某个分类」的结果 */
function installClassifier(options: {
	choice?: string;
	probabilities?: Record<string, number>;
	valueScore?: number;
	modelConfidence?: number;
}) {
	const choice = options.choice ?? "D";
	const probabilities =
		options.probabilities ?? { A: 0.06, B: 0.02, C: 0.34, D: 0.48, E: 0.05, F: 0.05 };
	const captured: Captured[] = [];

	__setRequestHandler(async (param) => {
		captured.push({ param, body: JSON.parse(param.body ?? "{}") });
		const answers: Record<string, unknown> = {
			category: {
				type: "choice",
				choice,
				confidence: options.modelConfidence ?? 0.39,
				probabilities,
			},
		};
		if (options.valueScore !== undefined) {
			answers.value = { type: "score", score: options.valueScore };
		}
		return makeResponse(200, {
			model: "jev-1.13.0",
			answers,
			usage: { input_tokens: 372, output_tokens: 59 },
		});
	});

	return captured;
}

class TestHost implements RouterHost {
	readonly cache = new Map<string, CacheEntry>();
	readonly undos: UndoEntry[] = [];
	selfWrites = 0;

	constructor(public settings: JevSettings, public client: JevClient) {}

	getSettings(): JevSettings {
		return this.settings;
	}

	getClient(): JevClient {
		return this.client;
	}

	getCache(path: string): CacheEntry | null {
		return this.cache.get(path) ?? null;
	}

	setCache(path: string, entry: CacheEntry): void {
		this.cache.set(path, entry);
	}

	invalidateCache(path: string): void {
		this.cache.delete(path);
	}

	pushUndo(entry: UndoEntry): void {
		this.undos.push(entry);
	}

	beginSelfWrite(): void {
		this.selfWrites++;
	}
}

function setup(options: {
	settings?: Partial<JevSettings>;
	choice?: string;
	probabilities?: Record<string, number>;
	valueScore?: number;
	files?: Record<string, string>;
	folders?: string[];
}) {
	const vault = new FakeVault();
	vault.seed(options.files ?? { "Inbox/随手记.md": "明天上午十点跟张总过路线图" }, options.folders);

	const settings = makeSettings(options.settings ?? {});
	const client = new JevClient(
		() => ({ apiKey: "apikey_test", apiUrl: "https://example.test/v1", model: "jev-latest" }),
		{ retryBaseMs: 0, maxAttempts: 1 }
	);
	const host = new TestHost(settings, client);
	const app = { vault, fileManager: vault.fileManager } as unknown as App;
	const router = new InboxRouter(app, host);
	const captured = installClassifier({
		choice: options.choice,
		probabilities: options.probabilities,
		valueScore: options.valueScore,
	});

	return { vault, settings, host, router, captured };
}

afterEach(() => {
	__setRequestHandler(null);
});

// ------------------------------------------------------------------ 用例

describe("route：正常分流", () => {
	it("判断达标时把文件搬到目标文件夹", async () => {
		const { vault, router } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.moved).toBe(true);
		expect(result.toPath).toBe("要做的事/随手记.md");
		expect(vault.has("要做的事/随手记.md")).toBe(true);
		expect(vault.has("Inbox/随手记.md")).toBe(false);
	});

	it("顺便把目标文件夹建出来", async () => {
		const { vault, router } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);

		expect(vault.has("要做的事")).toBe(true);
	});

	it("在笔记里写入判断块，且不改动正文", async () => {
		const { vault, router } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);

		const text = vault.text("要做的事/随手记.md");
		expect(text).toContain(BLOCK_START);
		expect(text).toContain(BLOCK_END);
		expect(text).toContain("**去向**：D 待办事项 → `要做的事`");
		expect(text).toContain("明天上午十点跟张总过路线图");
	});

	it("在 frontmatter 里写入判断结果", async () => {
		const { vault, router } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);

		const { data } = parseFrontmatter(vault.text("要做的事/随手记.md"));
		expect(data["jev-category"]).toBe("D 待办事项");
		expect(data["jev-confidence"]).toBe(0.48);
		expect(data["jev-model"]).toBe("jev-1.13.0");
		expect(data["jev-folder"]).toBe("要做的事");
		expect(data["tags"]).toEqual(["待办"]);
	});

	it("记录一次可撤销的分流，并带上改动前的内容", async () => {
		const { vault, host, router } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);

		expect(host.undos).toHaveLength(1);
		expect(host.undos[0].path).toBe("要做的事/随手记.md");
		expect(host.undos[0].previousPath).toBe("Inbox/随手记.md");
		expect(host.undos[0].previousContent).not.toContain(BLOCK_START);
	});

	it("缓存跟着文件的新路径走", async () => {
		const { vault, host, router } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);

		expect(host.getCache("Inbox/随手记.md")).toBeNull();
		expect(host.getCache("要做的事/随手记.md")).not.toBeNull();
	});
});

describe("route：门槛拦下时不移动", () => {
	it("置信度不够时只标记，并写明原因", async () => {
		const { vault, router } = setup({
			probabilities: { A: 0.1, B: 0.1, C: 0.3, D: 0.3, E: 0.1, F: 0.1 },
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.moved).toBe(false);
		expect(result.blockedReason).toContain("置信度");
		expect(vault.has("Inbox/随手记.md")).toBe(true);
		expect(vault.text("Inbox/随手记.md")).toContain("**未自动分流的原因**");
		expect(vault.text("Inbox/随手记.md")).toContain("（未移动）");
	});

	it("领先优势不够时同样不移动", async () => {
		const { vault, router } = setup({
			probabilities: { A: 0.05, B: 0.05, C: 0.4, D: 0.42, E: 0.04, F: 0.04 },
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.moved).toBe(false);
		expect(result.blockedReason).toContain("1.05");
	});

	it("模型选出的分类不是概率最高项时，领先优势小于 1，同样被拦下", async () => {
		const { vault, router } = setup({
			probabilities: { A: 0.04, B: 0.03, C: 0.46, D: 0.42, E: 0.03, F: 0.02 },
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.moved).toBe(false);
		expect(result.blockedReason).toContain("0.91");
	});

	it("门槛放得很低时又会移动", async () => {
		const { vault, router } = setup({
			settings: { confidenceThreshold: 0.2, marginThreshold: 1.0 },
			probabilities: { A: 0.1, B: 0.1, C: 0.3, D: 0.3, E: 0.1, F: 0.1 },
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);
		expect(result.moved).toBe(true);
	});
});

describe("route：被判为「应该删除」时的处置", () => {
	const asDelete = {
		choice: "F",
		probabilities: { A: 0.02, B: 0.02, C: 0.02, D: 0.02, E: 0.02, F: 0.9 },
	};

	it("默认只标记、不移动、绝不删除", async () => {
		const { vault, router } = setup(asDelete);
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.moved).toBe(false);
		expect(result.blockedReason).toContain("应该删除");
		expect(vault.has("Inbox/随手记.md")).toBe(true);
	});

	it("设置成 move 时搬到该分类的文件夹", async () => {
		const { vault, router } = setup({
			...asDelete,
			settings: { deletionHandling: "move" },
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.moved).toBe(true);
		expect(result.toPath).toBe("_附件-归档-模板/归档/随手记.md");
		expect(vault.has("Inbox/随手记.md")).toBe(false);
	});

	it("设置成 ignore 时完全不动，但仍然留下判断块", async () => {
		const { vault, router } = setup({
			...asDelete,
			settings: { deletionHandling: "ignore" },
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.moved).toBe(false);
		expect(vault.has("Inbox/随手记.md")).toBe(true);
		expect(vault.text("Inbox/随手记.md")).toContain(BLOCK_START);
	});
});

describe("route：幂等与缓存", () => {
	it("内容没变时不重复调用 JEV", async () => {
		const { vault, router, captured } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);
		const second = await router.route(vault.getAbstractFileByPath("要做的事/随手记.md")! as never);

		expect(captured).toHaveLength(1);
		expect(second.moved).toBe(false);
		expect(second.fromCache).toBe(true);
	});

	it("重新判断时送给 JEV 的内容里不含上一次写的判断块", async () => {
		const { vault, router, captured } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);
		await router.route(vault.getAbstractFileByPath("要做的事/随手记.md")! as never, {
			force: true,
		});

		expect(captured).toHaveLength(2);
		expect(captured[1].body.state.note_content).not.toContain(BLOCK_START);
		expect(captured[1].body.state.note_content).not.toContain("jev-route");
		expect(captured[1].body.state.note_content).toContain("明天上午十点跟张总过路线图");
	});

	it("重新判断时送给 JEV 的内容里不含自己写的 frontmatter 字段", async () => {
		const { vault, router, captured } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);
		await router.route(vault.getAbstractFileByPath("要做的事/随手记.md")! as never, {
			force: true,
		});

		expect(captured[1].body.state.note_content).not.toContain("jev-category");
		expect(captured[1].body.state.note_content).not.toContain("jev-confidence");
	});

	it("正文改动后缓存失效，会重新判断", async () => {
		const { vault, router, captured } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;
		await router.route(file as never);

		const target = vault.getAbstractFileByPath("要做的事/随手记.md")! as never as {
			path: string;
		};
		vault.contents.set(
			target.path,
			`${vault.text(target.path)}\n\n又补了一句新想法`
		);

		await router.route(vault.getAbstractFileByPath(target.path)! as never);
		expect(captured).toHaveLength(2);
	});

	it("force 时即使内容没变也重新判断", async () => {
		const { vault, router, captured } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);
		await router.route(vault.getAbstractFileByPath("要做的事/随手记.md")! as never, {
			force: true,
		});

		expect(captured).toHaveLength(2);
	});

	it("只改 frontmatter 时不重复判断（指纹只看正文）", async () => {
		const { vault, router, captured } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;
		await router.route(file as never);

		const target = "要做的事/随手记.md";
		vault.contents.set(target, vault.text(target).replace("jev-model:", "jev-model: "));

		const result = await router.route(vault.getAbstractFileByPath(target)! as never);

		expect(captured).toHaveLength(1);
		expect(result.fromCache).toBe(true);
	});

	it("已经在目标文件夹里时不再重复移动", async () => {
		const { vault, router } = setup({ files: { "要做的事/随手记.md": "明天上午十点跟张总过路线图" } });
		const file = vault.getAbstractFileByPath("要做的事/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.moved).toBe(false);
		expect(vault.renameLog).toHaveLength(0);
		expect(vault.has("要做的事/随手记.md")).toBe(true);
	});
});

describe("route：同名冲突与 dryRun", () => {
	it("目标文件夹已有同名文件时自动加序号", async () => {
		const { vault, router } = setup({
			files: {
				"Inbox/随手记.md": "明天上午十点跟张总过路线图",
				"要做的事/随手记.md": "已有的同名笔记",
			},
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.toPath).toBe("要做的事/随手记 1.md");
		expect(vault.text("要做的事/随手记.md")).toBe("已有的同名笔记");
	});

	it("连续冲突时序号继续递增", async () => {
		const { vault, router } = setup({
			files: {
				"Inbox/随手记.md": "明天上午十点跟张总过路线图",
				"要做的事/随手记.md": "a",
				"要做的事/随手记 1.md": "b",
			},
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);
		expect(result.toPath).toBe("要做的事/随手记 2.md");
	});

	it("dryRun 不写文件、不移动、不写缓存", async () => {
		const { vault, host, router } = setup({});
		const before = vault.text("Inbox/随手记.md");
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never, { dryRun: true });

		expect(result.moved).toBe(false);
		expect(result.decision.categoryKey).toBe("D");
		expect(vault.text("Inbox/随手记.md")).toBe(before);
		expect(vault.renameLog).toHaveLength(0);
		expect(host.cache.size).toBe(0);
		expect(host.undos).toHaveLength(0);
	});
});

describe("undo", () => {
	it("把文件挪回原位并还原内容", async () => {
		const { vault, host, router } = setup({});
		const before = vault.text("Inbox/随手记.md");
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;
		await router.route(file as never);

		const ok = await router.undo(host.undos[0]);

		expect(ok).toBe(true);
		expect(vault.has("Inbox/随手记.md")).toBe(true);
		expect(vault.text("Inbox/随手记.md")).toBe(before);
	});

	it("文件已经不存在时返回 false，不抛错", async () => {
		const { host, router } = setup({});
		const ok = await router.undo({
			path: "不存在.md",
			previousPath: "Inbox/不存在.md",
			previousContent: null,
			at: Date.now(),
		});
		expect(ok).toBe(false);
		expect(host.undos).toHaveLength(0);
	});

	it("撤销会清掉新旧两个路径的缓存", async () => {
		const { vault, host, router } = setup({});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;
		await router.route(file as never);
		expect(host.getCache("要做的事/随手记.md")).not.toBeNull();

		await router.undo(host.undos[0]);

		expect(host.getCache("要做的事/随手记.md")).toBeNull();
		expect(host.getCache("Inbox/随手记.md")).toBeNull();
	});
});

describe("removeBlock", () => {
	it("移除判断块后只留正文", async () => {
		const { vault, router } = setup({});
		const before = vault.text("Inbox/随手记.md");
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;
		await router.route(file as never);

		await router.removeBlock(vault.getAbstractFileByPath("要做的事/随手记.md")! as never);

		const text = vault.text("要做的事/随手记.md");
		expect(text).not.toContain(BLOCK_START);
		expect(text).toContain("明天上午十点跟张总过路线图");
		expect(before).toBe("明天上午十点跟张总过路线图");
	});

	it("没有判断块时内容不变", async () => {
		const { vault, router } = setup({});
		const before = vault.text("Inbox/随手记.md");
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.removeBlock(file as never);

		expect(vault.text("Inbox/随手记.md")).toBe(before);
	});
});

describe("moveTo", () => {
	it("直接搬到指定文件夹，不再判断", async () => {
		const { vault, router } = setup({ files: {}, folders: ["Inbox", "英语"] });
		const file = vault.addFile("Inbox/单词.md", "abandon");

		const target = await router.moveTo(file, "英语");

		expect(target).toBe("英语/单词.md");
		expect(vault.has("英语/单词.md")).toBe(true);
	});

	it("目标是库根目录时搬到根", async () => {
		const { vault, router } = setup({ files: {} });
		const file = vault.addFile("Inbox/单词.md", "abandon");

		const target = await router.moveTo(file, "");

		expect(target).toBe("单词.md");
	});
});

describe("listMarkdownFiles", () => {
	it("递归列出子目录里的 Markdown", () => {
		const { vault, router } = setup({
			files: {
				"Inbox/a.md": "a",
				"Inbox/子目录/b.md": "b",
				"Inbox/图片.png": "",
				"别处/c.md": "c",
			},
		});

		const found = router.listMarkdownFiles("Inbox").map((f) => f.path).sort();

		expect(found).toEqual(["Inbox/a.md", "Inbox/子目录/b.md"]);
		expect(vault.paths()).toContain("别处/c.md");
	});

	it("文件夹不存在时返回空数组", () => {
		const { router } = setup({});
		expect(router.listMarkdownFiles("不存在的目录")).toEqual([]);
	});

	it("传空字符串时列出整个库", () => {
		const { router } = setup({
			files: { "Inbox/a.md": "a", "别处/c.md": "c" },
		});
		expect(router.listMarkdownFiles("").map((f) => f.path).sort()).toEqual([
			"Inbox/a.md",
			"别处/c.md",
		]);
	});
});

describe("ensureFolder", () => {
	it("逐级把缺失的目录建出来", async () => {
		const { vault, router } = setup({ files: {} });

		await router.ensureFolder("a/b/c");

		expect(vault.has("a")).toBe(true);
		expect(vault.has("a/b")).toBe(true);
		expect(vault.has("a/b/c")).toBe(true);
	});

	it("已经存在时不重复创建", async () => {
		const { vault, router } = setup({ files: {}, folders: ["已有"] });
		const before = vault.createdFolders.length;

		await router.ensureFolder("已有");

		expect(vault.createdFolders.length).toBe(before);
	});

	it("空路径直接返回", async () => {
		const { vault, router } = setup({ files: {} });
		await router.ensureFolder("");
		expect(vault.createdFolders).toHaveLength(0);
	});
});

describe("getAllFolders", () => {
	it("包含库根目录与所有子目录，且按名称排序", () => {
		const { router } = setup({ files: {}, folders: ["b", "a", "a/c"] });
		expect(router.getAllFolders()).toEqual(["", "a", "a/c", "b"]);
	});
});

describe("把正文交给 JEV 前的截断与清洗", () => {
	it("段落级内容原样送出去", async () => {
		const { vault, router, captured } = setup({
			files: { "Inbox/长文.md": "第一段\n\n第二段" },
		});
		await router.route(vault.getAbstractFileByPath("Inbox/长文.md")! as never);
		expect(captured[0].body.state.note_content).toBe("第一段\n\n第二段");
	});

	it("超长内容被截断", async () => {
		const long = "甲".repeat(MAX_CONTENT_CHARS + 500);
		const { vault, router, captured } = setup({ files: { "Inbox/长文.md": long } });

		await router.route(vault.getAbstractFileByPath("Inbox/长文.md")! as never);

		expect(captured[0].body.state.note_content.length).toBeLessThan(long.length);
	});
});

describe("决策对象", () => {
	it("把选中的分类映射到配置里的目标文件夹", async () => {
		const { vault, router } = setup({
			choice: "B",
			probabilities: { A: 0.02, B: 0.9, C: 0.02, D: 0.02, E: 0.02, F: 0.02 },
		});
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		const result = await router.route(file as never);

		expect(result.decision.categoryLabel).toBe("产品灵感");
		expect(result.toPath).toBe("腾讯-产品/随手记.md");
	});

	it("长期价值档位会写进判断块", async () => {
		const { vault, router } = setup({ valueScore: 3 });
		const file = vault.getAbstractFileByPath("Inbox/随手记.md")!;

		await router.route(file as never);

		expect(vault.text("要做的事/随手记.md")).toContain("**长期价值**：4/4");
	});
});
