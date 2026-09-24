import { DEFAULT_CATEGORIES } from "./constants";
import type { CategoryConfig } from "./types";

/**
 * 内置的「组织方式」预设。
 *
 * 纯数据 + 纯函数：不碰 Obsidian API，可独立测试。
 * 每套预设必须含一个 key 为 F 或 label 含「删除」的分类——
 * src/rules.ts 的 resolveDeletionKey() 靠它识别「应该删除」，缺了这条逻辑就失效。
 */

export interface PresetDefinition {
	/** 稳定 id，用于设置页点选与应用 */
	id: string;
	/** 显示名 */
	name: string;
	/** 一句话说明适合谁（≤ 60 字） */
	description: string;
	/** 建议的 index 目录（应用预设时会一并设为插件的 indexFolder） */
	inboxFolder: string;
	/** 全部 enabled: true 的分类定义 */
	categories: CategoryConfig[];
}

export const ORGANIZATION_PRESETS: PresetDefinition[] = [
	{
		id: "simple",
		name: "极简收件箱",
		description: "不想学方法论，先有个能用的起点。",
		inboxFolder: "Inbox",
		categories: DEFAULT_CATEGORIES,
	},
	{
		id: "para",
		name: "PARA",
		description: "Tiago Forte 的 PARA，按「可行动性」分层（项目/领域/资源/归档），适合项目多的人。",
		inboxFolder: "0 收集箱",
		categories: [
			{
				key: "P",
				label: "项目",
				short: "项目",
				description: "有明确目标和截止的事，做完就归档。",
				folder: "1 项目",
				tag: "项目",
				enabled: true,
				color: "#4C8DFF",
			},
			{
				key: "A",
				label: "领域",
				short: "领域",
				description: "需要长期维护的责任范围：健康、财务、团队、学习。",
				folder: "2 领域",
				tag: "领域",
				enabled: true,
				color: "#3DC9B0",
			},
			{
				key: "R",
				label: "资源",
				short: "资料",
				description: "感兴趣的主题资料，没有截止时间。",
				folder: "3 资料",
				tag: "资料",
				enabled: true,
				color: "#9B8CFF",
			},
			{
				key: "V",
				label: "归档",
				short: "归档",
				description: "已完结的项目与不再活跃的内容。",
				folder: "4 归档",
				tag: "归档",
				enabled: true,
				color: "#7F8C99",
			},
			{
				key: "F",
				label: "待删除",
				short: "待删",
				description: "无保存价值的碎片、测试文本、误粘贴。",
				folder: "5 待删除",
				tag: "待删除",
				enabled: true,
				color: "#FF5C5C",
			},
		],
	},
	{
		id: "zettelkasten",
		name: "卡片盒",
		description:
			"Ahrens《卡片笔记写作法》，文献→永久→结构的写作流水线，适合以写作为产出的人。",
		inboxFolder: "收集箱",
		categories: [
			{
				key: "L",
				label: "文献笔记",
				short: "文献",
				description: "阅读时摘录的他人观点，注明出处。",
				folder: "卡片盒/文献笔记",
				tag: "",
				enabled: true,
				color: "#FF8A3D",
			},
			{
				key: "P",
				label: "永久笔记",
				short: "永久",
				description: "用自己的话写成、可独立理解的原子想法。",
				folder: "卡片盒/永久笔记",
				tag: "",
				enabled: true,
				color: "#4C8DFF",
			},
			{
				key: "S",
				label: "结构笔记",
				short: "结构",
				description: "连接笔记的索引与 MOC。",
				folder: "卡片盒/结构",
				tag: "",
				enabled: true,
				color: "#9B8CFF",
			},
			{
				key: "J",
				label: "项目笔记",
				short: "项目",
				description: "服务于当前项目的临时笔记。",
				folder: "项目",
				tag: "",
				enabled: true,
				color: "#3DC9B0",
			},
			{
				key: "F",
				label: "待删除",
				short: "待删",
				description: "过时的摘录与残句。",
				folder: "归档/待删除",
				tag: "",
				enabled: true,
				color: "#FF5C5C",
			},
		],
	},
	{
		id: "gtd",
		name: "GTD",
		description: "Allen《搞定》，按「下一步是什么」组织，适合事务缠身、要清空大脑的人。",
		inboxFolder: "GTD/收集箱",
		categories: [
			{
				key: "N",
				label: "下一步行动",
				short: "行动",
				description: "马上就能做的具体动作。",
				folder: "GTD/下一步行动",
				tag: "",
				enabled: true,
				color: "#FFC53D",
			},
			{
				key: "W",
				label: "等待中",
				short: "等待",
				description: "已交给别人、在等反馈的事。",
				folder: "GTD/等待中",
				tag: "",
				enabled: true,
				color: "#4C8DFF",
			},
			{
				key: "S",
				label: "将来也许",
				short: "将来",
				description: "现在不做、以后可能做的想法。",
				folder: "GTD/将来也许",
				tag: "",
				enabled: true,
				color: "#9B8CFF",
			},
			{
				key: "R",
				label: "参考资料",
				short: "参考",
				description: "支撑行动的资料。",
				folder: "GTD/参考资料",
				tag: "",
				enabled: true,
				color: "#3DC9B0",
			},
			{
				key: "F",
				label: "待删除",
				short: "待删",
				description: "垃圾与误粘贴。",
				folder: "GTD/垃圾",
				tag: "",
				enabled: true,
				color: "#FF5C5C",
			},
		],
	},
	{
		id: "johnny-decimal",
		name: "约翰尼十进制",
		description: "Johnny·Decimal，用两位数编号给每个文件夹固定坐标，适合喜欢强结构的人。",
		inboxFolder: "00-09 收集箱",
		categories: [
			{
				key: "P",
				label: "计划",
				short: "计划",
				description: "10-19：进行中的计划与任务。",
				folder: "10-19 计划",
				tag: "",
				enabled: true,
				color: "#4C8DFF",
			},
			{
				key: "A",
				label: "领域",
				short: "领域",
				description: "20-29：长期负责的领域。",
				folder: "20-29 领域",
				tag: "",
				enabled: true,
				color: "#3DC9B0",
			},
			{
				key: "T",
				label: "主题",
				short: "主题",
				description: "30-49：学习主题与研究。",
				folder: "30-49 主题",
				tag: "",
				enabled: true,
				color: "#9B8CFF",
			},
			{
				key: "R",
				label: "参考",
				short: "参考",
				description: "50-79：参考资料与素材。",
				folder: "50-79 参考",
				tag: "",
				enabled: true,
				color: "#FF8A3D",
			},
			{
				key: "F",
				label: "待删除",
				short: "待删",
				description: "90-99：待清理。",
				folder: "90-99 待清理",
				tag: "",
				enabled: true,
				color: "#FF5C5C",
			},
		],
	},
	{
		id: "lyt",
		name: "LYT/MOC",
		description: "Nick Milo 的 LYT，主张少建文件夹、靠链接和 MOC 组织——文件夹只当粗筛。",
		inboxFolder: "收集箱",
		categories: [
			{
				key: "M",
				label: "MOC 地图",
				short: "MOC",
				description: "汇总某主题链接的地图笔记。",
				folder: "地图",
				tag: "",
				enabled: true,
				color: "#4C8DFF",
			},
			{
				key: "N",
				label: "原子笔记",
				short: "原子",
				description: "一次只讲一件事的笔记。",
				folder: "笔记",
				tag: "",
				enabled: true,
				color: "#3DC9B0",
			},
			{
				key: "S",
				label: "素材",
				short: "素材",
				description: "剪藏、摘录、引用。",
				folder: "素材",
				tag: "",
				enabled: true,
				color: "#FF8A3D",
			},
			{
				key: "F",
				label: "待删除",
				short: "待删",
				description: "重复与无价值的片段。",
				folder: "待删除",
				tag: "",
				enabled: true,
				color: "#FF5C5C",
			},
		],
	},
];

/** 按 id 查预设 */
export function presetById(id: string): PresetDefinition | undefined {
	return ORGANIZATION_PRESETS.find((p) => p.id === id);
}

/**
 * 追加模式：把预设分类的 key 重映射到未被占用的字母，返回新数组（不改入参）。
 *
 * 依次扫描 A~Z，跳过 taken 与本次已分配的字母；字母耗尽时退回 K1、K2… 形式。
 * 即便 key 被改写，「删除类」识别仍成立：resolveDeletionKey 会退回 label 含「删除」的分类。
 */
export function remapPresetKeys(
	categories: CategoryConfig[],
	taken: Set<string>
): CategoryConfig[] {
	const used = new Set(taken);
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

	return categories.map((category) => {
		if (!used.has(category.key)) {
			used.add(category.key);
			return { ...category };
		}

		let newKey = alphabet.find((letter) => !used.has(letter));
		if (!newKey) {
			let n = used.size + 1;
			newKey = `K${n}`;
			while (used.has(newKey)) {
				n++;
				newKey = `K${n}`;
			}
		}
		used.add(newKey);
		return { ...category, key: newKey };
	});
}
