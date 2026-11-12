/**
 * 双轨路径的**可见内容**对等守卫。
 *
 * ## 这个文件在防什么
 *
 * 「设置页双轨一致性」（test/settings-tab.test.ts）守的是**结构**：
 * 两条路径产出的行名、控件类型一致。
 *
 * 但结构一致不等于用户看到的东西一致。有一类能力**不挂 Setting 控件** ——
 * 往容器里 `createEl("p", { text })` 画出来的说明段落、
 * `createDiv({ cls })` 画出来的卡片 —— 它们**不进** Setting 桩的记录。
 *
 * 2026-11-13 实测（这个文件就是那次的产物）：
 *
 *   把 JEV 声明式路径的开场说明段落**整个删掉**（块名与结构都不变），
 *   234 个测试**全部通过**。
 *
 * 也就是说 —— 用户在 1.13+ 上看不到那段说明，**没有任何一个断言会发现**。
 *
 * ## 守的是什么
 *
 * 断言「用户能读到的文字」在两条路径里完全一致。
 *
 * 这是对「双轨一致性」的补完，不是替代：结构断言守住「有哪些设置项」，
 * 内容断言守住「每一项里写了什么」。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
	Setting,
	__createdSettings,
	__setApiVersion,
	collectVisibleContent,
	makeStubElement,
} from "./mocks/obsidian";
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

/**
 * 跑命令式路径，收集全部可见文字。
 */
function imperativeContent(tab: JevSettingTab): string[] {
	tab.display();
	return collectVisibleContent(tab.containerEl);
}

/**
 * 跑声明式路径，收集全部可见文字。
 *
 * 每项的 render 收到的 Setting 是框架创建的，
 * 它自己的 controlEl / infoEl 里画的内容都要收。
 */
function declarativeContent(tab: JevSettingTab): string[] {
	const out: string[] = [];
	for (const item of flattenDefinitions(tab.getSettingDefinitions())) {
		if (!item.render) continue;
		const setting = new Setting(makeStubElement());
		item.render(setting);
		out.push(...collectVisibleContent(setting.infoEl));
		out.push(...collectVisibleContent(setting.controlEl));
	}
	return out;
}

beforeEach(() => {
	__createdSettings.length = 0;
	__setApiVersion(false);
});

describe("双轨路径的可见内容一致", () => {
	it("两条路径的可见文字完全一致", () => {
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		const imperative = imperativeContent(tab).sort();
		const declarative = declarativeContent(tab).sort();

		expect(imperative.length).toBeGreaterThan(0);
		expect(declarative).toEqual(imperative);
	});

	it("开场说明在两条路径里都出现", () => {
		// 2026-11-13 的实测：删掉这段内容，234 个测试全绿。
		// 这条断言是那次的直接产物。
		//
		// 文案随 locale 变，所以不硬编码具体文字 ——
		// 断言「说明段落存在」本身，两条路径的完整文字在第 1 条里比对。
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		const declarative = declarativeContent(tab);
		const paragraphs = declarative.filter((c) => c.startsWith("p|"));
		expect(paragraphs.length).toBeGreaterThanOrEqual(1);
		expect(paragraphs[0]).toContain("JEV");
	});

	it("各节的说明段落都在两条路径里出现", () => {
		// 「组织方式」与「分类与去向」两节各有一段说明文字。
		// 这些段落同样不挂 Setting 控件 —— 只看 Setting 记录查不出来。
		const plugin = makePlugin(deepCopy(DEFAULT_SETTINGS));
		const tab = makeTab(plugin);

		const imperative = imperativeContent(tab);
		const declarative = declarativeContent(tab);

		const hints = (list: string[]) =>
			list.filter((c) => c.startsWith("p|")).map((c) => c.slice(2));

		expect(hints(imperative).length).toBeGreaterThanOrEqual(3);
		expect(hints(declarative).sort()).toEqual(hints(imperative).sort());
	});
});
