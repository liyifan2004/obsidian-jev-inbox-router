import { TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";

/**
 * 内存版 Obsidian 库。
 *
 * 只实现 router / 插件真正调用的那部分 API，行为与真实 Obsidian 对齐：
 * 路径统一用 `/`、`renameFile` 会同步更新 TFile 实例的 path/name/basename，
 * `processFrontMatter` 会解析 YAML 头、交给回调、再写回文件。
 */
export class FakeVault {
	readonly root = new TFolder();
	readonly contents = new Map<string, string>();
	readonly objects = new Map<string, TAbstractFile>();
	readonly renameLog: Array<{ from: string; to: string }> = [];
	readonly createdFolders: string[] = [];
	readonly writtenFiles: string[] = [];

	constructor() {
		this.root.path = "";
		this.root.name = "";
	}

	// ------------------------------------------------------------ 测试便捷方法

	seed(files: Record<string, string>, folders: string[] = []): this {
		for (const folder of folders) this.addFolder(folder);
		for (const [path, content] of Object.entries(files)) this.addFile(path, content);
		return this;
	}

	text(path: string): string {
		return this.contents.get(normalizePath(path)) ?? "";
	}

	has(path: string): boolean {
		return this.objects.has(normalizePath(path));
	}

	paths(): string[] {
		return [...this.objects.keys()].sort();
	}

	// ------------------------------------------------------------ Obsidian API

	getRoot(): TFolder {
		return this.root;
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.objects.get(normalizePath(path)) ?? null;
	}

	getAllLoadedFiles(): TAbstractFile[] {
		return [...this.objects.values()];
	}

	getMarkdownFiles(): TFile[] {
		return [...this.objects.values()].filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md"
		);
	}

	async createFolder(path: string): Promise<TFolder> {
		return this.addFolder(path);
	}

	async create(path: string, content: string): Promise<TFile> {
		return this.addFile(path, content);
	}

	async cachedRead(file: TFile): Promise<string> {
		return this.contents.get(file.path) ?? "";
	}

	async read(file: TFile): Promise<string> {
		return this.contents.get(file.path) ?? "";
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.contents.set(file.path, content);
		this.writtenFiles.push(file.path);
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const next = fn(this.contents.get(file.path) ?? "");
		this.contents.set(file.path, next);
		this.writtenFiles.push(file.path);
		return next;
	}

	/** 真实 Obsidian 的 fileManager 子集 */
	readonly fileManager = {
		renameFile: async (file: TFile, newPath: string): Promise<void> => {
			this.rename(file, newPath);
		},
		processFrontMatter: async (
			file: TFile,
			fn: (frontmatter: Record<string, unknown>) => void
		): Promise<void> => {
			const raw = this.contents.get(file.path) ?? "";
			const parsed = parseFrontmatter(raw);
			fn(parsed.data);
			const next = `${serializeFrontmatter(parsed.data)}${parsed.body}`;
			this.contents.set(file.path, next);
			this.writtenFiles.push(file.path);
		},
	};

	// ------------------------------------------------------------ 内部

	addFolder(path: string): TFolder {
		const clean = normalizePath(path);
		if (!clean) return this.root;
		let current = this.root;
		let acc = "";
		for (const part of clean.split("/")) {
			acc = acc ? `${acc}/${part}` : part;
			const existing = this.objects.get(acc);
			if (existing instanceof TFolder) {
				current = existing;
				continue;
			}
			const folder = new TFolder();
			folder.path = acc;
			folder.name = part;
			folder.parent = current;
			current.children.push(folder);
			this.objects.set(acc, folder);
			this.createdFolders.push(acc);
			current = folder;
		}
		return current;
	}

	addFile(path: string, content: string): TFile {
		const clean = normalizePath(path);
		const segments = clean.split("/");
		const name = segments.pop() ?? clean;
		const dir = segments.join("/");
		const parent = dir ? this.addFolder(dir) : this.root;

		const dot = name.lastIndexOf(".");
		const file = new TFile();
		file.path = clean;
		file.name = name;
		file.basename = dot > 0 ? name.slice(0, dot) : name;
		file.extension = dot > 0 ? name.slice(dot + 1) : "";
		file.parent = parent;
		file.stat = { ctime: 0, mtime: 0, size: content.length };

		parent.children.push(file);
		this.objects.set(clean, file);
		this.contents.set(clean, content);
		return file;
	}

	rename(file: TFile, newPath: string): void {
		const target = normalizePath(newPath);
		const from = file.path;
		if (target === from) return;
		if (this.objects.has(target)) {
			throw new Error(`已存在同名文件：${target}`);
		}

		const segments = target.split("/");
		const name = segments.pop() ?? target;
		const dir = segments.join("/");
		const parent = dir ? this.addFolder(dir) : this.root;

		if (file.parent) {
			file.parent.children = file.parent.children.filter((c) => c !== file);
		}
		parent.children.push(file);

		const content = this.contents.get(from) ?? "";
		this.contents.delete(from);
		this.objects.delete(from);

		const dot = name.lastIndexOf(".");
		file.path = target;
		file.name = name;
		file.basename = dot > 0 ? name.slice(0, dot) : name;
		file.extension = dot > 0 ? name.slice(dot + 1) : "";
		file.parent = parent;

		this.objects.set(target, file);
		this.contents.set(target, content);
		this.renameLog.push({ from, to: target });
	}
}

// ------------------------------------------------------------------ YAML 子集

export function parseFrontmatter(raw: string): {
	data: Record<string, unknown>;
	body: string;
} {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { data: {}, body: raw };

	const data: Record<string, unknown> = {};
	const lines = match[1].split(/\r?\n/);
	let currentKey: string | null = null;

	for (const line of lines) {
		const item = line.match(/^\s+-\s+(.*)$/);
		if (item && currentKey) {
			const list = Array.isArray(data[currentKey]) ? (data[currentKey] as unknown[]) : [];
			list.push(coerce(item[1]));
			data[currentKey] = list;
			continue;
		}
		const entry = line.match(/^([^:#]+):\s*(.*)$/);
		if (!entry) continue;
		currentKey = entry[1].trim();
		const value = entry[2].trim();
		if (value === "") {
			data[currentKey] = [];
		} else {
			data[currentKey] = coerce(value);
		}
	}
	return { data, body: raw.slice(match[0].length) };
}

function coerce(value: string): unknown {
	const trimmed = value.replace(/^["']|["']$/g, "");
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return trimmed
			.slice(1, -1)
			.split(",")
			.map((s) => s.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
	}
	return trimmed;
}

export function serializeFrontmatter(data: Record<string, unknown>): string {
	const keys = Object.keys(data);
	if (keys.length === 0) return "";
	const lines: string[] = ["---"];
	for (const key of keys) {
		const value = data[key];
		if (Array.isArray(value)) {
			lines.push(`${key}:`);
			for (const item of value) lines.push(`  - ${formatScalar(item)}`);
		} else {
			lines.push(`${key}: ${formatScalar(value)}`);
		}
	}
	lines.push("---", "");
	return lines.join("\n");
}

function formatScalar(value: unknown): string {
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	const text = String(value ?? "");
	if (/^[A-Za-z0-9_./-]+$/.test(text)) return text;
	return JSON.stringify(text);
}
