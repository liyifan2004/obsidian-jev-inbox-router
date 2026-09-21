import { DEFAULT_SETTINGS } from "./constants";
import type { BlockPlacement, BlockStyle, CategoryConfig, DeletionHandling, JevSettings, WatchScope } from "./types";

/**
 * 把磁盘上读到的设置补齐成一份完整可用的 JevSettings。
 *
 * data.json 是用户可以手改的，插件升级也会带来新字段，
 * 因此：缺的补默认值、坏的退回默认值、永远不修改出厂常量。
 *
 * 输入按「不可信」处理：字段可以缺失、类型可以不对，分类也可以只写一半。
 */

/** 输入侧的分类：允许只写部分字段 */
export type RawCategory = Partial<CategoryConfig>;

/** 输入侧的设置：分类允许半成品，其余字段允许缺失 */
export type RawSettings = Partial<Omit<JevSettings, "categories">> & {
	categories?: RawCategory[];
};

/** 数值字段：必须是有限的非负数，否则退回默认值 */
function num(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
	return value;
}

function text(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	return value.trim() === "" ? fallback : value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeCategory(raw: RawCategory | null | undefined): CategoryConfig {
	const source = raw ?? {};
	const key = typeof source.key === "string" && source.key ? source.key : "?";
	const fallback = DEFAULT_SETTINGS.categories.find((c) => c.key === key);

	return {
		key,
		label: typeof source.label === "string" && source.label ? source.label : (fallback?.label ?? key),
		short:
			typeof source.short === "string" && source.short
				? source.short
				: (fallback?.short ?? source.label ?? key),
		description:
			typeof source.description === "string"
				? source.description
				: (fallback?.description ?? ""),
		folder: typeof source.folder === "string" ? source.folder : (fallback?.folder ?? ""),
		tag: typeof source.tag === "string" ? source.tag : (fallback?.tag ?? ""),
		enabled: source.enabled !== false,
		color:
			typeof source.color === "string" && source.color ? source.color : (fallback?.color ?? "#7F8C99"),
	};
}

function defaultCategories(): CategoryConfig[] {
	return DEFAULT_SETTINGS.categories.map((c) => ({ ...c }));
}

export function normalizeSettings(raw: RawSettings | null | undefined): JevSettings {
	const source = (raw ?? {}) as RawSettings;

	const categories =
		Array.isArray(source.categories) && source.categories.length > 0
			? source.categories.map((c) => normalizeCategory(c))
			: defaultCategories();

	const inboxFolders =
		Array.isArray(source.inboxFolders) && source.inboxFolders.length > 0
			? source.inboxFolders.map((f) => String(f))
			: [...DEFAULT_SETTINGS.inboxFolders];

	const merged: JevSettings = {
		...DEFAULT_SETTINGS,
		...source,
		categories,
		inboxFolders,
	};

	merged.apiKey = typeof merged.apiKey === "string" ? merged.apiKey : "";
	merged.apiUrl = text(merged.apiUrl, DEFAULT_SETTINGS.apiUrl);
	merged.model = text(merged.model, DEFAULT_SETTINGS.model);

	merged.minChars = num(merged.minChars, DEFAULT_SETTINGS.minChars);
	merged.autoRouteDelayMs = num(merged.autoRouteDelayMs, DEFAULT_SETTINGS.autoRouteDelayMs);
	merged.confidenceThreshold = num(
		merged.confidenceThreshold,
		DEFAULT_SETTINGS.confidenceThreshold
	);
	merged.marginThreshold = num(merged.marginThreshold, DEFAULT_SETTINGS.marginThreshold);
	merged.statusBarClearMs = num(merged.statusBarClearMs, DEFAULT_SETTINGS.statusBarClearMs);
	merged.cacheMinutes = num(merged.cacheMinutes, DEFAULT_SETTINGS.cacheMinutes);

	merged.watchScope = oneOf<WatchScope>(
		merged.watchScope,
		["inbox", "vault"],
		DEFAULT_SETTINGS.watchScope
	);
	merged.deletionHandling = oneOf<DeletionHandling>(
		merged.deletionHandling,
		["mark", "move", "ignore"],
		DEFAULT_SETTINGS.deletionHandling
	);
	merged.blockPlacement = oneOf<BlockPlacement>(
		merged.blockPlacement,
		["top", "bottom"],
		DEFAULT_SETTINGS.blockPlacement
	);
	merged.blockStyle = oneOf<BlockStyle>(
		merged.blockStyle,
		["callout", "details", "quote"],
		DEFAULT_SETTINGS.blockStyle
	);

	return merged;
}
