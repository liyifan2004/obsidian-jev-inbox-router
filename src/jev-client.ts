import { requestUrl } from "obsidian";
import { MAX_CONTENT_CHARS, VALUE_LEVELS } from "./constants";
import type {
	CategoryConfig,
	JevAnswerChoice,
	JevAnswerScore,
	JevProbabilityEntry,
	JevResponse,
	RouterDecision,
} from "./types";

export class JevError extends Error {
	status: number;

	constructor(message: string, status = 0) {
		super(message);
		this.name = "JevError";
		this.status = status;
	}
}

export interface JevConfig {
	apiKey: string;
	apiUrl: string;
	model: string;
}

export interface ClassifyInput {
	/** 笔记标题（不含扩展名） */
	title: string;
	/** 笔记在库中的路径 */
	path: string;
	/** 笔记正文（不含 frontmatter） */
	content: string;
}

export interface ClassifyOptions {
	lowValueEnabled: boolean;
}

export interface JevClientOptions {
	/** 重试的基础退避时间（毫秒）。测试里设成 0，避免拖慢用例。 */
	retryBaseMs?: number;
	/** 最多尝试几次（含首次） */
	maxAttempts?: number;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clamp01(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.min(1, Math.max(0, n));
}

/** 长笔记保留头尾两端，中间省略 */
function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	const head = Math.floor(max * 0.7);
	const tail = max - head;
	return `${text.slice(0, head)}\n\n…（此处省略 ${text.length - max} 字）…\n\n${text.slice(-tail)}`;
}

function explain(status: number, text: string): string {
	if (status < 0) return `网络请求失败：${text}`;
	switch (status) {
		case 401:
			return "API Key 无效或已过期（401）";
		case 403:
			return "没有访问权限（403），请检查 Key 所属账号是否已从 waitlist 放行";
		case 422:
			return `请求体校验失败（422）：${text.slice(0, 300)}`;
		case 429:
			return "触发限流（429），稍后重试";
		case 529:
			return "TypeSafe 服务过载（529），稍后重试";
		default:
			return `JEV 请求失败（${status}）：${text.slice(0, 300)}`;
	}
}

export class JevClient {
	private readonly retryBaseMs: number;
	private readonly maxAttempts: number;

	constructor(
		private readonly getConfig: () => JevConfig,
		options: JevClientOptions = {}
	) {
		this.retryBaseMs = options.retryBaseMs ?? 800;
		this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
	}

	/** 调用 System One，返回一次判断结果 */
	async classify(
		input: ClassifyInput,
		categories: CategoryConfig[],
		options: ClassifyOptions
	): Promise<RouterDecision> {
		const config = this.getConfig();
		const apiKey = config.apiKey.trim();
		if (!apiKey) {
			throw new JevError("尚未填写 API Key。请到 设置 → JEV Inbox Router → JEV 接口 里填入。");
		}

		const active = categories.filter((c) => c.enabled);
		if (active.length < 2) {
			throw new JevError("至少需要启用 2 个分类才能做单选判断。");
		}

		const criteria: Record<string, string> = {};
		for (const c of active) {
			criteria[c.key] = (c.description || c.label).trim();
		}

		const questions: Record<string, unknown> = {
			category: {
				type: "choice",
				instructions:
					"这条笔记本质上属于哪一类？只根据内容判断归属，不要评价它的文笔，也不要因为写得短就认为它没价值。",
				criteria,
			},
		};
		if (options.lowValueEnabled) {
			questions.value = {
				type: "score",
				instructions: "这条笔记对使用者未来的长期价值有多高？",
				criteria: VALUE_LEVELS,
			};
		}

		const body = {
			model: config.model.trim() || "jev-latest",
			state: {
				note_title: input.title,
				note_path: input.path,
				note_content: truncate(input.content, MAX_CONTENT_CHARS),
			},
			questions,
		};

		const data = await this.post(config.apiUrl, apiKey, body);
		return this.toDecision(data, active, options);
	}

	private async post(
		url: string,
		apiKey: string,
		body: unknown
	): Promise<JevResponse> {
		let lastError: JevError | null = null;

		for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
			let status = 0;
			let text = "";
			let json: JevResponse | null = null;

			try {
				const res = await requestUrl({
					url,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify(body),
					throw: false,
				});
				status = res.status;
				text = res.text ?? "";
				try {
					json = res.json as JevResponse;
				} catch {
					json = null;
				}
			} catch (error) {
				status = -1;
				text = error instanceof Error ? error.message : String(error);
			}

			if (status >= 200 && status < 300 && json) {
				if (json.error) {
					throw new JevError(
						`JEV 返回错误：${JSON.stringify(json.error).slice(0, 300)}`,
						status
					);
				}
				return json;
			}

			const retriable =
				status < 0 || status === 429 || status === 529 || status >= 500;
			const err = new JevError(explain(status, text), status);
			if (!retriable) throw err;

			lastError = err;
			if (attempt < this.maxAttempts - 1) await sleep(this.retryBaseMs * (attempt + 1));
		}

		throw lastError ?? new JevError("JEV 请求失败");
	}

	private toDecision(
		data: JevResponse,
		active: CategoryConfig[],
		options: ClassifyOptions
	): RouterDecision {
		const answers = data.answers ?? {};
		const category = answers.category as JevAnswerChoice | undefined;

		if (!category || category.type !== "choice" || typeof category.choice !== "string") {
			throw new JevError("JEV 没有返回有效的分类结果，请检查分类配置。");
		}

		const chosenKey = category.choice;
		const chosen = active.find((c) => c.key === chosenKey);
		if (!chosen) {
			throw new JevError(`JEV 返回了未知分类「${chosenKey}」，请检查分类配置是否刚被改动。`);
		}

		const raw = category.probabilities ?? {};
		const ranking: JevProbabilityEntry[] = active
			.map((c) => ({
				key: c.key,
				label: c.label,
				short: c.short || c.label,
				color: c.color,
				p: clamp01(raw[c.key] ?? 0),
			}))
			.sort((a, b) => b.p - a.p);

		const fallback = ranking.find((r) => r.key === chosenKey)?.p ?? 0;
		const confidence = clamp01(typeof raw[chosenKey] === "number" ? raw[chosenKey] : fallback);
		const second = ranking.find((r) => r.key !== chosenKey)?.p ?? 0;
		const margin = second > 0 ? confidence / second : Number.POSITIVE_INFINITY;

		let valueIndex: number | null = null;
		if (options.lowValueEnabled) {
			const value = answers.value as JevAnswerScore | undefined;
			if (value && typeof value.score === "number") {
				valueIndex = Math.max(
					0,
					Math.min(VALUE_LEVELS.length - 1, Math.round(value.score))
				);
			}
		}

		return {
			categoryKey: chosenKey,
			categoryLabel: chosen.label,
			targetFolder: chosen.folder,
			confidence,
			modelConfidence:
				typeof category.confidence === "number" ? category.confidence : null,
			margin,
			ranking,
			valueIndex,
			valueLevels: VALUE_LEVELS,
			model: data.model ?? "unknown",
			at: Date.now(),
			usage: data.usage,
		};
	}
}

/** 稳定的内容指纹，用于缓存判断结果 */
export function hashContent(text: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x1000193;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		h1 = (h1 ^ c) >>> 0;
		h1 = (h1 * 16777619) >>> 0;
		h2 = (h2 + c * (i + 1)) >>> 0;
	}
	return `${h1.toString(36)}-${h2.toString(36)}-${text.length}`;
}
