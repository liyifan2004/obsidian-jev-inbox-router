import { DEFAULT_SETTINGS, VALUE_LEVELS } from "../../src/constants";
import type { JevProbabilityEntry, JevSettings, RouterDecision } from "../../src/types";

/** 造一份设置，默认取插件的出厂值；categories 会深拷贝，避免测试之间互相污染 */
export function makeSettings(over: Partial<JevSettings> = {}): JevSettings {
	const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as JevSettings;
	const merged: JevSettings = { ...base, ...over };
	if (!over.categories) merged.categories = base.categories;
	return merged;
}

/** 造一份概率分布（已按降序） */
export function makeRanking(): JevProbabilityEntry[] {
	return [
		{ key: "D", label: "待办事项", short: "待办", color: "#FFC53D", p: 0.48 },
		{ key: "C", label: "待研究", short: "研究", color: "#9B8CFF", p: 0.34 },
		{ key: "A", label: "永久知识", short: "知识", color: "#4C8DFF", p: 0.06 },
		{ key: "E", label: "引用资料", short: "引用", color: "#3DC9B0", p: 0.05 },
		{ key: "F", label: "应该删除", short: "废弃", color: "#FF5C5C", p: 0.05 },
		{ key: "B", label: "产品灵感", short: "灵感", color: "#FF8A3D", p: 0.02 },
	];
}

/** 本地时间 2026-09-21 18:20，保证格式化断言不受时区影响 */
export const FIXED_AT = new Date(2026, 8, 21, 18, 20, 0).getTime();

export function makeDecision(over: Partial<RouterDecision> = {}): RouterDecision {
	return {
		categoryKey: "D",
		categoryLabel: "待办事项",
		targetFolder: "要做的事",
		confidence: 0.48,
		modelConfidence: 0.39,
		margin: 0.48 / 0.34,
		ranking: makeRanking(),
		valueIndex: 2,
		valueLevels: [...VALUE_LEVELS],
		model: "jev-1.13.0",
		at: FIXED_AT,
		usage: { input_tokens: 372, output_tokens: 59 },
		...over,
	};
}
