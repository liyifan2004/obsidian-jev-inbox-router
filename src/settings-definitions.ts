import { Setting, type SettingDefinitionItem, type SettingGroupItem } from "obsidian";
import { t } from "./i18n";

/**
 * 设置页的**单一事实来源**。
 *
 * ## 为什么要有这个文件
 *
 * Obsidian 1.13.0 起支持声明式设置 API（`getSettingDefinitions()`）。
 * 1.13+ 用它渲染，并把每一项登记进「设置搜索」；
 * 1.13 以下（本插件的 minAppVersion 是 1.5.0）没有这个 API，
 * 只能走命令式的 `display()`。
 *
 * 双轨最常见的失败形态是**两份 UI 各写一遍**：加一个设置要改两个地方，
 * 迟早漏掉一个，出现「1.13+ 有、旧版没有」的不一致 ——
 * 而这种不一致在 Obsidian 里**不会报错**，只会在用户换版本后才发现。
 *
 * 这里的设计是**「定义一次，两条路径消费」**：
 * 设置页的每一节都写成「往 sink 里加行」（见 {@link RowSink}），
 * 声明式 sink 把行收集成定义数组，命令式 sink 把行画成 DOM。
 * 两边跑的是**同一批节实现**，结构上不可能漂移。
 *
 * 与同 fleet 的 obsidian-folio、obsidian-media-speed-enhancer 同一套双轨模式
 * （它们用「声明式定义 + 命令式渲染」两份实现，本文件用 sink 把两者收敛到一处）。
 */

/**
 * 分组标题的 i18n 文案键。
 *
 * **刻意不含插件名**：`setName("JEV Inbox Router").setHeading()`
 * 会被商店审查判为 error（标题重复插件名）——
 * 这正是 MSE 1.0.42 被下架的原因。设置页顶部已经显示了插件名。
 */
export const SECTION_KEYS = {
	api: "sectionApi",
	organization: "sectionOrganization",
	categories: "sectionCategories",
	auto: "sectionAuto",
	block: "sectionBlock",
	statusBar: "sectionStatusBar",
	maintenance: "sectionMaintenance",
} as const;

/** 一个分组标题键的取值范围。 */
export type SectionKey = (typeof SECTION_KEYS)[keyof typeof SECTION_KEYS];

/** 取分组标题的本地化文本。 */
export function sectionHeading(key: SectionKey): string {
	return t(key);
}

/**
 * 深拷贝一个纯 JSON 结构，**保留类型**。
 *
 * 为什么不直接用 `JSON.parse(JSON.stringify(x))`：
 *   - `JSON.parse` 的返回类型是 `any`，赋值给 `CategoryConfig[]` 会触发
 *     `@typescript-eslint/no-unsafe-assignment`（官方 eslint 规则的 error 级）。
 *   - JSON 往返会**丢掉 `undefined` 值**的键，也会把 `Date` 变成字符串。
 *
 * 设置项都是纯 JSON（string / number / boolean / 数组 / 普通对象），
 * 手写递归拷贝既类型安全，也比 JSON 往返快。
 */
export function deepCopy<T>(value: T): T {
	// Array.isArray 会把 T 收窄成 any[]，元素类型随之丢失。
	// 先判原始类型再收窄，避免整条链路退化成 any。
	if (Array.isArray(value)) {
		const source = value as unknown[];
		const copy: unknown[] = [];
		for (const item of source) {
			copy.push(deepCopy(item));
		}
		return copy as unknown as T;
	}
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			out[key] = deepCopy(item);
		}
		return out as unknown as T;
	}
	return value;
}

/**
 * 一行设置的宿主 —— **两条渲染路径的唯一接口**。
 *
 * 设置页的每一节都写成「往 sink 里加行」，而不是「往某个容器里画 DOM」。
 * 于是：
 *   - 命令式 sink 把行画成 `new Setting(root)`；
 *   - 声明式 sink 把行收集成 `SettingDefinitionItem[]`。
 *
 * 两条路径消费同一批节实现，所以**不可能出现「1.13+ 有、旧版没有」的不一致**。
 */
export interface RowSink {
	/**
	 * 一个标准设置行：左侧名称与描述，右侧控件。
	 *
	 * @param name 显示名（已本地化）
	 * @param desc 描述（可省略）
	 * @param build 往这一行里挂控件
	 */
	row(name: string, desc: string | undefined, build: (setting: Setting) => void): void;

	/**
	 * 一个自定义块：整块替换设置行的内容。
	 *
	 * 用于「预设列表」「分类卡片列表」这类不是单个设置项的内容。
	 *
	 * 自定义块没有单一可搜的名称，所以**不进设置搜索**——
	 * 让它可搜只会匹配出噪声。
	 * 但它仍然需要一个名字：两条渲染路径要能对上同一批块
	 * （见 test/settings-tab.test.ts 的双轨一致性断言）。
	 *
	 * @param name 块的标识（仅用于两条路径对齐与调试，不进搜索）
	 * @param build 往容器里画自定义 DOM
	 */
	block(name: string, build: (container: HTMLElement) => void): void;
}

/**
 * 命令式 sink：把行画成 Obsidian 的设置行。
 *
 * 用在 Obsidian 1.13 以下（本插件的 minAppVersion 是 1.5.0）。
 */
export function createImperativeSink(root: HTMLElement): RowSink {
	return {
		row(name: string, desc: string | undefined, build: (setting: Setting) => void) {
			const setting = new Setting(root).setName(name);
			if (desc) setting.setDesc(desc);
			build(setting);
		},
		block(name: string, build: (container: HTMLElement) => void) {
			// 自定义块也占一行 Setting —— 与声明式路径的结构保持一致。
			// （之前这里是直接 build(root)，结果两条路径的行数不同：
			//  声明式多出一行、命令式没有。行数不一致会让「两条路径等价」
			//  这个不变量没法被断言守住。）
			const setting = new Setting(root).setName(name);
			setting.settingEl.empty();
			setting.settingEl.addClass("jev-custom-block");
			build(setting.controlEl);
		},
	};
}

/**
 * 声明式 sink：把行收集成 Obsidian 1.13+ 的设置定义。
 *
 * 用在 Obsidian 1.13+。
 *
 * **注意 `render` 回调的返回值**：Obsidian 1.13 的声明式渲染器会把
 * `render()` 的返回值当作「行销毁前的清理函数」调用。
 * 如果写成表达式体 `render: (s) => s.addDropdown(...)`，
 * 返回的是 Setting 组件对象 —— Obsidian 会尝试当函数调用并抛
 * `TypeError: t is not a function`，**设置页的子页面永远打不开**。
 *
 * 所以这里一律用大括号体 + 显式 `return undefined`。
 * （这个坑来自 PKM-er/obsidian-editing-toolbar 4.1.6 的真实事故。）
 */
export function createDeclarativeSink(): RowSink & {
	groups: SettingDefinitionItem[];
	heading(key: SectionKey): void;
} {
	const groups: SettingDefinitionItem[] = [];
	// 当前分组。items 在官方类型里是可选的，但**我们总是填它**，
	// 所以这里单独记一份 items 引用，避免每次 push 都做可选性判断。
	let currentItems: SettingGroupItem[] | null = null;

	return {
		groups,
		heading(key: SectionKey) {
			const items: SettingGroupItem[] = [];
			currentItems = items;
			groups.push({
				type: "group",
				heading: sectionHeading(key),
				items,
			});
		},
		row(name: string, desc: string | undefined, build: (setting: Setting) => void) {
			if (!currentItems) return;
			currentItems.push({
				name,
				desc,
				render: (setting: Setting) => {
					build(setting);
				},
			});
		},
		block(name: string, build: (container: HTMLElement) => void) {
			if (!currentItems) return;
			currentItems.push({
				// 自定义块没有单一可搜的名称，让它进搜索只会匹配出噪声。
				name,
				searchable: false,
				render: (setting: Setting) => {
					// 自定义块要占满整行：先清掉 Setting 自带的名字/描述，
					// 再把容器撑满。
					setting.settingEl.empty();
					setting.settingEl.addClass("jev-custom-block");
					build(setting.controlEl);
				},
			});
		},
	};
}
