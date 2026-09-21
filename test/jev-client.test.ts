import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CONTENT_CHARS } from "../src/constants";
import { JevClient, JevError, hashContent } from "../src/jev-client";
import type { JevResponse } from "../src/types";
import { makeSettings } from "./helpers/fixtures";
import { __setRequestHandler, makeResponse, type RequestUrlParam } from "./mocks/obsidian";

const CATEGORIES = makeSettings().categories;

interface Captured {
	param: RequestUrlParam;
	body: {
		model: string;
		state: Record<string, string>;
		questions: Record<string, { type: string; instructions: string; criteria: unknown }>;
	};
}

/** 装一个 http 层，把每次请求的参数收集下来，按队列依次返回响应 */
function installHttp(queue: Array<JevResponse | { status: number; body: unknown } | Error>) {
	const captured: Captured[] = [];
	__setRequestHandler(async (param) => {
		const record: Captured = {
			param,
			body: JSON.parse(param.body ?? "{}") as Captured["body"],
		};
		captured.push(record);
		const next = queue.shift();
		if (next === undefined) throw new Error("测试没有准备足够的响应");
		if (next instanceof Error) throw next;
		if ("status" in next) return makeResponse(next.status, next.body);
		return makeResponse(200, next);
	});
	return captured;
}

function makeClient(config: Partial<{ apiKey: string; apiUrl: string; model: string }> = {}) {
	const full = {
		apiKey: "apikey_test",
		apiUrl: "https://api.typesafe.ai/v1/systemone",
		model: "jev-latest",
		...config,
	};
	const client = new JevClient(() => full, { retryBaseMs: 0, maxAttempts: 3 });
	return { client, config: full };
}

const INPUT = { title: "随手记", path: "Inbox/随手记.md", content: "明天上午十点跟张总过路线图" };

function choiceResponse(
	choice: string,
	probabilities: Record<string, number>,
	extra: Partial<JevResponse> = {}
): JevResponse {
	return {
		model: "jev-1.13.0",
		answers: {
			category: { type: "choice", choice, confidence: 0.39, probabilities },
		},
		usage: { input_tokens: 372, output_tokens: 59 },
		...extra,
	};
}

const FULL_PROBS = { A: 0.06, B: 0.02, C: 0.34, D: 0.48, E: 0.05, F: 0.05 };

afterEach(() => {
	__setRequestHandler(null);
	vi.restoreAllMocks();
});

describe("JevClient.classify 请求构造", () => {
	it("打到配置的端点，带 Bearer 头和 JSON Content-Type", async () => {
		const captured = installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client, config } = makeClient();

		await client.classify(INPUT, CATEGORIES, { lowValueEnabled: true });

		expect(captured).toHaveLength(1);
		expect(captured[0].param.url).toBe(config.apiUrl);
		expect(captured[0].param.method).toBe("POST");
		expect(captured[0].param.headers?.Authorization).toBe(`Bearer ${config.apiKey}`);
		expect(captured[0].param.headers?.["Content-Type"]).toBe("application/json");
	});

	it("state 里带上标题、路径与正文", async () => {
		const captured = installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();

		await client.classify(INPUT, CATEGORIES, { lowValueEnabled: true });

		expect(captured[0].body.state.note_title).toBe("随手记");
		expect(captured[0].body.state.note_path).toBe("Inbox/随手记.md");
		expect(captured[0].body.state.note_content).toBe(INPUT.content);
		expect(captured[0].body.model).toBe("jev-latest");
	});

	it("category 问题是 choice，criteria 只含启用的分类", async () => {
		const captured = installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();
		const categories = CATEGORIES.map((c) => (c.key === "B" ? { ...c, enabled: false } : c));

		await client.classify(INPUT, categories, { lowValueEnabled: false });

		const category = captured[0].body.questions.category;
		expect(category.type).toBe("choice");
		expect(Object.keys(category.criteria as Record<string, string>).sort()).toEqual([
			"A",
			"C",
			"D",
			"E",
			"F",
		]);
	});

	it("关掉长期价值后不再问 value", async () => {
		const captured = installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();

		await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(captured[0].body.questions.value).toBeUndefined();
		expect(captured[0].body.questions.category).toBeDefined();
	});

	it("超长正文被截断，但保留头尾", async () => {
		const captured = installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();
		const content = `开头标记${"中".repeat(MAX_CONTENT_CHARS * 2)}结尾标记`;

		await client.classify({ ...INPUT, content }, CATEGORIES, { lowValueEnabled: false });

		const sent = captured[0].body.state.note_content;
		expect(sent.length).toBeLessThan(content.length);
		expect(sent.startsWith("开头标记")).toBe(true);
		expect(sent.endsWith("结尾标记")).toBe(true);
	});
});

describe("JevClient.classify 结果映射", () => {
	it("用被选中选项的概率作为置信度，而不是模型自报的 confidence", async () => {
		installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(decision.confidence).toBeCloseTo(0.48, 6);
		expect(decision.modelConfidence).toBeCloseTo(0.39, 6);
	});

	it("概率分布按降序排好，且带上展示用的名字与配色", async () => {
		installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(decision.ranking.map((r) => r.key)).toEqual(["D", "C", "A", "E", "F", "B"]);
		expect(decision.ranking[0]).toMatchObject({
			label: "待办事项",
			short: "待办",
			color: "#FFC53D",
		});
	});

	it("领先优势 = 首选概率 / 次选概率", async () => {
		installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(decision.margin).toBeCloseTo(0.48 / 0.34, 6);
	});

	it("只有一个候选时领先优势为无穷", async () => {
		installHttp([choiceResponse("A", { A: 1, B: 0 })]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(decision.margin).toBe(Number.POSITIVE_INFINITY);
	});

	it("带去目标文件夹与分类显示名", async () => {
		installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(decision.categoryKey).toBe("D");
		expect(decision.categoryLabel).toBe("待办事项");
		expect(decision.targetFolder).toBe("要做的事");
	});

	it("value 分数四舍五入成档位索引", async () => {
		installHttp([
			choiceResponse("D", FULL_PROBS, {
				answers: {
					category: { type: "choice", choice: "D", probabilities: FULL_PROBS },
					value: { type: "score", score: 2.4 },
				},
			}),
		]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: true });
		expect(decision.valueIndex).toBe(2);
	});

	it("value 分数越界时被夹到合法档位", async () => {
		const { client } = makeClient();
		const run = async (score: number) => {
			installHttp([
				choiceResponse("D", FULL_PROBS, {
					answers: {
						category: { type: "choice", choice: "D", probabilities: FULL_PROBS },
						value: { type: "score", score },
					},
				}),
			]);
			return (await client.classify(INPUT, CATEGORIES, { lowValueEnabled: true })).valueIndex;
		};

		expect(await run(9.9)).toBe(3);
		expect(await run(-3)).toBe(0);
	});

	it("没有返回 value 时索引为 null", async () => {
		installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: true });
		expect(decision.valueIndex).toBeNull();
	});

	it("保留模型版本与 token 用量", async () => {
		installHttp([choiceResponse("D", FULL_PROBS)]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(decision.model).toBe("jev-1.13.0");
		expect(decision.usage?.input_tokens).toBe(372);
	});
});

describe("JevClient.classify 错误处理", () => {
	it("没有 API Key 时不发请求直接报错", async () => {
		const captured = installHttp([]);
		const { client } = makeClient({ apiKey: "  " });

		await expect(
			client.classify(INPUT, CATEGORIES, { lowValueEnabled: false })
		).rejects.toBeInstanceOf(JevError);
		expect(captured).toHaveLength(0);
	});

	it("启用分类少于两个时报错", async () => {
		const captured = installHttp([]);
		const { client } = makeClient();
		const oneCategory = CATEGORIES.map((c) => ({ ...c, enabled: c.key === "D" }));

		await expect(
			client.classify(INPUT, oneCategory, { lowValueEnabled: false })
		).rejects.toThrow(/2 个分类/);
		expect(captured).toHaveLength(0);
	});

	it("JEV 返回未知分类时报错，而不是静默落到别的目录", async () => {
		installHttp([choiceResponse("Z", { Z: 0.9, D: 0.1 })]);
		const { client } = makeClient();

		await expect(
			client.classify(INPUT, CATEGORIES, { lowValueEnabled: false })
		).rejects.toThrow(/未知分类/);
	});

	it("category 不是 choice 类型时报错", async () => {
		installHttp([
			{
				model: "jev-1.13.0",
				answers: { category: { type: "noul", noul: 0.9 } },
			},
		]);
		const { client } = makeClient();

		await expect(
			client.classify(INPUT, CATEGORIES, { lowValueEnabled: false })
		).rejects.toThrow(/没有返回有效的分类结果/);
	});

	it("401 不重试", async () => {
		const captured = installHttp([{ status: 401, body: "unauthorized" }]);
		const { client } = makeClient();

		await expect(
			client.classify(INPUT, CATEGORIES, { lowValueEnabled: false })
		).rejects.toThrow(/API Key/);
		expect(captured).toHaveLength(1);
	});

	it("429 会重试，第二次成功就正常返回", async () => {
		const captured = installHttp([
			{ status: 429, body: "rate limited" },
			choiceResponse("D", FULL_PROBS),
		]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(captured).toHaveLength(2);
		expect(decision.categoryKey).toBe("D");
	});

	it("网络异常也会重试", async () => {
		const captured = installHttp([
			new Error("socket hang up"),
			choiceResponse("D", FULL_PROBS),
		]);
		const { client } = makeClient();

		const decision = await client.classify(INPUT, CATEGORIES, { lowValueEnabled: false });

		expect(captured).toHaveLength(2);
		expect(decision.categoryKey).toBe("D");
	});

	it("连续 529 时重试到上限后抛错", async () => {
		const captured = installHttp([
			{ status: 529, body: "overloaded" },
			{ status: 529, body: "overloaded" },
			{ status: 529, body: "overloaded" },
		]);
		const { client } = makeClient();

		await expect(
			client.classify(INPUT, CATEGORIES, { lowValueEnabled: false })
		).rejects.toThrow(/过载/);
		expect(captured).toHaveLength(3);
	});

	it("响应体里带 error 字段时报错", async () => {
		installHttp([{ model: "jev-1.13.0", error: { message: "bad request" } }]);
		const { client } = makeClient();

		await expect(
			client.classify(INPUT, CATEGORIES, { lowValueEnabled: false })
		).rejects.toThrow(/bad request/);
	});
});

describe("hashContent", () => {
	it("相同内容得到相同指纹", () => {
		expect(hashContent("abc")).toBe(hashContent("abc"));
	});

	it("内容不同则指纹不同", () => {
		expect(hashContent("abc")).not.toBe(hashContent("abd"));
	});

	it("空串也能稳定计算", () => {
		expect(hashContent("")).toBe(hashContent(""));
	});
});
