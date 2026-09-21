import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, JEV_ENDPOINT } from "../src/constants";
import { normalizeCategory, normalizeSettings } from "../src/settings-normalize";

describe("normalizeSettings", () => {
	it("没有任何输入时返回一份完整设置", () => {
		const settings = normalizeSettings(undefined);
		expect(settings.apiUrl).toBe(JEV_ENDPOINT);
		expect(settings.model).toBe("jev-latest");
		expect(settings.categories).toHaveLength(DEFAULT_SETTINGS.categories.length);
		expect(settings.inboxFolders).toEqual(["Inbox"]);
		expect(settings.autoRouteEnabled).toBe(false);
		expect(settings.deletionHandling).toBe("mark");
	});

	it("用户改过的字段被保留，没写的字段按默认值补齐", () => {
		const settings = normalizeSettings({
			apiKey: "apikey_x",
			autoRouteEnabled: true,
			confidenceThreshold: 0.7,
		});
		expect(settings.apiKey).toBe("apikey_x");
		expect(settings.autoRouteEnabled).toBe(true);
		expect(settings.confidenceThreshold).toBe(0.7);
		expect(settings.marginThreshold).toBe(DEFAULT_SETTINGS.marginThreshold);
		expect(settings.blockStyle).toBe(DEFAULT_SETTINGS.blockStyle);
	});

	it("不会污染出厂常量（多次调用互不影响）", () => {
		const a = normalizeSettings({});
		a.categories[0].label = "被我改了";
		a.inboxFolders.push("别的");

		const b = normalizeSettings({});
		expect(b.categories[0].label).toBe(DEFAULT_SETTINGS.categories[0].label);
		expect(b.inboxFolders).toEqual(["Inbox"]);
	});

	it("本地保存的分类是数组时原样使用", () => {
		const settings = normalizeSettings({
			categories: [
				{
					key: "X",
					label: "自定义",
					short: "自定",
					description: "自定义描述",
					folder: "某处",
					tag: "某",
					enabled: true,
					color: "#123456",
				},
			],
		});
		expect(settings.categories).toHaveLength(1);
		expect(settings.categories[0]).toMatchObject({ key: "X", folder: "某处" });
	});

	it("分类字段缺失时按 key 补齐出厂文案", () => {
		const settings = normalizeSettings({ categories: [{ key: "D" }] });
		const d = settings.categories[0];
		const fallback = DEFAULT_SETTINGS.categories.find((c) => c.key === "D")!;
		expect(d.label).toBe(fallback.label);
		expect(d.short).toBe(fallback.short);
		expect(d.description).toBe(fallback.description);
		expect(d.color).toBe(fallback.color);
		expect(d.enabled).toBe(true);
	});

	it("未知分类 key 也能保留，不会丢数据", () => {
		const settings = normalizeSettings({
			categories: [{ key: "Z9", label: "临时分类" }],
		});
		expect(settings.categories[0].key).toBe("Z9");
		expect(settings.categories[0].label).toBe("临时分类");
		expect(settings.categories[0].folder).toBe("");
		expect(settings.categories[0].color).toBeTruthy();
	});

	it("空分类数组与非法类型都回落到出厂分类", () => {
		expect(normalizeSettings({ categories: [] }).categories).toHaveLength(
			DEFAULT_SETTINGS.categories.length
		);
		expect(
			normalizeSettings({ categories: "oops" as unknown as never }).categories
		).toHaveLength(DEFAULT_SETTINGS.categories.length);
	});

	it("空的 apiUrl / model 回落到默认值", () => {
		const settings = normalizeSettings({ apiUrl: "  ", model: "" });
		expect(settings.apiUrl).toBe(JEV_ENDPOINT);
		expect(settings.model).toBe("jev-latest");
	});

	it("只有 enabled 明确为 false 才关闭分类", () => {
		expect(normalizeCategory({ key: "D" }).enabled).toBe(true);
		expect(normalizeCategory({ key: "D", enabled: false }).enabled).toBe(false);
	});

	it("收件箱数组为空时回落到默认收件箱", () => {
		expect(normalizeSettings({ inboxFolders: [] }).inboxFolders).toEqual(["Inbox"]);
	});

	it("用户自定义的收件箱被保留", () => {
		expect(normalizeSettings({ inboxFolders: ["收集", "临时"] }).inboxFolders).toEqual([
			"收集",
			"临时",
		]);
	});

	it("数值字段被写坏时回落到默认值", () => {
		const settings = normalizeSettings({
			confidenceThreshold: "abc" as unknown as number,
			minChars: Number.NaN,
			cacheMinutes: -5,
		});
		expect(settings.confidenceThreshold).toBe(DEFAULT_SETTINGS.confidenceThreshold);
		expect(settings.minChars).toBe(DEFAULT_SETTINGS.minChars);
		expect(settings.cacheMinutes).toBe(DEFAULT_SETTINGS.cacheMinutes);
	});

	it("0 是合法数值，不被当成缺失", () => {
		expect(normalizeSettings({ statusBarClearMs: 0 }).statusBarClearMs).toBe(0);
		expect(normalizeSettings({ minChars: 0 }).minChars).toBe(0);
	});

	it("枚举字段出现不认识的取值时回落到默认值", () => {
		const settings = normalizeSettings({
			watchScope: "everywhere" as never,
			deletionHandling: "delete" as never,
			blockPlacement: "middle" as never,
			blockStyle: "table" as never,
		});
		expect(settings.watchScope).toBe(DEFAULT_SETTINGS.watchScope);
		expect(settings.deletionHandling).toBe(DEFAULT_SETTINGS.deletionHandling);
		expect(settings.blockPlacement).toBe(DEFAULT_SETTINGS.blockPlacement);
		expect(settings.blockStyle).toBe(DEFAULT_SETTINGS.blockStyle);
	});
});
