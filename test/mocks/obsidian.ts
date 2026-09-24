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

export class Setting {
	constructor(_el: unknown) {}

	setName(): this {
		return this;
	}

	setDesc(): this {
		return this;
	}

	setTooltip(): this {
		return this;
	}

	addButton(): this {
		return this;
	}

	addToggle(): this {
		return this;
	}

	addText(): this {
		return this;
	}

	addTextArea(): this {
		return this;
	}

	addDropdown(): this {
		return this;
	}

	addSlider(): this {
		return this;
	}

	addExtraButton(): this {
		return this;
	}
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
