import { afterEach, describe, expect, it } from "vitest";
import { t } from "../src/i18n";
import { DEFAULT_CATEGORIES } from "../src/constants";
import { ORGANIZATION_PRESETS } from "../src/presets";
import { __setLocale } from "./mocks/obsidian";

afterEach(() => {
	__setLocale("zh-cn");
});

describe("t", () => {
	it("默认语言（zh-cn）返回中文文案", () => {
		expect(t("statusReady")).toBe("就绪");
	});

	it("支持 {name} 形式的变量插值", () => {
		__setLocale("zh-cn");
		expect(t("statusAnalyzing", { name: "随手记" })).toBe("分析中：随手记");

		__setLocale("en");
		expect(t("statusAnalyzing", { name: "jotting" })).toBe("Analyzing: jotting");
	});
});

describe("数据层语言快照", () => {
	it("数据层在模块加载时按当时 UI 语言选快照，运行时切 locale 不重算", () => {
		// 测试进程以默认 zh-cn 加载模块，因此拿到中文快照
		const folderD = DEFAULT_CATEGORIES.find((c) => c.key === "D")!;
		expect(folderD.label).toBe("待办事项");
		// folder 是 vault 实际路径，任何语言下都保持原样
		expect(folderD.folder).toBe("要做的事");

		// t() 则始终动态读取当前 locale
		__setLocale("en");
		expect(t("statusReady")).toBe("Ready");
		__setLocale("zh-cn");
		expect(t("statusReady")).toBe("就绪");
	});

	it("当前快照下每套预设描述非空且不超过 60 字符", () => {
		for (const preset of ORGANIZATION_PRESETS) {
			expect(preset.description.length).toBeGreaterThan(0);
			expect(preset.description.length).toBeLessThanOrEqual(60);
		}
	});
});
