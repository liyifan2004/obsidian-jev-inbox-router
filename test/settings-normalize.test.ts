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

	// ---- v0.2 迁移：indexFolder / moveOnJudge / previousCategories ----

	it("缺新字段时按迁移规则补齐", () => {
		const settings = normalizeSettings({});
		expect(settings.indexFolder).toBe("Inbox");
		expect(settings.moveOnJudge).toBe(false);
		expect(settings.previousCategories).toBeNull();
	});

	it("老用户开了自动分流：moveOnJudge 迁移为 true，行为不变", () => {
		const settings = normalizeSettings({ autoRouteEnabled: true });
		expect(settings.moveOnJudge).toBe(true);
	});

	it("老用户没开自动分流：moveOnJudge 为 false（建议模式）", () => {
		const settings = normalizeSettings({ autoRouteEnabled: false });
		expect(settings.moveOnJudge).toBe(false);
	});

	it("indexFolder 缺失时回退到旧收件箱配置的第一项", () => {
		const settings = normalizeSettings({ inboxFolders: ["收集", "临时"] });
		expect(settings.indexFolder).toBe("收集");
	});

	it("indexFolder 写坏（空串 / 非字符串）时走回退链：inboxFolders[0] → Inbox", () => {
		expect(normalizeSettings({ indexFolder: "  ", inboxFolders: ["收件"] }).indexFolder).toBe(
			"收件"
		);
		expect(normalizeSettings({ indexFolder: "  " }).indexFolder).toBe("Inbox");
		expect(
			normalizeSettings({ indexFolder: 42 as unknown as string, inboxFolders: ["备选"] })
				.indexFolder
		).toBe("备选");
	});

	it("显式写过的 moveOnJudge 优先于 autoRouteEnabled 迁移", () => {
		const settings = normalizeSettings({ autoRouteEnabled: true, moveOnJudge: false });
		expect(settings.moveOnJudge).toBe(false);
	});

	it("previousCategories 快照被保留并逐条补齐（允许半成品条目）", () => {
		const settings = normalizeSettings({
			previousCategories: [
				{ key: "X", label: "旧分类" },
			] as unknown as never,
		});
		expect(settings.previousCategories).toHaveLength(1);
		expect(settings.previousCategories?.[0]).toMatchObject({ key: "X", label: "旧分类" });
		expect(settings.previousCategories?.[0].enabled).toBe(true);
	});

	it("previousCategories 类型不对时视为没有快照", () => {
		expect(
			normalizeSettings({ previousCategories: "oops" as unknown as never }).previousCategories
		).toBeNull();
	});
});
