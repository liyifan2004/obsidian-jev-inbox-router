# 技术参考（Technical References）

调研结论的沉淀：解决什么问题、依据什么资料、核实到什么程度、采纳与否。
证据等级：**【已证实】**（官方来源/源码可查）/【推断】/【未能核实】。
调研日期：2026-10-23。

---

## TR-01 API 版本兼容性（对应 ISS-011）

**问题**：`manifest.json` 声明 `minAppVersion: 1.5.0`，插件用到 `app.vault.process()` 等 API，需确认低版本 Obsidian 不会崩。

**依据**：官方 API 类型定义 https://github.com/obsidianmd/obsidian-api （`obsidian.d.ts`，2026-10-23 master，本地逐条查 `@since` JSDoc 标注）。**【已证实】**

| 用到的 API | @since | 用在哪 |
|---|---|---|
| `Vault.process` | 1.1.0 | router.ts 写判断块 |
| `FileManager.processFrontMatter` | 1.4.4 | router.ts 写 frontmatter |
| `Vault.createFolder` | 1.4.0 | router.ts ensureFolder |
| `FileManager.renameFile` | 0.11.0 | router.ts 移动/撤销 |
| `Menu.showAtPosition` | 1.1.0 | modals/settings-tab ⋯ 菜单 |
| `SuggestModal` | 0.9.20 | FolderPickerModal |
| `addStatusBarItem` / `addRibbonIcon` / `cachedRead` | 0.9.7 | main.ts |
| `requestUrl` | 无标注（早期 API） | jev-client.ts |

**结论**：约束项是 `processFrontMatter`（1.4.4）与 `createFolder`（1.4.0），均低于 1.5.0。**minAppVersion 1.5.0 覆盖充分，不改 manifest、不换写法。** `Vault.process` 本身只需 1.1.0，且是官方推荐的后台编辑方式（原子读改写），继续使用。

## TR-02 官方插件自检清单（对本插件的逐条对照）

**依据**：Obsidian 官方开发者文档「plugin self-critique checklist」https://docs.obsidian.md/oo/plugin **【已证实】**（内容为官方页面原文要点）。

| 官方要求 | 本插件现状 | 判定 |
|---|---|---|
| 后台编辑用 `Vault.process` 而非 `Vault.modify` | 判断块写入用 process；**撤销回写与 removeBlock 用 process；`undo()` 内容回写用 `vault.modify`** | 部分符合；undo 回写属整篇替换语义，可改 process（低优先，见 backlog 候补） |
| frontmatter 用 `FileManager.processFrontMatter`，勿手写 YAML | 已用 processFrontMatter | 符合 |
| 用户路径用 `normalizePath()` | router/modals 已用 | 符合 |
| 插件数据用 `loadData/saveData` | 已用 | 符合 |
| isDesktopOnly=false 时不得用 Node 模块 / `process.platform` / `fetch` | 未用；用 `requestUrl` | 符合 |
| 勿用全局 `app`，用 `this.app` | 已遵守 | 符合 |
| 命令名不带插件名/插件 ID | **命令名是 "JEV：…" 前缀**（i18n cmdXxx） | 待定：官方不建议带插件名，但"JEV"是品牌区分度，社区常见做法；上架评审通常不拦 |
| README 披露网络使用/账号要求 | 信息齐全（端点/计费/发送范围）但散在两节，缺《Developer policies》惯用的独立声明段 | 基本符合，见 ISS-019 补格式 |
| 提交 lockfile | package-lock.json 在库 | 符合 |
| 不默认占用快捷键 | 未设默认 hotkey | 符合 |
| `import { moment } from 'obsidian'` 而非自带 moment | i18n.ts 已 `import { moment } from "obsidian"` | 符合 |

**采纳**：①`undo()` 内容回写由 `vault.modify` 改为 `vault.process`（原子读改写，官方推荐，本轮已改）；②命令名维持现状（有品牌考量，上架风险低）。

## TR-03 同类插件对标（收件箱自动归类）

三个真实存在、方向最接近的开源插件（来源：Obsidian 插件目录页 + GitHub README 原文）。**【已证实】**（README 描述与其声明的功能一致；未逐行核对其源码）。

### 1. Auto Note Mover（farux/obsidian-auto-note-mover）
- 规则式（标签/标题正则 → 目标文件夹），非 AI。MIT，119k+ 安装，v1.2.0，约 4 年前停更（有活跃 fork mempish/obsidian-auto-note-mover 加了正则捕获组建动态文件夹）。
- **交互**：Automatic（create/edit/rename 触发）与 Manual（仅命令）两档——与本插件「直接移动 / 建议模式」的两档设计互相印证。
- **防误判**：目标文件夹不存在或同名冲突时**弹警告并中止移动**（fail-safe）；frontmatter 写 `AutoNoteMover: disable` 可单篇豁免；支持排除文件夹。
- **撤销**：无撤销机制（靠 Obsidian 自身文件历史）。
- **可借鉴**：①**单篇 frontmatter 豁免**（本插件没有，建议采纳，见 ISS-014）；②排除文件夹；③冲突时显式提示（本插件静默改名，见 ISS-015）。
- **局限**：规则需要人工维护；无概率/置信度概念，无法表达"不确定"。

### 2. Auto Classifier（HyeonseoNam/auto-classifier）
- LLM（OpenAI 兼容 / Jina）分类，但输出的是**标签**（写 tag / wikilink / frontmatter / 标题后缀），不移动文件。MIT，2025-07 仍在更新。
- **交互**：4 条命令按输入源（标题/frontmatter/正文/选区）手动触发；无自动模式。
- **可借鉴**：①「Test API call」按钮（本插件已有 F-028，与社区惯例一致）；②参考集合可配置（全部/正则过滤/手动指定候选）——本插件的分类判据即候选集合，已覆盖。
- **局限**：生成式模型做分类，输出不稳定、无概率分布；本插件用 JEV 概率模型是差异化所在。

### 3. Note Companion（原 File Organizer 2000，Nexus-JPF/note-companion）
- AI 全家桶（整理建议 + 转写 + 聊天），其中组织功能与本插件最像：**Assistant 视图（建议，用户勾选应用）** 与 **AI Inbox（扔进 Inbox 自动归位）** 两种模式；云订阅 / 自带 key / 自托管三种接入。
- **可借鉴**：①"建议模式是推荐路径、自动模式是可选项"的产品定位与本插件一致，验证了默认建议模式的合理性；②隐私分区披露（cloud / BYOK / self-hosted 各自的数据去向）——本插件 README 已披露发送范围，符合要求。
- **局限**：重（自带后端服务）；动正文（重命名/格式化），与本插件「不动内容」的边界相反。

**结论**：本插件的双模式 + 双门槛 + 判断块/概率分布 + 撤销组合在同类中没有直接对标物，差异化成立。采纳两个借鉴点：单篇豁免（ISS-014）、冲突显式提示（ISS-015）；排除文件夹暂不采纳（watchScope=index 已满足主要场景，避免配置面膨胀）。

## TR-04 上架规范要点（社区插件目录）

**依据**：官方文档原文（Obsidian Publish 站点 markdown 源）：`Plugins/Releasing/Submit your plugin`、`Community directory/Submission requirements for plugins`、`obsidianmd/obsidian-releases` README「How community plugins are pulled」。**【已证实】**

发布机制（官方原文要点）：release 的 tag 必须与 `manifest.json` 的 `version` 一致；资产须上传 `main.js` / `manifest.json` / `styles.css`；目录读取默认分支 HEAD 的 manifest；`versions.json` 用于给低版本 Obsidian 挑兼容版本。

逐条对照本插件现状：

| 官方要求 | 现状 | 判定 |
|---|---|---|
| 仓库根目录有 README.md / LICENSE / manifest.json | 均有 | ✓ |
| 描述 ≤250 字符、句号结尾、无 emoji、动作句式开头 | "Route every new note to…" ~135 字符 | ✓ |
| 插件 `id` 全局唯一且不含 "obsidian" | `jev-inbox-router` | ✓ |
| `minAppVersion` 取实际所需最低版 | 1.5.0（实际所需 1.4.4，略保守但合规） | ✓ |
| 用 Node/Electron 才允许 isDesktopOnly:true；反之 false 需无 Node 依赖 | 未用 Node API | ✓ |
| 命令 ID 不带插件 ID 前缀 | `route-current-note` 等，无前缀 | ✓ |
| 移除 sample plugin 样板代码 | 全部自研 | ✓ |
| 发布资产齐全、tag=version | 本轮未发布（0.2.0 尚未走 release 流程） | 发布时执行 |
| README 披露网络使用/账号要求 | 已披露（发往 TypeSafe、计费、内容范围）；建议按 ISS-019 聚合成独立段 | ✓（格式待优化） |

**结论**：无阻塞性差距。发布 0.2.0/0.3.0 时按 Step 1~3 走即可；唯一注意点是命令**显示名**带「JEV：」前缀（自检清单建议不带插件名），属软性建议，为中文命令面板里的可辨识度保留。

---

## TR-05 独立调研交叉核对（2026-10-23，researcher 代理 + 主线一手复核）

独立调研（证据：官方 obsidian-api 的 obsidian.d.ts @since + git 提交历史 + docs 原文）与主线 TR-01~04 结论**互不矛盾**，并补充出以下新事实（主线已对关键项一手复核）：

### 新增 API 陷阱（【已证实】主线已复核 d.ts）
| API | @since | 风险 |
|---|---|---|
| `vault.getFileByPath` / `getFolderByPath` | 1.5.7 | 若替换现行 `getAbstractFileByPath`+instanceof 写法，minAppVersion 须升 1.5.7。**不采纳**（见下） |
| `Plugin.onExternalSettingsChange` | 1.5.7 | data.json 被同步软件外部改动时的回调；要用就得升 minAppVersion 或 feature-detect。列入"下一个 breaking 版本"候选 |
| `DataAdapter.process` | 1.7.2【推断，git 历史；现行 d.ts 无 @since 标注】 | 勿在 adapter 层做原子写，用 `Vault.process`（1.1.0）即可 |
| `appendBinary` 等 | 1.7.2~1.12.3 | 未来新增 API 前先查 @since，尤其 1.5.x 之后的 |

### 移动端行为（isDesktopOnly: false 相关，【已证实】）
- **`addStatusBarItem` 官方明确 "Not available on mobile."**（d.ts 注释 + docs《Status bar》）——本插件建议模式的「状态栏一键接受」在手机上不可见，且 `src/` 无 `Platform` 分支。已转 **ISS-018**。
- `addRibbonIcon` 移动端可用（右下角菜单/快速访问），`requestUrl` 移动端可用【推断：官方无限制声明】。
- 移动端开发规范：Node/Electron API 会崩插件（本插件无此类用法 ✓）；iOS <16.4 不支持正则 lookbehind（本插件无 ✓）；官方推荐 `emulateMobile(true)` 自测。

### manifest 描述矛盾（【已证实】主线一手核实）
manifest 原文案 "It never writes content; it only decides where things should go." 与实际写判断块/frontmatter 矛盾，属上架评审误导项。已转 **ISS-017** 并当轮修正 manifest；README 两处首句措辞待下一轮润色。

### 与 sample-plugin（2026-10 现状）的工程差距
esbuild target（es2018 vs es2021）、`builtin-modules` 包 vs `node:module`、缺 eslint-plugin-obsidianmd / version-bump 脚本、tsconfig 未全 strict。均非硬伤，已转 **ISS-020** 渐进对齐。

### 对标补充（star 数为 2026-10-23 GitHub API 实测）
- **Note Companion（873★，活跃）**：置信度徽章（≥80 High / ≥60 Med）+ 悬浮理由、FileRecord 三要素撤销（原名/新路径/写入内容）+ 同名冲突拒绝、记录容量裁剪——对本插件的 undo 栈（ISS-009 容量/失败保留）与状态栏展示最有参考价值。
- **Auto Classifier（135★）**：模型自评 reliability 低于阈值拒绝写入——与本插件双门槛同思路，佐证其合理性。
- **Auto Note Mover（425★，停更 3 年）**：三重移动守卫（目标夹存在/同名冲突/同路径跳过）+ frontmatter `disable` 逃生门——守卫逻辑值得逐项核对（同名冲突已有，其余两条见 ISS-014）。
- **Janitor（135★）**：破坏性操作"可恢复优先"惯例（trash 优于 delete）——本插件用 `renameFile` 移动而非删除，无需采纳。



- `getFileByPath`/`getFolderByPath`（@since 1.5.7）比 `getAbstractFileByPath`+instanceof 更简洁，但要求 minAppVersion ≥1.5.7；当前 instanceof 写法正确且兼容更宽，**不采纳**（无收益）。
- Deferred Views 适配（官方提示 1.7.2+ 兼容性）：本插件不注册自定义视图，**不适用**。
