/**
 * 声明式路径的**运行时状态**守卫。
 *
 * ## 这个文件在防什么
 *
 * 「双轨一致性」（test/settings-tab.test.ts）守的是**结构**：
 * 两条路径产出的行集合、行名、控件类型一致。
 *
 * 但结构一致不等于运行正确。下面三类缺陷结构上完全一致 ——
 * 两条路径都「对」—— 只有运行时才分道扬镳：
 *
 * 1. **命令式路径的初始化没在声明式路径里做。**
 *    `renderImperative()` 会做两件事：`this.draft = plugin.settings`、
 *    `this.folders = router.getAllFolders()`，以及给容器加 `jev-settings` 类。
 *    声明式路径不调用 `renderImperative()`，所以这些字段保持构造时的初值。
 *
 *    2026-11-12 实测发现：
 *    - `folders` 保持 `[]` → 分类卡片里的「目标文件夹」下拉框**只剩一个空选项**，
 *      用户在 1.13+ 上选不了任何真实文件夹。
 *    - 容器缺 `jev-settings` 类 → CSS 里所有 `.jev-settings …` 规则
 *      （平板断点下的堆叠布局、控件宽度）**全部失效**。
 *
 * 2. **命令式路径的开场说明没在声明式路径里做。**
 *    `settingsIntro`（说明 JEV 只做分类投递、不改写内容）在 1.13+ 上不存在。
 *
 * 这类缺陷在 Obsidian 里**不会报错**：设置页照常显示，只是少东西。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Setting, __createdSettings, __setApiVersion, makeStubElement } from "./mocks/obsidian";
import { DEFAULT_SETTINGS } from "../src/constants";
import { JevSettingTab } from "../src/settings-tab";
import { deepCopy } from "../src/settings-definitions";
import type { JevSettings } from "../src/types";

interface PluginStub {
	settings: JevSettings;
	saveSettings(next: JevSettings): Promise<void>;
	router: { getAllFolders(): string[]; ensureFolder(path: string): Promise<void> };
	cacheSize(): number;
	clearCache(): void;
	refreshStatusBar(): void;
	getClient(): { classify(input: unknown, categories: unknown, opts: unknown): Promise<unknown> };
}

function makePlugin(settings: JevSettings, folders = ["Inbox", "Notes", "Archive"]): PluginStub {
	const plugin: PluginStub = {
		settings,
		async saveSettings(next: JevSettings) {
			plugin.settings = next;
		},
		router: {
			getAllFolders: () => folders,
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

function makeTab(plugin: PluginStub) {
	const tab = new JevSettingTab({} as never, plugin as never);
	tab.containerEl = makeStubElement();
	return tab;
}

/** 摊平声明式定义（顶层既有分组也有顶层块）。 */
function flattenDefinitions(defs: unknown): Array<{
	name?: string;
	render?: (setting: Setting) => unknown;
}> {
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
			out.push({ name: d.name, render: d.render });
		}
	}
	return out;
}

beforeEach(() => {
	__createdSettings.length = 0;
	__setApiVersion(false);
});

describe("声明式路径的运行时状态", () => {
	it("容器上有 jev-settings 类（CSS 响应式规则全靠它）", () => {
		// 2026-11-12 修复的真实缺陷：1.13+ 上没有这个类，
		// 于是平板断点下的堆叠布局与控件宽度规则全部失效。
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		tab.getSettingDefinitions();

		const classes = (tab.containerEl as unknown as { __classes: string[] })
			.__classes;
		expect(classes).toContain("jev-settings");
	});

	it("命令式路径同样有 jev-settings 类（两条路径口径一致）", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		tab.display();

		const classes = (tab.containerEl as unknown as { __classes: string[] })
			.__classes;
		expect(classes).toContain("jev-settings");
	});

	it("声明式路径会加载文件夹列表（分类的目标文件夹下拉框要有真实选项）", () => {
		// 2026-11-12 修复的真实缺陷：`folders` 只在 renderImperative() 里赋值，
		// 1.13+ 上保持 []，于是「目标文件夹」下拉框只剩一个空选项 ——
		// 用户选不了任何真实文件夹。
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		// 声明式路径：调一次 getSettingDefinitions 就会同步状态。
		tab.getSettingDefinitions();

		const folders = (tab as unknown as { folders: string[] }).folders;
		expect(folders).toEqual(["Inbox", "Notes", "Archive"]);
	});

	it("声明式路径的草稿是当前设置（不是构造时的快照）", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		// 改一下 settings，声明式路径必须看到改后的值。
		plugin.settings.apiKey = "sk-changed";
		tab.getSettingDefinitions();

		const draft = (tab as unknown as { draft: JevSettings }).draft;
		expect(draft.apiKey).toBe("sk-changed");
	});

	it("开场说明在两条路径里都存在", () => {
		// 2026-11-12 修复的第三个缺陷：1.13+ 上没有 settingsIntro 块，
		// 用户看不到「这插件只做分类投递、不改写内容」这段定位说明。
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		const declarative = flattenDefinitions(tab.getSettingDefinitions());
		expect(declarative.some((d) => d.name === "settingsIntro")).toBe(true);

		tab.display();
		const imperative = __createdSettings.filter((s) => !s.heading);
		expect(imperative.some((s) => s.name === "settingsIntro")).toBe(true);
	});
});
