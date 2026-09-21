/**
 * 共享类型定义。
 *
 * 设计原则：JEV 只回答「这条笔记属于哪一类」，因此所有类型都围绕
 * 一次「判断 → 去向」的结果展开，不涉及任何生成式内容。
 */

/** 判断块在笔记中的插入位置 */
export type BlockPlacement = "top" | "bottom";

/** 判断块的渲染样式 */
export type BlockStyle = "callout" | "details" | "quote";

/** F 类（应该删除）的处置方式。任何情况下都不会真的删除文件。 */
export type DeletionHandling = "mark" | "move" | "ignore";

/** 自动分流监听范围 */
export type WatchScope = "inbox" | "vault";

/** 一个分类（对应 JEV 的一个 choice 选项） */
export interface CategoryConfig {
	/** 稳定标识，作为 JEV choice 的 option key */
	key: string;
	/** 显示名，如「永久知识」 */
	label: string;
	/** 状态栏用的短名，如「知识」 */
	short: string;
	/** 喂给 JEV 的判据描述 */
	description: string;
	/** 目标文件夹（库内相对路径，空字符串表示库根目录） */
	folder: string;
	/** 可选：写入 frontmatter 的标签 */
	tag: string;
	/** 是否参与判断 */
	enabled: boolean;
	/** 界面配色（圆点、概率条） */
	color: string;
}

export interface JevSettings {
	/** TypeSafe API Key */
	apiKey: string;
	/** System One 端点 */
	apiUrl: string;
	/** 模型名，如 jev-latest */
	model: string;

	/** 分类定义 */
	categories: CategoryConfig[];

	/** 监听范围 */
	watchScope: WatchScope;
	/** 收件箱文件夹列表 */
	inboxFolders: string[];

	/** 是否自动分流 */
	autoRouteEnabled: boolean;
	/** 停止编辑多久后才判断（毫秒） */
	autoRouteDelayMs: number;
	/** 自动分流前弹窗确认 */
	autoRouteRequireConfirm: boolean;
	/** 内容少于该字符数直接跳过 */
	minChars: number;

	/** 置信度阈值：被选中选项的概率下限 */
	confidenceThreshold: number;
	/** 领先优势阈值：首选概率 / 次选概率 */
	marginThreshold: number;
	/** 是否额外询问长期价值 */
	lowValueEnabled: boolean;
	/** F 类处置方式 */
	deletionHandling: DeletionHandling;

	/** 是否写入判断块 */
	blockEnabled: boolean;
	blockPlacement: BlockPlacement;
	blockStyle: BlockStyle;
	/** 判断块中是否显示完整概率分布 */
	blockShowProbabilities: boolean;
	/** 是否写入 frontmatter 字段 */
	writeFrontmatter: boolean;

	/** 状态栏 */
	statusBarEnabled: boolean;
	statusBarClearMs: number;

	/** 同一路径同一内容的判断结果缓存时长（分钟） */
	cacheMinutes: number;
}

/** JEV 返回的 choice 答案 */
export interface JevAnswerChoice {
	type: "choice";
	choice?: string;
	confidence?: number;
	probabilities?: Record<string, number>;
}

export interface JevAnswerScore {
	type: "score";
	score?: number;
	confidence?: number;
	probabilities?: Record<string, number>;
}

export interface JevAnswerNoul {
	type: "noul";
	noul?: number;
}

export type JevAnswer = JevAnswerChoice | JevAnswerScore | JevAnswerNoul;

export interface JevResponse {
	model?: string;
	answers?: Record<string, JevAnswer>;
	usage?: { input_tokens?: number; output_tokens?: number };
	error?: unknown;
}

/** 概率表里的一项（已按概率降序排好） */
export interface JevProbabilityEntry {
	key: string;
	label: string;
	short: string;
	color: string;
	p: number;
}

/** 一次完整的判断结果 */
export interface RouterDecision {
	/** 选中的分类 key */
	categoryKey: string;
	/** 选中的分类显示名 */
	categoryLabel: string;
	/** 目标文件夹 */
	targetFolder: string;
	/** 被选中选项的概率（用于门槛判断） */
	confidence: number;
	/** 模型自报的 confidence，仅作展示 */
	modelConfidence: number | null;
	/** 首选 / 次选 */
	margin: number;
	/** 完整概率分布，降序 */
	ranking: JevProbabilityEntry[];
	/** 长期价值：0 起的档位索引 */
	valueIndex: number | null;
	valueLevels: string[];
	model: string;
	/** 判断时间（epoch ms） */
	at: number;
	usage?: { input_tokens?: number; output_tokens?: number };
}

/** 一次分流的完整记录（用于撤销） */
export interface UndoEntry {
	/** 分流后的路径 */
	path: string;
	/** 分流前的路径 */
	previousPath: string;
	/** 写入判断块之前的内容，null 表示当时没有改动内容 */
	previousContent: string | null;
	at: number;
}

/** 缓存条目 */
export interface CacheEntry {
	hash: string;
	at: number;
	decision: RouterDecision;
}
