/**
 * Obsidian API 的最小桩模块。
 *
 * 只在测试里使用（通过 vitest.config.mts 的 alias 把 "obsidian" 指到这里）。
 * 只实现被测代码真正用到的那部分 API，行为尽量贴近真实 Obsidian。
 * 类形状与真实声明保持结构兼容，这样测试代码也能通过 tsc。
 */

import type { Vault } from "obsidian";

export class TAbstractFile {
	vault: Vault = undefined as unknown as Vault;
	path = "";
	name = "";
	parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
	basename = "";
	extension = "";
	stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];

	isRoot(): boolean {
		return this.path === "";
	}
}

/** 与 Obsidian 一致：统一分隔符、去掉首尾斜杠 */
export function normalizePath(input: string): string {
	return String(input ?? "")
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	throw?: boolean;
}

export interface RequestUrlResponse {
	status: number;
	headers: Record<string, string>;
	text: string;
	json: unknown;
	arrayBuffer: ArrayBuffer;
}

/** 测试通过它注入 http 层行为 */
export type RequestHandler = (param: RequestUrlParam) => Promise<RequestUrlResponse>;

let requestHandler: RequestHandler | null = null;

export function __setRequestHandler(handler: RequestHandler | null): void {
	requestHandler = handler;
}

export function __getRequestHandler(): RequestHandler | null {
	return requestHandler;
}

export async function requestUrl(param: RequestUrlParam): Promise<RequestUrlResponse> {
	if (!requestHandler) {
		throw new Error("测试里必须先调用 __setRequestHandler 注入 http 层行为");
	}
	return requestHandler(param);
}

/** 造一个请求响应，供测试使用 */
export function makeResponse(
	status: number,
	body: unknown,
	headers: Record<string, string> = {}
): RequestUrlResponse {
	const text = typeof body === "string" ? body : JSON.stringify(body);
	return {
		status,
		headers,
		text,
		json: typeof body === "string" ? undefined : body,
		arrayBuffer: new ArrayBuffer(0),
	};
}

// ---------------------------------------------------------------- 仅用于满足类型

export class App {
	vault!: unknown;
	fileManager!: unknown;
	workspace!: unknown;
	metadataCache!: unknown;
}

// ---------------------------------------------------------------- moment 桩

/**
 * i18n（src/i18n.ts）与数据层（constants.ts / presets.ts）通过 moment.locale()
 * 检测 Obsidian UI 语言。测试里默认 "zh-cn"（与插件主要受众一致），
 * 需要 "en" 用例可用 __setLocale("en") 临时切换。
 */
let mockLocale = "zh-cn";

export function __setLocale(locale: string): void {
	mockLocale = locale;
}

export function __getLocale(): string {
	return mockLocale;
}

export const moment: { locale(): string } = {
	locale: () => mockLocale,
};

export class Plugin {
	app!: App;
	manifest!: unknown;

	constructor(app?: App) {
		if (app) this.app = app;
	}

	addRibbonIcon(): HTMLElement {
		return undefined as unknown as HTMLElement;
	}

	addStatusBarItem(): HTMLElement {
		return undefined as unknown as HTMLElement;
	}

	addCommand(): void {
		/* noop */
	}

	addSettingTab(): void {
		/* noop */
	}

	registerEvent(): void {
		/* noop */
	}

	async loadData(): Promise<unknown> {
		return null;
	}

	async saveData(): Promise<void> {
		/* noop */
	}
}

export class PluginSettingTab {
	containerEl: HTMLElement = undefined as unknown as HTMLElement;

	constructor(public app: App, public plugin: Plugin) {}

	display(): void {
		/* noop */
	}

	/** 1.13+ 的声明式刷新 API。 */
	update(): void {
		/* noop */
	}

	/**
	 * 1.13+ 的声明式定义 API。
	 *
	 * **基类不提供实现** —— 官方 d.ts 里 `getSettingDefinitions()` 是抽象方法，
	 * 由插件子类实现。桩里如果给基类一个返回空数组的实现，
	 * 子类的 `getSettingDefinitions()` 会被**遮蔽**：
	 * 测试调用的其实是基类那个空实现，
	 * 于是「声明式路径返回了什么」根本测不到。
	 *
	 * 所以这里**不实现**它 —— 子类没实现时调用会抛错，
	 * 这正好能立刻暴露「测的其实是基类桩」的情况。
	 */
	getSettingDefinitions(): unknown[] {
		throw new Error(
			"PluginSettingTab.getSettingDefinitions() 应由插件子类实现；" +
				"调用到这里说明测试命中了基类桩。"
		);
	}
}

/**
 * Obsidian 的运行时特性探测。
 *
 * 桩里默认返回 false —— 也就是「假装跑在 1.13 以下」，
 * 这样命令式路径是默认被测的那条。
 * 测试需要 1.13+ 分支时用 {@link __setApiVersion} 切换。
 */
export function requireApiVersion(_version: string): boolean {
	return currentApiVersion;
}

let currentApiVersion = false;

/** 切换 requireApiVersion 的返回值（测试用）。 */
export function __setApiVersion(value: boolean): void {
	currentApiVersion = value;
}

export class Modal {
	contentEl: HTMLElement = undefined as unknown as HTMLElement;
	titleEl: HTMLElement = undefined as unknown as HTMLElement;
	modalEl: HTMLElement = undefined as unknown as HTMLElement;
	scope = {};

	constructor(public app: App) {}

	open(): void {
		/* noop */
	}

	close(): void {
		/* noop */
	}

	onOpen(): void {
		/* noop */
	}

	onClose(): void {
		/* noop */
	}
}

/**
 * 与真实 Obsidian 结构兼容的最小 SuggestModal 桩。
 * 只为「导入模块不会在 import 阶段炸」而存在，不参与断言。
 */
export class SuggestModal<T> extends Modal {
	inputEl: HTMLInputElement = undefined as unknown as HTMLInputElement;
	resultContainerEl: HTMLElement = undefined as unknown as HTMLElement;
	limit = 100;
	emptyStateText = "No results found.";
	constructor(app: App) {
		super(app);
	}
	setPlaceholder(_placeholder: string): void {
		/* noop */
	}
	setInstructions(_instructions: unknown): void {
		/* noop */
	}
	getSuggestions(_query: string): T[] | Promise<T[]> {
		return [];
	}
	renderSuggestion(_item: T, _el: HTMLElement): void {
		/* noop */
	}
	onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void {
		/* noop */
	}
}

/**
 * 造一个「什么都不做但什么方法都有」的元素桩。
 *
 * 设置页会 createEl / createDiv / createSpan / setAttribute / addClass ……
 * 全部都要有，否则测试会因为桩不完整而失败 ——
 * 那种失败是**桩的问题**，不是被测代码的问题。
 *
 * ## 为什么它要跟踪子节点
 *
 * Obsidian 的 `Setting` 结构是 `settingEl > (infoEl, controlEl)`。
 * `settingEl.empty()` 会把子节点一起清掉 —— 之后往 `controlEl` 画的内容
 * **不会出现在页面上**。
 *
 * 这种「容器已脱离 DOM」的错误在纯方法级 mock 里查不出来
 * （每个属性都是独立对象，互相不知道关系）。
 * 所以这里让 `empty()` 真的把子节点标记为「已清空」，
 * 让测试能断言「内容画进了还活着的容器」。
 */
export function makeStubElement(): HTMLElement {
	const el: Record<string, unknown> = {
		setAttribute: () => undefined,
		getAttribute: () => null,
		// 类名要真的记录下来 —— 有些缺陷只在「某个 CSS 作用域类没被加上」
		// 时才看得见（例如响应式布局规则全都挂在 `.jev-settings` 之下）。
		addClass: (...cls: string[]) => {
			const classes = el.__classes as string[];
			for (const c of cls) {
				if (!classes.includes(c)) classes.push(c);
			}
		},
		removeClass: (...cls: string[]) => {
			el.__classes = (el.__classes as string[]).filter((c) => !cls.includes(c));
		},
		toggleClass: (cls: string, force?: boolean) => {
			const classes = el.__classes as string[];
			const has = classes.includes(cls);
			const next = force ?? !has;
			if (next && !has) classes.push(cls);
			if (!next && has) {
				el.__classes = classes.filter((c) => c !== cls);
			}
		},
		hasClass: (cls: string) => (el.__classes as string[]).includes(cls),
		/** 记录下来的类名（测试用来断言 CSS 作用域类有没有被加上） */
		__classes: [] as string[],
		setText: () => undefined,
		appendChild: () => el,
		remove: () => undefined,
		detach: () => undefined,
		empty: () => {
			// 清空自己：子节点一并失效（模拟真实 DOM 的 empty() 语义）
			for (const child of el.__children as unknown[]) {
				(child as { __detached?: boolean }).__detached = true;
			}
			(el.__children as unknown[]).length = 0;
		},
		querySelector: () => null,
		querySelectorAll: () => [],
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 }),
		style: {
			setProperty: () => undefined,
			removeProperty: () => undefined,
			getPropertyValue: () => "",
		},
		/** 子节点列表（测试用来判断某容器是否已被清空） */
		__children: [] as unknown[],
		/** 是否已被 empty() 脱离 */
		__detached: false,
		/**
		 * 可见内容记录（tag / 文本 / 类名）。
		 *
		 * ## 为什么需要它
		 *
		 * 「Setting 桩的记录」只是**一种**能力的承载方式。
		 * 往容器里 `createEl("p", { text })` 画出来的说明段落、
		 * `createDiv({ cls })` 画出来的卡片，都**不进** Setting 桩的记录 ——
		 * 于是「设置页少了什么」这类缺陷对现有断言是隐形的。
		 *
		 * 实测（2026-11-13）：把 JEV 声明式路径的开场说明段落整个删掉，
		 * 234 个测试**全部通过**。
		 *
		 * 所以这里记录每一个被创建出来的元素的内容，
		 * 让「用户能看到的文字」变成可断言的。
		 */
		__visible: [] as Array<{ tag: string; text: string; cls: string }>,
	};

	/** 记录一个被创建出来的可见元素，并挂到父节点。 */
	const record = (tag: string, opts?: { text?: string; cls?: string }): HTMLElement => {
		const child = makeStubElement();
		(child as unknown as {
			__visible: Array<{ tag: string; text: string; cls: string }>;
		}).__visible.push({
			tag,
			text: opts?.text ?? "",
			cls: opts?.cls ?? "",
		});
		// 挂到父节点，模拟真实 DOM 的父子关系。
		(el.__children as unknown[]).push(child);
		return child;
	};

	el.createEl = (tag: string, opts?: { text?: string; cls?: string }) => record(tag, opts);
	el.createDiv = (opts?: { text?: string; cls?: string }) => record("div", opts);
	el.createSpan = (opts?: { text?: string; cls?: string }) => record("span", opts);
	return el as unknown as HTMLElement;
}

/**
 * 收集一个容器下的全部可见内容（递归）。
 *
 * 返回 `tag|文本` 的列表，忽略类名 ——
 * 类名是样式，不是用户能读到的信息。
 */
export function collectVisibleContent(el: HTMLElement): string[] {
	const out: string[] = [];
	const walk = (node: HTMLElement) => {
		const visible = (node as unknown as {
			__visible?: Array<{ tag: string; text: string; cls: string }>;
		}).__visible;
		for (const v of visible ?? []) {
			if (v.text) out.push(`${v.tag}|${v.text}`);
		}
		const children = (node as unknown as { __children?: unknown[] }).__children ?? [];
		for (const child of children) walk(child as HTMLElement);
	};
	walk(el);
	return out;
}

/** 所有被创建出来的 Setting 行 —— 测试用来断言两条渲染路径的一致性。 */
export const __createdSettings: Setting[] = [];

/**
 * 与真实 Obsidian 结构兼容的最小 Setting 桩。
 *
 * 它**记录**每个设置行的名字与描述，这样测试才能断言
 * 「声明式路径与命令式路径产出的行集合一致」——
 * 这正是双轨改造最该守住的不变量（两份 UI 漂移是这类改造最大的坑）。
 */
export class Setting {
	/** 本行的显示名（setName 的入参）。 */
	name: string | undefined;
	/** 本行的描述（setDesc 的入参）。 */
	desc: string | undefined;
	/** 是否是分组标题（setHeading）。 */
	heading = false;
	/** 挂过的控件类型，按挂载顺序。 */
	controls: string[] = [];
	/** 附加按钮的个数。 */
	extraButtons = 0;
	/** 按钮的文案与回调。 */
	buttons: { text: string; onClick: () => unknown }[] = [];
	/** extraSettingsEl —— addOverflowButton 用它定位菜单。 */
	extraSettingsEl: HTMLElement = makeStubElement();
	/**
	 * controlEl —— 自定义块用它当容器。
	 *
	 * **真实结构**：`controlEl` 是 `settingEl` 的**子节点**。
	 * 所以 `settingEl.empty()` 会把它一起清掉（内容脱离 DOM）——
	 * 这是 mock 必须模拟出来的关系，否则测不出
	 * 「empty 整个 settingEl 后往 controlEl 画的内容不显示」这类缺陷。
	 */
	controlEl: HTMLElement = makeStubElement();
	/** infoEl —— 名称与描述的容器。自定义块清它来去掉默认文案。 */
	infoEl: HTMLElement = makeStubElement();
	/** settingEl —— 整行的容器。 */
	settingEl: HTMLElement = makeStubElement();

	constructor(public el: unknown) {
		__createdSettings.push(this);
		// 模拟真实的父子结构：controlEl / infoEl 是 settingEl 的子节点。
		// 这样 `settingEl.empty()` 之后往 controlEl 画的内容会被标记为脱离，
		// 测试才能查出「画进了已失效的容器」这类缺陷。
		const children = (this.settingEl as unknown as { __children?: unknown[] }).__children;
		if (children) {
			children.push(this.infoEl, this.controlEl);
		}
		// 整行挂到传入的父容器上（真实 Obsidian 的行为）。
		// 不挂的话，父容器上看不到这一行 ——
		// 「内容画在哪个容器里」这类问题就查不出来。
		const parent = el as { __children?: unknown[] } | undefined;
		const parentChildren = parent?.__children;
		if (parentChildren) {
			parentChildren.push(this.settingEl);
		}
	}

	setName(name?: string): this {
		this.name = name;
		return this;
	}

	setDesc(desc?: string): this {
		this.desc = desc;
		return this;
	}

	setHeading(): this {
		this.heading = true;
		return this;
	}

	setTooltip(): this {
		return this;
	}

	setClass(): this {
		return this;
	}

	setDisabled(): this {
		return this;
	}

	setValue(): this {
		return this;
	}

	setPlaceholder(): this {
		return this;
	}

	setLimits(): this {
		return this;
	}

	setDynamicTooltip(): this {
		return this;
	}

	setCta(): this {
		return this;
	}

	setWarning(): this {
		return this;
	}

	addButton(cb: (b: ButtonComponent) => void): this {
		this.controls.push("button");
		const button: ButtonComponent = {
			setButtonText: (text: string) => {
				button.text = text;
				return button;
			},
			setIcon: () => button,
			setTooltip: () => button,
			setCta: () => button,
			setWarning: () => button,
			setDisabled: () => button,
			text: "",
			onClick: (fn: () => unknown) => {
				this.buttons.push({ text: button.text, onClick: fn });
				return button;
			},
		};
		cb(button);
		return this;
	}

	addToggle(cb?: (t: ToggleComponent) => void): this {
		this.controls.push("toggle");
		const toggle: ToggleComponent = {
			setValue: () => toggle,
			onChange: () => toggle,
			toggleEl: { setAttribute: () => undefined },
		};
		cb?.(toggle);
		return this;
	}

	addText(cb?: (t: TextComponent) => void): this {
		this.controls.push("text");
		const text: TextComponent = {
			setValue: () => text,
			setPlaceholder: () => text,
			onChange: () => text,
			inputEl: {
				type: "text",
				rows: 2,
				addClass: () => undefined,
				parentElement: null,
			},
		};
		cb?.(text);
		return this;
	}

	addTextArea(cb?: (t: TextComponent) => void): this {
		this.controls.push("textarea");
		const text: TextComponent = {
			setValue: () => text,
			setPlaceholder: () => text,
			onChange: () => text,
			inputEl: {
				type: "textarea",
				rows: 2,
				addClass: () => undefined,
				parentElement: null,
			},
		};
		cb?.(text);
		return this;
	}

	addDropdown(cb?: (d: DropdownComponent) => void): this {
		this.controls.push("dropdown");
		const dropdown: DropdownComponent = {
			addOptions: () => dropdown,
			addOption: () => dropdown,
			setValue: () => dropdown,
			onChange: () => dropdown,
		};
		cb?.(dropdown);
		return this;
	}

	addSlider(cb?: (s: SliderComponent) => void): this {
		this.controls.push("slider");
		const slider: SliderComponent = {
			setLimits: () => slider,
			setValue: () => slider,
			setDynamicTooltip: () => slider,
			onChange: () => slider,
		};
		cb?.(slider);
		return this;
	}

	addExtraButton(cb?: (b: ExtraButtonComponent) => void): this {
		this.extraButtons += 1;
		this.controls.push("extraButton");
		const extra: ExtraButtonComponent = {
			setIcon: () => extra,
			setTooltip: () => extra,
			onClick: () => extra,
			extraSettingsEl: makeStubElement(),
		};
		cb?.(extra);
		return this;
	}
}

/** 按钮组件的最小形状。 */
export interface ButtonComponent {
	text: string;
	setButtonText(text: string): ButtonComponent;
	setIcon(icon: string): ButtonComponent;
	setTooltip(tooltip: string): ButtonComponent;
	setCta(): ButtonComponent;
	setWarning(): ButtonComponent;
	setDisabled(): ButtonComponent;
	onClick(fn: () => unknown): ButtonComponent;
}

/** 开关组件的最小形状。 */
export interface ToggleComponent {
	setValue(value: boolean): ToggleComponent;
	onChange(fn: (value: boolean) => unknown): ToggleComponent;
	toggleEl: { setAttribute(name: string, value: string): void };
}

/** 文本组件的最小形状。 */
export interface TextComponent {
	setValue(value: string): TextComponent;
	setPlaceholder(text: string): TextComponent;
	onChange(fn: (value: string) => unknown): TextComponent;
	inputEl: {
		type: string;
		rows: number;
		addClass(...classes: string[]): void;
		parentElement: HTMLElement | null;
	};
}

/** 下拉组件的最小形状。 */
export interface DropdownComponent {
	addOptions(options: Record<string, string>): DropdownComponent;
	addOption(value: string, label: string): DropdownComponent;
	setValue(value: string): DropdownComponent;
	onChange(fn: (value: string) => unknown): DropdownComponent;
}

/** 滑块组件的最小形状。 */
export interface SliderComponent {
	setLimits(min: number, max: number, step: number): SliderComponent;
	setValue(value: number): SliderComponent;
	setDynamicTooltip(): SliderComponent;
	onChange(fn: (value: number) => unknown): SliderComponent;
}

/** 附加按钮组件的最小形状。 */
export interface ExtraButtonComponent {
	setIcon(icon: string): ExtraButtonComponent;
	setTooltip(tooltip: string): ExtraButtonComponent;
	onClick(fn: () => unknown): ExtraButtonComponent;
	extraSettingsEl: HTMLElement;
}

export class Notice {
	constructor(
		public message: string | DocumentFragment,
		public timeout?: number
	) {}

	setMessage(message: string | DocumentFragment): this {
		this.message = message;
		return this;
	}

	hide(): void {
		/* noop */
	}
}

export class MenuItem {
	setTitle(_title: string): this {
		return this;
	}

	setIcon(_icon: string): this {
		return this;
	}

	setSection(_section: string): this {
		return this;
	}

	onClick(_callback: (evt: MouseEvent | KeyboardEvent) => unknown): this {
		return this;
	}
}

export class Menu {
	addItem(_callback?: (item: MenuItem) => void): this {
		return this;
	}

	showAtMouseEvent(_evt: MouseEvent): this {
		return this;
	}

	showAtPosition(_position: { x: number; y: number }): this {
		return this;
	}

	hide(): void {
		/* noop */
	}
}

/** 与真实 Obsidian 一致：给元素挂一个 Lucide 图标。桩里什么都不做。 */
export function setIcon(_el: HTMLElement, _iconId: string): void {
	/* noop */
}

export class MarkdownView {
	file: TFile | null = null;
}

export const Platform = { isDesktopApp: true, isMobileApp: false };
