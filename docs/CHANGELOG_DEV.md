# 开发记录（Dev Changelog）

面向维护者/Agent 的开发日志。只记有长期价值的内容；临时调试信息不进这里。
配套文档：功能账簿 `FEATURE_LEDGER.md`、优化清单 `IMPROVEMENT_BACKLOG.md`、技术参考 `TECHNICAL_REFERENCES.md`。

---

## 2026-10-23 · 建立维护体系 + 首批修复（ISS-001~006）

**目标**：按新维护规范完成项目摸底、功能账簿、技术调研、系统审查，并实施第一批高价值低风险修复。

**完成内容**：
1. 建立 `docs/FEATURE_LEDGER.md`（F-001~F-031，覆盖全部用户可见行为与内部机制，含测试映射与待核实清单）。
2. 建立 `docs/IMPROVEMENT_BACKLOG.md`（ISS-001~013，P1×2 / P2×5 / P3×6，另记录"本轮不做"及理由）。
3. 修复 6 项（详见 backlog 末尾验证表）：
   - **ISS-001**（P1）撤销防覆盖：`UndoEntry` 增加 `writtenHash`，undo 先校验再回写内容；被改过的笔记只挪回位置。
   - **ISS-002**（P1）`moveFileTo` 判断结果复用收紧为「同文件 + 同目标」，否则手工决策。
   - **ISS-003**（P2）`normalizeSettings` 补齐 7 个布尔字段的类型校验。
   - **ISS-004**（P2）`onunload` 落盘防抖窗口内的缓存/撤销更新。
   - **ISS-005**（P2）README/README.en 与实际行为同步（用例数、F 类处置、撤销语义）。
   - **ISS-006**（P2）建议模式判断块写明未移动原因（i18n 新键 `blockedSuggestionMode`、`noticeUndoneKeptEdits`）。

**关键决策**：
- **撤销采用指纹校验而非放弃内容回写**：直接改成"只移位置"会破坏既有产品行为（README 承诺还原内容）；指纹不一致才跳过回写，兼顾两者。旧数据无 `writtenHash` 时维持原行为（存量 ≤10 条、生命周期短），不做迁移。
- **`router.undo` 返回值从 `boolean` 改为 `UndoOutcome {ok, content}`**：调用方需要区分"内容已还原/被跳过/本无快照"以给出如实提示，布尔表达不了。测试断言随之更新（行为断言不变）。
- **建议模式的未移动原因优先级**：删除类处置 > 门槛未过 > 建议模式，与"最能解释现状的原因优先"一致。

**测试**：`npm run verify` 全绿；193 → 197 用例（新增：撤销防覆盖、撤销返回值、建议模式原因、布尔脏值×2；改写：undo 返回值断言 2 处）。

**未解决/风险**：
- 全部改动未在真实 Obsidian 中加载验证（无 GUI 环境）。
- ISS-007~013 待后续批次；ISS-011（minAppVersion vs `vault.process`）待调研结论。

**文档同步**：FEATURE_LEDGER（F-005/F-007/F-023/F-024/F-025 + 测试映射 + 交叉核对记录）、IMPROVEMENT_BACKLOG（状态与验证表）、README×2。

## 2026-10-23 补充（调研合并批次）
- 合并独立调研结论入 TECHNICAL_REFERENCES.md TR-05（API 陷阱 / 移动端 / sample-plugin 工程差距 / 对标补充），关键项已一手复核官方 d.ts。
- 修正 manifest.json 描述矛盾（ISS-017）：原 "It never writes content…" 与实际写判断块/frontmatter 不符，改为如实表述（不生成/改写内容，但会记录判断）。
- 修订 TR-04 网络披露评价（信息齐全但缺独立声明段，ISS-019）。
- 新增 ISS-017~020 至优化清单。

## 2026-11-02 · 收尾未完成批次（ISS-007 / ISS-009 / ISS-018①）

**背景**：工作区里存在一批 2026-10-23 未提交的半成品改动（`src/main.ts`、`src/router.ts`）。接手时状态是：typecheck 失败（`noticeUndoRetry` 键不存在）、1 个测试失败（dryRun 缓存断言与实现相反）、移动端降级只有一个没人调用的 getter。本轮把这批改动补完并跑通。

**完成内容**：
1. **ISS-007**（dryRun 写缓存）：`router.route` 在 `dryRun` 提前 return **之前**写判断缓存。dryRun 不写任何文件内容，正文指纹依然有效，缓存可安全复用。"只判断"命令带 `force`，会跳过缓存读取，行为不变。
2. **ISS-009**（撤销失败可重试）：`UndoOutcome` 增加 `reason` 字段（`missing` / `conflict` / `error`）。
   - `missing`：文件已不存在，记录无法再用 → 丢弃并明说。
   - `conflict`：原位置被同名文件占用 → **在任何写操作之前预检并整体不动**，记录保留可重试。
   - `error`：移动/回写抛错 → 记录保留可重试。
   保留记录时重新挂出撤销入口（原来无论成败都收起，用户只能去翻命令面板）。
3. **ISS-018①**（移动端降级）：`Platform.isMobileApp` 时不创建状态栏项，接受/撤销降级为**带按钮的常驻 Notice**（`new Notice(DocumentFragment)` + `mod-cta` 按钮）。只用 minAppVersion 1.5.0 就有的 API：不用 `messageEl`（1.8.7+）、不用 Obsidian 的 `createFragment` 全局函数，用标准 `document.createDocumentFragment`。

**关键决策**：
- **冲突预检放在写操作之前**：撤销失败时"什么都没发生"比"内容回写了但位置没挪回去"安全得多。回写内容在前、挪位置在后，若挪失败会出现半还原状态；预检把这种情况挡在门外。
- **移动端用标准 DOM 而不是 Obsidian 的 `createFragment`**：`createFragment` 在 obsidian 1.5.7 的 d.ts 里已存在但属于全局声明，实际运行时是否可用未验证；标准 `document.createDocumentFragment` 在任何 Electron 版本都成立，零风险。`new Notice(fragment, ms)` 自 0.9.7 起就接受 DocumentFragment（已在 d.ts 确认）。
- **撤销失败不统一弹"撤销失败"**：分成"文件没了（没救了）"和"暂时不行（能重试）"两种文案，后者给出具体原因（冲突/错误）。

**测试**：`npm run verify` 全绿；197 → 199 用例（新增：dryRun 两次命中缓存、原位置被占返回 conflict；改写：dryRun 缓存断言、"文件不存在"用例补 reason 断言）。

**未解决/风险**：
- 全部改动**未在真实 Obsidian 中加载验证**（无 GUI 环境）。移动端降级路径尤其需要真机确认（模拟器或真机 Obsidian）。
- `src/main.ts` 是接线层，vitest 无 jsdom 环境，接受/撤销的移动端分支**无自动化测试**。
- ISS-018 的 README 移动端说明与自测清单仍未补；ISS-019/020 未动。

### 补充修正（同日第二轮）：自定义块画进了已脱离 DOM 的容器

**缺陷**：`src/settings-definitions.ts` 的自定义块（分类卡片列表 / 预设列表）
在两条渲染路径里都调用了 `setting.settingEl.empty()`。

但 Obsidian 的 `Setting` 结构是 **`settingEl > (infoEl, controlEl)`** ——
`empty()` 整个 `settingEl` 会把 `controlEl` **一起清掉**（它已被移出 DOM）。
之后往 `controlEl` 里画的内容**不会出现在页面上**：
分类卡片列表与预设列表在真实 Obsidian 里会是空白。

**为什么测试没抓到**：`test/mocks/obsidian.ts` 的 `Setting` 桩里
`settingEl` / `controlEl` / `infoEl` 是三个**互相独立**的对象 ——
`empty()` 不会影响另外两个。这种 mock 查不出「容器已脱离」的错误。

**修法**：
1. 改成 `setting.infoEl.empty()` —— 只去掉默认的名称/描述，
   `controlEl` 仍是活的容器；并把 `jev-custom-block` 类加在 `controlEl` 上。
2. **让 mock 模拟真实的父子关系**：`makeStubElement()` 跟踪子节点，
   `empty()` 把子节点标记为 `__detached`；`Setting` 构造时把
   `infoEl` / `controlEl` 注册为 `settingEl` 的子节点。
3. 新增用例「自定义块的内容画进的是还活着的容器」。

**反证**：把实现改回 `setting.settingEl.empty()` → 新用例当场失败；
恢复后 14/14 通过。

**教训**：**mock 必须模拟真实的对象关系**，不只是「方法齐全」。
每个属性都是独立对象时，「A 被清空导致 B 失效」这类缺陷天然查不出来。

**测试**：`npm run verify` 全绿；228 → 229 用例。

---

## 2026-11-05 · 商店审查自查接入 + 设置页双轨重构（ISS-026~032）

**背景**：本插件已在 Obsidian 社区商店列表里。上一轮（MSE 1.0.42）发现商店审查用的规则集是**公开且可本地运行**的 —— `eslint-plugin-obsidianmd`（TS 源码）+ `stylelint-config-obsidianmd`（CSS）。本轮把 eslint 那一半接进来，并按它的规则改代码。

**完成内容**：

1. **接入 eslint（ISS-019）**：`eslint.config.mjs` 已存在但**从未接进 verify 或 CI** —— 配置写了、规则装了，就是没人跑。新增 `npm run lint` 并接进 `verify` 与 `ci.yml`。
   首次运行暴露 **25 个 error**：其中 8 个是 `settings-tab/no-manual-html-headings`（商店审查同类项，error 级）、1 个 `settings-tab/prefer-setting-definitions`（商店审查列为 Warning）、其余是 TS 严格性问题。
2. **设置页双轨重构（ISS-020）**：实现 `getSettingDefinitions()`，把 `display()` 降为 1.13 以下（minAppVersion 1.5.0）的 fallback。
   - 新增 `src/settings-definitions.ts`：定义 **RowSink** 抽象 —— 设置页每一节都写成「往 sink 里加行」，声明式 sink 收集成定义数组、命令式 sink 画成 DOM。**两条路径跑的是同一批节实现**，结构上不可能漂移。
   - 分组标题从 `createEl("h2"/"h3")` 改为 `setHeading()`，并**去掉重复插件名的标题**（`"JEV Inbox Router"` → 各节功能名）—— 前者违反官方规则，后者是 MSE 1.0.42 被下架的直接原因。
   - 刷新路径分流：1.13+ 用 `update()`（声明式树由框架持有，重调 `display()` 无效），旧版重跑命令式渲染。
3. **消除 19 个 deprecated 警告**：核心是 `display()` 在 1.13+ 的类型定义里标了 `@deprecated`，而官方 eslint 禁止用屏蔽注释压掉它（`eslint-comments/no-restricted-disable`）。
   解法与同 fleet 的 obsidian-folio 一致：**把命令式渲染体抽到私有方法 `renderImperative()`，`display()` 只做转发**，于是 `this.display()` 的调用点全部消失。
   另：删掉 3 处 `setDynamicTooltip()`（该 API 已无实际作用）；`setWarning()` 按版本分流（1.13+ 用 `setDestructive()`，旧版用索引访问调用旧 API）。
4. **其余 14 个 error 逐项清理**：`JSON.parse(JSON.stringify(x))` → 类型安全的 `deepCopy()`（顺带解决 `no-unsafe-assignment` 与 JSON 往返丢 `undefined` 的问题）；`super.onOpen()` → `await super.onOpen()`（基类签名是 `Promise<void> | void`）；DOM 事件监听器里的 async 回调 → `void` 显式标注；移除 `builtin-modules` 依赖（改用 Node 内置的 `node:module` 的 `builtinModules`）。
5. **新增双轨一致性测试（13 例）**：`test/settings-tab.test.ts` 断言两条路径产出的**行名集合**、**分组标题集合**、**每行挂载的控件类型**三者一致。
   配套增强了 `test/mocks/obsidian.ts` 的 `Setting` 桩（记录名字与控件）与 `PluginSettingTab` 桩（`update()` / `getSettingDefinitions()` / `requireApiVersion()`）。

**关键决策**：
- **用 sink 收敛而不是写两份实现**：obsidian-folio 与 obsidian-media-speed-enhancer 是「声明式定义 + 命令式渲染」两份实现，加设置要改两处。本插件用 RowSink 把两者收敛到一处，从结构上消除漂移。
- **block（自定义块）也要占一行 Setting**：最初命令式路径直接往容器画、声明式路径产出一行，两边行数不同 → 「两条路径等价」这个不变量没法被断言守住。改为两边都产出一行。
- **`deepCopy` 替代 JSON 往返**：`JSON.parse` 返回 `any`，是 5 个 `no-unsafe-assignment` 的来源；且 JSON 往返会**丢掉值为 `undefined` 的键**。手写递归拷贝既类型安全也更快。
- **`builtin-modules` → `node:module` 的 `builtinModules`**：官方 API、覆盖更全（68 vs 41 个模块）、少一个依赖。行为一致（都不带 `node:` 前缀）。
- **不屏蔽任何规则**：`eslint-comments/no-restricted-disable` 禁用屏蔽注释，所以每条 deprecated 告警都必须**真的消除**，不能用注释压掉。

**反证（3 次，全部成功）**：
- 删掉命令式路径的一整节 → 3 个测试失败
- 让某一行不挂控件 → 「每个设置项都真的挂上了控件」用例失败（这条断言是补加的：双轨一致只能抓「两条路径不同」，抓不住「两条路径一致地错」）
- 让 `render` 回调返回 Setting 对象 → 1 个测试失败（对应真实事故：Obsidian 1.13 会把 render 的返回值当清理函数调用 → `TypeError: t is not a function` → 设置子页面永远打不开）

**测试**：`npm run verify` 全绿（typecheck + lint 0 问题 + stylelint + vitest + build）；215 → 228 用例。

**未解决/风险**：
- **全部改动未在真实 Obsidian 中加载验证**（本环境无 GUI）。双轨在 1.13+ 与 1.5.0–1.12 两个版本上的实际渲染效果需要实机确认。
- 声明式路径下自定义块（分类卡片列表、预设列表）的**实际布局**未验证 —— 1.13+ 的 group 渲染由 Obsidian 负责，与命令式路径的 `jev-cat-list` 等 CSS 类的匹配情况未知。
- 商店审查的其余 Warning 项（UI 用 Sentence case、不用 innerHTML、不设默认快捷键）未逐条自查。

## 2026-11-06 · README 精简重写（商店可读性）

**背景**：插件已在 Obsidian 社区商店上架。商店页面直接渲染 README，
README 就是用户搜索到插件后看到的**第一份说明** —— 它太长了。

同时发现两个问题：
1. README 里的插件图标（`assets/icon.png`，`width="96"`）在商店里变得巨大。
2. README 篇幅远超优秀社区插件，用户要点 "Show more" 才能看全。

**调研结论**（实测 14 个高质量社区插件的 README）：
- **87% 的优秀插件不放插件图标**。商店网页头部用的是**通用 lucide 图标**，
  **不读**仓库里的 `icon.png`；Obsidian 应用内插件列表的图标来自 `manifest.json`
  的 `icon` 字段，与 README 无关。→ **README 里放图标没有任何功能价值**，
  只有「撑满一行」的代价。
- 商店 CSS 有 `img,video{max-width:100%;height:auto}`，图片不会溢出，
  但**没写 width 的图会撑满容器宽度**。
- 商店 README 越长，首屏可见内容越少（实测 Tasks 只露 608 字符）。
- **15 个插件里 0 个有目录（TOC）**。
- 设置项说明、原理说明普遍**链到 docs**，README 里只列功能名 + 链接。
- License 普遍**一行链接**，从不贴全文。
- 语言切换行放在 H1 之后，当前语言加粗。

**改动**：

| 行数 | 改动前 | 改动后 |
|---|---|---|
| `README.md` | 129 行 / 8070 字节 | 40 行 |
| `README.en.md` | 131 行 / 8744 字节 | 40 行 |

1. **去掉插件图标**（5 个仓库全部）。徽章保留（shields.io 本身就是小图）。
2. **新建 `docs/user-guide.md`**（中文）/ `docs/user-guide.en.md`（英文）：
   把原本 README 里的完整内容搬过去 —— 设置项表、技术原理、开发说明、
   已知限制，一条不丢。
3. **README 重写**，结构统一为：
   H1 → 语言切换 → 一句话副标题 → 徽章 → 演示图 → 功能（每条链到 user-guide 对应小节）
   → 安装 → 文档 → 许可证。**4–8 个 H2**，不放 TOC。
4. **保留在 README 里的例外**（不能链走的内容）：

- **隐私说明**（正文会发给 TypeSafe）—— 数据去向必须让用户看到，不能藏进 docs。

5. **顺带修掉的问题**：无。

**验证**：
- 所有 README 内部链接与锚点用 GitHub 锚点算法**逐条校验，0 无效**。
- 所有 README 与 user-guide 的**编码完整**（0 个 U+FFFD 替换字符）。
- 各仓库 `npm run verify` 全绿（typecheck + lint 0 问题 + stylelint + vitest + build）。

**未解决/风险**：
- **未在真实 Obsidian 商店页面确认渲染效果**（本环境无 GUI，商店页面是客户端渲染，
  WebFetch 拿不到内容）。图标已移除，理论上不会再有「巨大图标」问题。
- 商店页面 README 的折叠阈值具体数值未测（调研只测到了字符数，未换算成行数）。
