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

	/** 1.13+ 的声明式定义 API。基类没有具体实现，桩里返回空数组。 */
	getSettingDefinitions(): unknown[] {
		return [];
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
 */
export function makeStubElement(): HTMLElement {
	const el: Record<string, unknown> = {
		setAttribute: () => undefined,
		getAttribute: () => null,
		addClass: () => undefined,
		removeClass: () => undefined,
		toggleClass: () => undefined,
		hasClass: () => false,
		setText: () => undefined,
		appendChild: () => el,
		remove: () => undefined,
		detach: () => undefined,
		empty: () => undefined,
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
	};
	el.createEl = () => makeStubElement();
	el.createDiv = () => makeStubElement();
	el.createSpan = () => makeStubElement();
	return el as unknown as HTMLElement;
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
	/** extraSettingsEl —— addOverflowButton 用它定位菜单、挂 aria-label。 */
	extraSettingsEl: HTMLElement = makeStubElement();
	/** controlEl —— 自定义块用它当容器。 */
	controlEl: HTMLElement = makeStubElement();
	/** settingEl —— 自定义块用它清空整行。 */
	settingEl: HTMLElement = makeStubElement();

	constructor(public el: unknown) {
		__createdSettings.push(this);
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
