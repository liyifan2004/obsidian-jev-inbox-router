import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, MAX_CATEGORIES } from "../src/constants";
import { ORGANIZATION_PRESETS, presetById, remapPresetKeys } from "../src/presets";
import type { CategoryConfig } from "../src/types";

function makeCategory(over: Partial<CategoryConfig> = {}): CategoryConfig {
	return {
		key: "A",
		label: "甲",
		short: "甲",
		description: "",
		folder: "某文件夹",
		tag: "",
		enabled: true,
		color: "#112233",
		...over,
	};
}

describe("ORGANIZATION_PRESETS", () => {
	it("内置 6 套，id 与 name 唯一", () => {
		expect(ORGANIZATION_PRESETS).toHaveLength(6);
		expect(new Set(ORGANIZATION_PRESETS.map((p) => p.id)).size).toBe(6);
		expect(new Set(ORGANIZATION_PRESETS.map((p) => p.name)).size).toBe(6);
	});

	it("第一套就是当前默认分类（simple，直接引用 DEFAULT_CATEGORIES）", () => {
		const simple = ORGANIZATION_PRESETS[0];
		expect(simple.id).toBe("simple");
		expect(simple.categories).toBe(DEFAULT_CATEGORIES);
		expect(simple.inboxFolder).toBe("Inbox");
	});

	it("每套 key 唯一、总数不超过上限，且全部启用", () => {
		for (const preset of ORGANIZATION_PRESETS) {
			expect(preset.categories.length).toBeGreaterThan(1);
			expect(preset.categories.length).toBeLessThanOrEqual(MAX_CATEGORIES);
			expect(new Set(preset.categories.map((c) => c.key)).size).toBe(preset.categories.length);
			expect(preset.categories.every((c) => c.enabled)).toBe(true);
		}
	});

	it("每个分类的 folder 非空且无非法形态", () => {
		for (const preset of ORGANIZATION_PRESETS) {
			for (const c of preset.categories) {
				expect(c.folder.length).toBeGreaterThan(0);
				expect(c.folder.startsWith("/")).toBe(false);
				expect(c.folder.startsWith("\\")).toBe(false);
				expect(c.folder.endsWith("/")).toBe(false);
				expect(c.folder.includes("//")).toBe(false);
			}
		}
	});

	it("颜色都是六位十六进制", () => {
		for (const preset of ORGANIZATION_PRESETS) {
			for (const c of preset.categories) {
				expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/);
			}
		}
	});

	it("每套都含删除类分类（key=F 或 label 含「删除」）", () => {
		for (const preset of ORGANIZATION_PRESETS) {
			const hasDeletion = preset.categories.some(
				(c) => c.key === "F" || c.label.includes("删除")
			);
			expect(hasDeletion).toBe(true);
		}
	});

	it("每套都有非空的 inboxFolder 与一句话描述", () => {
		for (const preset of ORGANIZATION_PRESETS) {
			expect(preset.inboxFolder.length).toBeGreaterThan(0);
			expect(preset.description.length).toBeGreaterThan(0);
			expect(preset.description.length).toBeLessThanOrEqual(60);
		}
	});
});

describe("presetById", () => {
	it("命中时返回对应预设", () => {
		expect(presetById("para")?.name).toBe("PARA");
		expect(presetById("gtd")?.inboxFolder).toBe("GTD/收集箱");
	});

	it("未命中时返回 undefined", () => {
		expect(presetById("nope")).toBeUndefined();
		expect(presetById("")).toBeUndefined();
	});
});

describe("remapPresetKeys", () => {
	it("key 冲突时改用未被占用的字母", () => {
		const categories = [
			makeCategory({ key: "A", label: "甲" }),
			makeCategory({ key: "F", label: "待删除" }),
		];
		const taken = new Set(["A", "B", "F"]);
		const remapped = remapPresetKeys(categories, taken);

		expect(remapped[0].key).toBe("C");
		expect(remapped[1].key).toBe("D");
		// 新 key 互不冲突，也都不再撞上已占用的字母
		const keys = remapped.map((c) => c.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.every((k) => !taken.has(k))).toBe(true);
	});

	it("无冲突时保持原 key，但返回的是拷贝", () => {
		const categories = [
			makeCategory({ key: "X" }),
			makeCategory({ key: "Y", label: "乙" }),
		];
		const remapped = remapPresetKeys(categories, new Set(["A"]));
		expect(remapped.map((c) => c.key)).toEqual(["X", "Y"]);
		expect(remapped[0]).not.toBe(categories[0]);
		expect(remapped[0]).toEqual(categories[0]);
	});

	it("不修改入参数组与元素", () => {
		const categories = [makeCategory({ key: "F", label: "待删除", folder: "删" })];
		const snapshot = JSON.parse(JSON.stringify(categories));
		remapPresetKeys(categories, new Set(["F", "A", "B", "C", "D", "E"]));
		expect(categories).toEqual(snapshot);
	});

	it("字母耗尽时退回 K 编号形式，仍然唯一", () => {
		const allLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
		const categories = allLetters.map((key, i) => makeCategory({ key, label: `分类${i}` }));
		const taken = new Set(allLetters);
		const remapped = remapPresetKeys(categories, taken);
		const keys = remapped.map((c) => c.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.every((k) => !taken.has(k))).toBe(true);
		expect(keys.some((k) => /^K\d+$/.test(k))).toBe(true);
	});
});
