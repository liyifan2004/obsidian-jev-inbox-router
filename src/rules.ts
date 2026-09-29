import { pct } from "./note-writer";
import { t } from "./i18n";
import type { JevSettings, RouterDecision } from "./types";

/**
 * 分流规则。
 *
 * 这里只放纯函数：给定判断结果和设置，得出「能不能自动移动」这类结论，
 * 不碰文件系统、不依赖 Obsidian，因此可以独立测试。
 */

export interface GateResult {
	passed: boolean;
	/** 没有通过时的原因，会原样写进笔记里的判断块 */
	reason?: string;
}

/** 两个门槛都过才允许自动移动 */
export function evaluateGate(decision: RouterDecision, settings: JevSettings): GateResult {
	if (decision.confidence < settings.confidenceThreshold) {
		return {
			passed: false,
			reason: t("gateConfidenceLow", {
				p: Math.round(decision.confidence * 100),
				threshold: Math.round(settings.confidenceThreshold * 100),
			}),
		};
	}
	if (Number.isFinite(decision.margin) && decision.margin < settings.marginThreshold) {
		return {
			passed: false,
			reason: t("gateMarginLow", {
				margin: decision.margin.toFixed(2),
				threshold: settings.marginThreshold,
			}),
		};
	}
	return { passed: true };
}

/**
 * 找出代表「应该删除」的分类。
 * 优先用 key = F，其次用标签里含删除语义（「删除」/ delete）的分类；
 * 都没有或都被禁用时返回 null。
 */
export function resolveDeletionKey(settings: JevSettings): string | null {
	const active = settings.categories.filter((c) => c.enabled);
	const byKey = active.find((c) => c.key === "F");
	if (byKey) return byKey.key;
	const byLabel = active.find((c) => /删除|delete/i.test(c.label));
	if (byLabel) return byLabel.key;
	return null;
}

export function isDeletionDecision(decision: RouterDecision, settings: JevSettings): boolean {
	const key = resolveDeletionKey(settings);
	return key !== null && decision.categoryKey === key;
}

/** 文件夹路径归一化：统一斜杠、去掉首尾斜杠 */
export function normalizeFolder(folder: string): string {
	return String(folder ?? "")
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

/** 文件是否落在收件箱范围内（只用路径判断，不用文件对象） */
export function isInInboxPath(filePath: string, settings: JevSettings): boolean {
	if (settings.watchScope === "vault") return true;

	const path = normalizeFolder(filePath);
	const folders = settings.inboxFolders
		.map((f) => normalizeFolder(f))
		.filter((f) => f !== "");

	return folders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

/**
 * 内容是否短到不值得判断。
 * 判断前先去掉 frontmatter、注释和 Markdown 标记符号，只看实字。
 */
export function isTooShort(content: string, minChars: number): boolean {
	if (minChars <= 0) return false;
	const text = content
		.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/[#>*`\-_~!|\s[\]()]/g, "");
	return text.length < minChars;
}

/** 状态栏要显示的内容 */
export interface StatusView {
	kind: "ok" | "warn";
	text: string;
	color: string;
}

export function statusViewForRoute(input: {
	decision: RouterDecision;
	settings: JevSettings;
	moved: boolean;
	blockedReason?: string;
}): StatusView {
	const { decision, settings, moved, blockedReason } = input;
	const category = settings.categories.find((c) => c.key === decision.categoryKey);
	const short = category?.short || decision.categoryLabel;
	const color = category?.color ?? "#7F8C99";

	if (moved) {
		return {
			kind: "ok",
			color,
			text: t("statusMoved", {
				short,
				pct: pct(decision.confidence),
				folder: decision.targetFolder || t("vaultRoot"),
			}),
		};
	}
	if (blockedReason) {
		return {
			kind: "warn",
			color,
			text: t("statusUncertain", { short, pct: pct(decision.confidence) }),
		};
	}
	return { kind: "warn", color, text: t("statusAtTarget", { short }) };
}

/**
 * 建议模式的状态栏视图：判断后不动文件，只给建议；一键接受由 main.ts 负责。
 *
 * 与 statusViewForRoute 的区别：这里没有「是否已移动」的概念。
 * 双门槛只决定建议的标记（过门槛 ok / 未过 warn 存疑），不再拦截建议本身——
 * 双门槛只用来拦「无人值守的自动移动」，用户亲手点的接受等同人工确认。
 *
 * currentPath 提供时才能识别「已在目标位置」：此时主流程据此不显示接受项。
 */
export function statusViewForSuggestion(input: {
	decision: RouterDecision;
	settings: JevSettings;
	/** 当前文件路径；提供时才判断「无需移动」 */
	currentPath?: string;
}): StatusView {
	const { decision, settings, currentPath } = input;
	const category = settings.categories.find((c) => c.key === decision.categoryKey);
	const short = category?.short || decision.categoryLabel;
	const color = category?.color ?? "#7F8C99";
	const target = decision.targetFolder || t("vaultRoot");

	if (typeof currentPath === "string" && currentPath.trim() !== "") {
		const at = normalizeFolder(currentPath);
		const goal = normalizeFolder(decision.targetFolder);
		const atTarget =
			goal === "" ? !at.includes("/") : at === goal || at.startsWith(`${goal}/`);
		if (atTarget) {
			return { kind: "ok", color, text: t("suggestAtTarget", { folder: goal || t("vaultRoot") }) };
		}
	}

	const passed = evaluateGate(decision, settings).passed;
	return passed
		? {
				kind: "ok",
				color,
				text: t("suggestOk", { short, pct: pct(decision.confidence), target }),
			}
		: {
				kind: "warn",
				color,
				text: t("suggestUncertain", { short, pct: pct(decision.confidence), target }),
			};
}
