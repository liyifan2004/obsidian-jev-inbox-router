import { pct } from "./note-writer";
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
			reason: `置信度 ${Math.round(decision.confidence * 100)}% 低于门槛 ${Math.round(
				settings.confidenceThreshold * 100
			)}%`,
		};
	}
	if (Number.isFinite(decision.margin) && decision.margin < settings.marginThreshold) {
		return {
			passed: false,
			reason: `首选只比次选高 ${decision.margin.toFixed(2)} 倍，低于门槛 ${settings.marginThreshold}×`,
		};
	}
	return { passed: true };
}

/**
 * 找出代表「应该删除」的分类。
 * 优先用 key = F，其次用标签里含「删除」的分类；都没有或都被禁用时返回 null。
 */
export function resolveDeletionKey(settings: JevSettings): string | null {
	const active = settings.categories.filter((c) => c.enabled);
	const byKey = active.find((c) => c.key === "F");
	if (byKey) return byKey.key;
	const byLabel = active.find((c) => c.label.includes("删除"));
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
			text: `${short} ${pct(decision.confidence)} → ${decision.targetFolder || "库根目录"}`,
		};
	}
	if (blockedReason) {
		return { kind: "warn", color, text: `${short} ${pct(decision.confidence)} 存疑` };
	}
	return { kind: "warn", color, text: `${short} 已在目标位置` };
}
