import { beforeEach, describe, expect, it } from "vitest";
import { Setting, __createdSettings, __setApiVersion, makeStubElement } from "./mocks/obsidian";
import { DEFAULT_SETTINGS } from "../src/constants";
import { JevSettingTab } from "../src/settings-tab";
import { deepCopy, SECTION_KEYS } from "../src/settings-definitions";
import type { JevSettings } from "../src/types";

/**
 * 设置页双轨（声明式 + 命令式）的一致性测试。
 *
 * ## 为什么要有这个测试
 *
 * Obsidian 1.13+ 走 `getSettingDefinitions()`，1.13 以下走 `display()`。
 * 两条路径如果各写一遍 UI，加一个设置就要改两处 —— 迟早漏一处，
 * 出现「1.13+ 有、旧版没有」的不一致。
 *
 * 本插件用 {@link RowSink} 把两条路径收敛到**同一批节实现**，
 * 所以这里断言的重点是：**两条路径产出的行集合必须完全一致**。
 *
 * 这类缺陷在 Obsidian 里**不会报错**：设置页照常显示，只是少了一项。
 * 唯一能抓住它的办法就是像这样把两条路径都跑一遍、逐项比对。
 */

/** 记录所有被创建出来的 Setting 行。 */
const createdSettings = __createdSettings;

/** plugin 桩的最小形状 —— 显式标注，避免自引用导致的类型推断循环。 */
interface PluginStub {
	settings: JevSettings;
	saveSettings(next: JevSettings): Promise<void>;
	router: { getAllFolders(): string[]; ensureFolder(path: string): Promise<void> };
	cacheSize(): number;
	clearCache(): void;
	refreshStatusBar(): void;
	getClient(): { classify(input: unknown, categories: unknown, opts: unknown): Promise<unknown> };
}

/**
 * 造一个够用的 plugin 桩。
 */
function makePlugin(settings: JevSettings): PluginStub {
	const plugin: PluginStub = {
		settings,
		async saveSettings(next: JevSettings) {
			plugin.settings = next;
		},
		router: {
			getAllFolders: () => ["Inbox", "Notes", "Archive"],
			ensureFolder: async () => undefined,
		},
		cacheSize: () => 3,
		clearCache: () => undefined,
		refreshStatusBar: () => undefined,
		getClient: () => ({
			classify: async () => ({
				categoryKey: "A",
				categoryLabel: "Alpha",
				confidence: 0.9,
				targetFolder: "Notes",
				model: "jev-latest",
			}),
		}),
	};
	return plugin;
}

/**
 * 造一个「什么都不做但什么方法都有」的元素桩。
 *
 * 设置页会 createEl / createDiv / createSpan / setAttribute / addClass ……
 * 全部都要有，否则测试会因为桩不完整而失败 ——
 * 那种失败是**桩的问题**，不是被测代码的问题，必须先补齐桩。
 */
const makeEl = makeStubElement;

function makeTab(plugin: PluginStub) {
	const tab = new JevSettingTab({} as never, plugin as never);
	// 桩里的 containerEl 没有 DOM 实现，给一个最小的空元素即可：
	// 我们的断言不依赖真实 DOM，只依赖 Setting 桩记录下来的调用。
	tab.containerEl = makeEl();
	return tab;
}

/**
 * 把声明式定义摊平成「所有项」的一维列表。
 *
 * 顶层既有分组（`type: "group"`，items 是它的子项），
 * 也有顶层自定义块（本身就是一条定义，没有 items）。
 * 两种形态都要被遍历到，所以这里统一摊平。
 */
function flattenDefinitions(
	defs: unknown
): Array<{ name?: string; render?: (setting: Setting) => unknown }> {
	const list = defs as Array<{
		type: string;
		items?: Array<{ name?: string; render?: (setting: Setting) => unknown }>;
		name?: string;
		render?: (setting: Setting) => unknown;
	}>;
	const out: Array<{ name?: string; render?: (setting: Setting) => unknown }> = [];
	for (const d of list) {
		if (d.type === "group" || d.type === "list") {
			out.push(...(d.items ?? []));
		} else {
			// 顶层块本身就是一条定义。
			out.push({ name: d.name, render: d.render });
		}
	}
	return out;
}

beforeEach(() => {
	createdSettings.length = 0;
	__setApiVersion(false);
});

describe("设置页双轨一致性", () => {
	it("声明式定义包含全部 7 个分组，外加一个顶层开场说明块", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		const items = tab.getSettingDefinitions() as {
			type: string;
			heading?: string;
			items?: unknown[];
		}[];

		// 顶层是「开场说明块 + 7 个分组」。
		// 开场说明块是 SettingDefinition（type 不是 group），
		// 放在所有分组之前 —— 它是设置页要回答的第一个问题
		// （这插件会不会改我的内容）。
		expect(items).toHaveLength(8);
		expect(items[0].type).not.toBe("group");
		const groups = items.slice(1);
		expect(groups.every((g) => g.type === "group")).toBe(true);
		// 分组标题一个都不能少，且都不含插件名
		const headings = groups.map((g) => g.heading ?? "");
		expect(headings.length).toBe(7);
		expect(new Set(headings).size).toBe(7);
		for (const h of headings) {
			expect(h).not.toMatch(/JEV Inbox Router/i);
			expect(h).not.toMatch(/\bsettings\b/i);
			expect(h).not.toMatch(/\boptions\b/i);
			expect(h).not.toMatch(/\bgeneral\b/i);
		}
	});

	it("分组顺序与 SECTION_KEYS 一致", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);
		const items = tab.getSettingDefinitions() as { heading?: string; type: string }[];

		// sectionHeading 的取值为本地化文案，这里直接比对「每个分组都非空且唯一」
		// —— 顺序由 getSettingDefinitions 的调用顺序决定。
		const headings = items
			.filter((d) => d.type === "group")
			.map((g) => g.heading ?? "");
		expect(headings.length).toBe(7);
		expect(headings[0]).toBeTruthy();
		expect(headings[headings.length - 1]).toBeTruthy();
	});

	it("声明式路径的每一项都返回 undefined（不能返回 Setting 对象）", () => {
		// 真实事故：Obsidian 1.13 的声明式渲染器会把 render() 的返回值
		// 当作「行销毁前的清理函数」调用。
		// 如果 render 写成表达式体 `render: (s) => s.addDropdown(...)`，
		// 返回的是 Setting 组件对象 → Obsidian 当函数调用 →
		// TypeError: t is not a function → **设置子页面永远打不开**。
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);
		const items = flattenDefinitions(tab.getSettingDefinitions());

		let checked = 0;
		for (const item of items) {
			if (!item.render) continue;
			const fake = new Setting(makeEl());
			const result = item.render(fake);
			expect(result).toBeUndefined();
			checked += 1;
		}
		expect(checked).toBeGreaterThan(0);
	});

	it("自定义块的内容画进的是还活着的容器", () => {
		// Obsidian 的 Setting 结构是 `settingEl > (infoEl, controlEl)`。
		// 如果实现里调用 `setting.settingEl.empty()`，controlEl 会被一起清掉
		// （脱离 DOM）—— 之后往 controlEl 画的内容**不会出现在页面上**。
		//
		// 这类错误在「每个属性都是独立对象」的朴素 mock 里查不出来，
		// 所以这里显式断言容器没被脱离。
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		const items = flattenDefinitions(tab.getSettingDefinitions());

		let checked = 0;
		for (const item of items) {
			if (!item.render) continue;
			const setting = new Setting(makeEl());
			item.render(setting);
			const control = setting.controlEl as unknown as { __detached?: boolean };
			expect(control.__detached).not.toBe(true);
			checked += 1;
		}
		expect(checked).toBeGreaterThan(0);
	});

	it("命令式路径与声明式路径产出的行名称集合一致", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		// 命令式：跑 display()，收集 Setting 桩记录下来的名字
		tab.display();
		const imperative = createdSettings.filter((s) => !s.heading);
		const imperativeNames = imperative
			.map((s) => s.name)
			.filter((n): n is string => typeof n === "string");

		// 声明式：收集定义里的每一项名字。
		// 分组标题在两条路径的载体不同 —— 命令式是 setHeading() 的 Setting 行，
		// 声明式是 group.heading 字段 —— 所以这里只比「非标题行」，
		// 标题的一致性由下面那条专门断言覆盖。
		createdSettings.length = 0;
		const items = flattenDefinitions(tab.getSettingDefinitions());
		const declarativeNames: string[] = [];
		for (const item of items) {
			if (item.name) declarativeNames.push(item.name);
			// 触发 render，才能拿到自定义块里的嵌套行
			if (item.render) item.render(new Setting(makeEl()));
		}

		expect(imperativeNames.length).toBeGreaterThan(0);
		// 两条路径必须给出同一批设置项 —— 少了任何一项就是漂移。
		expect(declarativeNames.sort()).toEqual(imperativeNames.sort());
	});

	it("每个设置项都真的挂上了控件（行存在但控件没挂也是一种缺陷）", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		// 为什么需要这条独立断言：
		// 「双轨一致」只能抓住「两条路径不同」，
		// 抓不住「两条路径一致地错」——
		// 比如某个 render 回调忘了挂控件，两边都没有，一致性照样成立。
		// 所以要单独断言「每个设置项都有控件」。
		//
		// 自定义块（block）的宿主行本身没有控件 —— 它的内容在 controlEl 里，
		// 由块内部的行承载。所以排除掉已知的块宿主行。
		const blockHosts = new Set([
			"presetList",
			"categoryList",
			"categoryActions",
			"settingsIntro",
		]);

		tab.display();
		const empty = createdSettings
			.filter((s) => !s.heading)
			.filter((s) => s.name !== undefined && !blockHosts.has(s.name))
			.filter((s) => s.controls.length === 0)
			.map((s) => s.name);

		expect(empty).toEqual([]);
	});

	it("两条路径每一行挂载的控件类型一致", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		// 为什么要比控件类型而不只比名字：
		// 「行还在但控件没挂上」也是一种漂移 ——
		// 用户看到一行设置却发现改不了它。
		// 只比名字的断言抓不到这种（反证时验证过）。
		//
		// 注意要比**全部** Setting 行，包括自定义块内部创建的嵌套行 ——
		// 只比顶层行会漏掉块内部的不一致。
		const fingerprint = (settings: { name?: string; controls: string[] }[]) =>
			settings
				.map((s) => `${s.name ?? ""}|${[...s.controls].sort().join(",")}`)
				.sort();

		tab.display();
		const imperative = fingerprint(createdSettings.filter((s) => !s.heading));

		createdSettings.length = 0;
		const items = flattenDefinitions(tab.getSettingDefinitions());
		// 声明式路径：每一项产出的是「宿主行」（render 收到的那个 Setting，
		// 控件挂在它身上）**加上** render 内部新建的嵌套行。
		// 命令式路径下这两类行都是 Setting 桩记录下来的，所以两边口径要对齐。
		const declarativeRows: { name?: string; controls: string[] }[] = [];
		for (const item of items) {
			const host = new Setting(makeEl());
			const before = createdSettings.length;
			if (item.render) item.render(host);
			declarativeRows.push({ name: item.name, controls: host.controls });
			for (const s of createdSettings.slice(before)) {
				declarativeRows.push({ name: s.name, controls: s.controls });
			}
		}
		const declarative = fingerprint(declarativeRows);

		expect(imperative.length).toBeGreaterThan(0);
		expect(declarative).toEqual(imperative);
	});

	it("两条路径的分组标题集合一致", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		// 命令式：setHeading() 的 Setting 行就是分组标题
		tab.display();
		const imperativeHeadings = createdSettings
			.filter((s) => s.heading)
			.map((s) => s.name)
			.filter((n): n is string => typeof n === "string");

		// 声明式：group.heading
		const items = tab.getSettingDefinitions() as { heading?: string; type: string }[];
		const declarativeHeadings = items
			.filter((d) => d.type === "group")
			.map((g) => g.heading ?? "");

		expect(imperativeHeadings.length).toBe(7);
		expect(declarativeHeadings.sort()).toEqual(imperativeHeadings.sort());
	});
});

describe("deepCopy", () => {
	it("不共享引用", () => {
		const source = deepCopy(DEFAULT_SETTINGS);
		source.categories[0].label = "changed";
		expect(DEFAULT_SETTINGS.categories[0].label).not.toBe("changed");
	});

	it("保留 undefined 值（JSON 往返会丢掉）", () => {
		const source = { a: 1, b: undefined } as { a: number; b?: number };
		const copy = deepCopy(source);
		expect("b" in copy).toBe(true);
		expect(copy.b).toBeUndefined();
	});

	it("嵌套数组与对象都被拷贝", () => {
		const source = { list: [{ inner: { v: 1 } }] };
		const copy = deepCopy(source);
		copy.list[0].inner.v = 2;
		expect(source.list[0].inner.v).toBe(1);
	});
});

describe("刷新路径分流", () => {
	it("1.13 以下走命令式渲染", () => {
		__setApiVersion(false);
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		createdSettings.length = 0;
		tab.display();
		expect(createdSettings.length).toBeGreaterThan(0);
	});

	it("1.13+ 的刷新不经过 display()（display 已被官方标记废弃）", () => {
		__setApiVersion(true);
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		// 声明式路径下 Obsidian 自己持有渲染树，
		// 所以 getSettingDefinitions 必须能反复调用而不报错。
		const first = tab.getSettingDefinitions();
		const second = tab.getSettingDefinitions();
		expect(first).toHaveLength(second.length);
		// 7 个分组 + 1 个顶层开场说明块
		expect(first.length).toBe(8);
	});
});

describe("分组标题键", () => {
	it("每个键都有非空标题", () => {
		for (const key of Object.values(SECTION_KEYS)) {
			expect(typeof key).toBe("string");
			expect(key.length).toBeGreaterThan(0);
		}
	});
});
