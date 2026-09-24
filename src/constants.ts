import type { CategoryConfig, JevSettings } from "./types";

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_MODEL = "jev-latest";

/** 判断块标记，用于可靠地替换 / 移除 */
export const BLOCK_START = "<!-- jev-route:start -->";
export const BLOCK_END = "<!-- jev-route:end -->";

/** 长期价值档位（JEV score 类型，2~10 档） */
export const VALUE_LEVELS = [
	"几乎无价值：碎片、测试文本、重复内容、误粘贴",
	"偏低：只记下一句话，缺少上下文，将来很难再用",
	"中等：有具体信息，将来可能派上用场",
	"很高：可复用的知识、明确的任务、或值得反复回看的重要想法",
];

/**
 * 默认分类。
 *
 * 目标文件夹是按当前库（D:\MyNotes\学-习）里已存在的目录预填的，
 * 目的是装好就能用；全部可以在设置页里改成任意文件夹。
 */
export const DEFAULT_CATEGORIES: CategoryConfig[] = [
	{
		key: "A",
		label: "永久知识",
		short: "知识",
		description:
			"值得长期保留、以后会反复查阅的知识：概念、原理、方法、结论、自己的总结。写完就是成品，不需要再做别的事。",
		folder: "大学",
		tag: "知识",
		enabled: true,
		color: "#4C8DFF",
	},
	{
		key: "B",
		label: "产品灵感",
		short: "灵感",
		description:
			"产品想法、功能点子、交互观察、竞品启发、用户需求洞察——指向「可以做什么」的东西。",
		folder: "腾讯-产品",
		tag: "产品灵感",
		enabled: true,
		color: "#FF8A3D",
	},
	{
		key: "C",
		label: "待研究",
		short: "研究",
		description:
			"需要进一步查证、学习或实验才能得出结论的问题、线索、疑问、看不懂的专有名词。",
		folder: "_附件-归档-模板/归档",
		tag: "待研究",
		enabled: true,
		color: "#9B8CFF",
	},
	{
		key: "D",
		label: "待办事项",
		short: "待办",
		description:
			"需要执行的具体行动：任务、约定、日程、要交付的东西、要回复的人。有动作，有对象。",
		folder: "要做的事",
		tag: "待办",
		enabled: true,
		color: "#FFC53D",
	},
	{
		key: "E",
		label: "引用资料",
		short: "引用",
		description:
			"来自外部、以便日后引用为主的材料：网页剪藏、PDF 摘录、他人文章、书籍段落、AI 对话记录。",
		folder: "_附件-归档-模板/附件",
		tag: "引用",
		enabled: true,
		color: "#3DC9B0",
	},
	{
		key: "F",
		label: "应该删除",
		short: "废弃",
		description:
			"没有保存价值的内容：随手输入的碎片、测试文本、重复内容、没有上下文的残句、误粘贴、只剩一句「# 新建笔记」的空壳。",
		folder: "_附件-归档-模板/归档",
		tag: "废弃",
		enabled: true,
		color: "#FF5C5C",
	},
];

export const DEFAULT_SETTINGS: JevSettings = {
	apiKey: "",
	apiUrl: JEV_ENDPOINT,
	model: DEFAULT_MODEL,

	categories: DEFAULT_CATEGORIES,

	watchScope: "inbox",
	inboxFolders: ["Inbox"],
	// index 目录：JEV 的监听与建议来源（与 inboxFolders 保持同步）
	indexFolder: "Inbox",
	// 默认「建议模式」：判断后不动文件，状态栏给建议 + 一键接受
	moveOnJudge: false,
	// 应用预设前的分类快照，null = 没有
	previousCategories: null,

	// 默认关闭自动分流：先手动试几次，确认判断可信再打开。
	autoRouteEnabled: false,
	autoRouteDelayMs: 4000,
	autoRouteRequireConfirm: false,
	minChars: 12,

	// 六个选项的 choice，单选概率通常落在 0.3~0.6 区间，
	// 因此门槛定在 0.4 起步，并额外要求首选明显领先次选。
	confidenceThreshold: 0.4,
	marginThreshold: 1.4,
	lowValueEnabled: true,
	deletionHandling: "mark",

	blockEnabled: true,
	blockPlacement: "top",
	blockStyle: "callout",
	blockShowProbabilities: true,
	writeFrontmatter: true,

	statusBarEnabled: true,
	statusBarClearMs: 12000,

	cacheMinutes: 30,
};

/** 分类数量上限（JEV choice 支持 255 个选项，这里给用户留出充分空间） */
export const MAX_CATEGORIES = 12;

/** 送进 JEV 的正文字符上限（模型上下文 32k tokens） */
export const MAX_CONTENT_CHARS = 6000;
