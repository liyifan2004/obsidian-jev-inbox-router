# 功能账簿（Feature Ledger）

JEV Inbox Router 的长期维护依据。以**当前源码与可验证行为**为准，不是 README 摘录。

- 版本基线：`manifest.json` v0.2.0，`main` 分支，commit `bdbd26c` + 2026-10-23 维护批次（见 docs/CHANGELOG_DEV.md）。
- 证据等级：**已验证**（有单测或本次实测）／**已实现**（源码存在，无独立测试）／**待核实**（证据不足）。
- 维护规则：改代码后必须回来更新对应条目；没跑过的测试不得标"已验证"；功能 ID 稳定，拆分/合并要写明新旧映射。
- 生成日期：2026-10-23。账簿校验方式见文末「交叉核对记录」。

---

## 0. 项目概览

| 项 | 内容 |
|---|---|
| 用途 | 调用 JEV（TypeSafe System One）判断笔记归属分类，建议或自动移动到对应文件夹。**不生成内容** |
| 目标用户 | 用收件箱工作流收集碎片信息的 Obsidian 用户 |
| 兼容版本 | `minAppVersion: 1.5.0`，`isDesktopOnly: false`（**vault.process 的版本要求待核实，见 TR 记录**） |
| 技术栈 | TypeScript 5.4 / esbuild 0.28 / vitest 5 / obsidian `latest`（devDependency） |
| 入口 | `src/main.ts`（`JevInboxRouterPlugin extends Plugin`）→ esbuild 打包为 `main.js` |
| 验证命令 | `npm run verify` = typecheck + vitest + build（2026-10-23 维护批次后：197 用例全绿） |
| 持久化 | `data.json`：`{ settings, cache, undo }`（`PersistedData`，main.ts:13） |

### 模块地图

| 模块 | 职责 | 依赖 |
|---|---|---|
| `main.ts` | 插件接线：生命周期、命令、菜单、状态栏、自动分流定时器、主流程编排 | 全部 |
| `router.ts` | `InboxRouter`：单文件分流流程（判断→写块→写 frontmatter→移动）、移动/撤销/列目录 | jev-client, note-writer, rules |
| `jev-client.ts` | SystemOne HTTP 客户端：请求构造、重试、结果→`RouterDecision` 映射、内容指纹 | constants, i18n |
| `rules.ts` | 纯规则：双门槛、删除类识别、路径归一、过短判断、状态栏视图 | note-writer(pct), i18n |
| `note-writer.ts` | 判断块与 frontmatter 的生成/写入/剥离，判断输入净化 | constants, i18n |
| `settings-normalize.ts` | data.json → 完整 `JevSettings` 的补齐与迁移 | constants |
| `settings-tab.ts` | 设置页（API/组织方式/分类/自动/块/状态栏/维护 7 节） | presets, modals, main |
| `presets.ts` | 6 套组织方式预设 + key 重映射 | constants, i18n |
| `modals.ts` | 判断详情 / 分类选择 / 文件夹选择 / 二次确认弹窗 | rules, i18n |
| `i18n.ts` | zh/en 文案（按 `moment.locale()`），`t()` 插值 | — |
| `types.ts` / `constants.ts` | 共享类型 / 默认值与常量 | — |

### 核心调用链（一次分流）

```
命令/事件 → main.runRoute()
  → router.route()
      → note-writer.toJudgeInput() + hashContent()     （净化 + 指纹）
      → jev-client.classify()  （或缓存命中）
      → rules.evaluateGate() / isDeletionDecision()    （能否移动）
      → note-writer.upsertRouteBlock()                 （写判断块）
      → app.fileManager.processFrontMatter()           （写 jev-* 字段）
      → router.moveFile()                              （移动 + 同名冲突处理）
  → main.report() / reportSuggestion()                 （状态栏 + Notice + 接受/撤销项）
```

---

## 1. 核心判断与分流

### F-001 JEV 分类判断
- **用户价值**：回答"这条笔记属于哪一类"，给出带概率分布的单选结论。
- **入口**：一切分流路径的底层（命令、菜单、自动、批量）。
- **预期行为**：`classify()` 组装 `{model, state:{note_title, note_path, note_content}, questions:{category:choice, value?:score}}` POST 到 `apiUrl`；返回被选中 key、目标文件夹、概率分布（降序）、margin、模型名、token 用量。正文超 6000 字截断（保留头 70% + 尾 30%）。启用分类 <2 直接报错；返回未知 key 报错而不是静默落库。
- **实现**：`jev-client.ts:97-145, 204-264`；`RouterDecision`（types.ts:141）。
- **依赖**：`requestUrl`（Obsidian API）；端点 `https://api.typesafe.ai/v1/systemone`，模型 `jev-latest`。
- **状态**：**已验证**（test/jev-client.test.ts 26 用例：请求构造/映射/错误/截断）。
- **已知问题**：置信度取"被选中选项的概率"而非模型自报 confidence（有意设计，README 已说明）；`value` score 被 `Math.round` 夹到档位。
- **关联**：F-002、F-023、F-031。

### F-002 双门槛（置信度 + 领先优势）
- **用户价值**：拦住"无人值守的自动移动"，低把握只标记不移动。
- **入口**：设置 → 自动分流（两个滑杆）。
- **预期行为**：`confidence ≥ confidenceThreshold`（默认 0.4）且 `margin ≥ marginThreshold`（默认 1.4，margin=首选/次选，次选为 0 时视为 ∞）才允许自动移动；未过门槛写明原因进判断块与状态栏。
- **实现**：`rules.ts:19-39`（`evaluateGate`）；调用点 `router.ts:180`、`modals.ts:87`、`rules.ts:163`。
- **状态**：**已验证**（test/rules.test.ts 42 用例覆盖）。
- **已知问题**：无。
- **关联**：F-005（建议模式下门槛只标"存疑"不再拦截，人工接受等同确认——有意设计）。

### F-003 删除类识别与处置
- **用户价值**：被判"应该删除"的笔记永不真删，按设置标记/移动/忽略。
- **入口**：设置 → 自动分流 → F 类处置方式。
- **预期行为**：识别顺序：启用中的 `key === "F"` → label 含 `删除|delete`（不区分大小写）→ 无。`mark`：不移动、写原因；`ignore`：完全不动；`move`：照常移动到该分类的 folder。
- **实现**：`rules.ts:46-58`（`resolveDeletionKey`）；`router.ts:170-178`。
- **状态**：**已验证**（rules.test.ts）。
- **已知问题**：`remapPresetKeys` 改写 key 后靠 label 兜底（presets.ts:619 注释），**若用户自建删除类且 key≠F、label 不含"删除/delete"，识别失效**。
- **关联**：F-027（预设要求每套含删除类）。

### F-004 内容过短跳过
- **用户价值**：空壳/碎片不浪费 API 调用。
- **预期行为**：剥掉 frontmatter、HTML 注释和 Markdown 标记后实字 < `minChars`（默认 12）则跳过。手动命令（force）不受此限。
- **实现**：`rules.ts:84-91`；调用 `main.ts:557-563`、`main.ts:764-768`。
- **状态**：**已验证**（rules.test.ts）。
- **已知问题**：无。

### F-005 建议模式（默认）
- **用户价值**：判断后不动文件，用户点"接受"才移动；默认零风险。
- **入口**：命令「判断当前笔记并给出去向建议」；状态栏「接受」项；命令「接受上一次建议」。
- **预期行为**：`runRoute(suggest:true)` 或默认（`moveOnJudge=false`）→ 只写判断块/frontmatter/缓存，不动文件；状态栏给「建议 分类% → 目标」+「接受」项（`statusBarClearMs` 窗口内）；已在目标位置时只提示、不出接受项。
- **实现**：`main.ts:546-570`（suggestionMode 判定）、`main.ts:642-666`（reportSuggestion）、`main.ts:319-348`（acceptSuggestion）、`rules.ts:141-175`（statusViewForSuggestion）。
- **状态**：**已实现**（rules 层有单测；main 接线层无）。
- **已知问题**：①建议模式下批量扫描每篇都会写判断块（已知限制，README 有）；②`accept-last-suggestion` 在状态栏项超时消失后仍可用（有意的键盘退路）。
- **2026-10-23 变更**：建议模式的判断块现在写明「建议模式：未移动」（原只写"（未移动）"），ISS-006 已处理。
- **关联**：F-006、F-017、F-022。

### F-006 直接移动模式（moveOnJudge）
- **用户价值**：老 v0.1 行为——判断达标即移动。
- **入口**：设置 → 自动分流 → 「判断后自动移动」；命令「判断当前笔记并直接移动」。
- **预期行为**：过双门槛（或人工确认）即移动；未过门槛只标记并给原因。
- **实现**：`types.ts:63`、`router.ts:165-228`、`main.ts` 各入口。
- **状态**：**已验证**（router.test.ts 完整流程覆盖）。
- **已知问题**：无。
- **关联**：F-025（v0.1→v0.2 迁移：`moveOnJudge` 缺失时继承 `autoRouteEnabled`）。

### F-007 手动移动到任意文件夹
- **用户价值**：不依赖判断，用户自己定去向。
- **入口**：右键菜单「移动到…」；判断详情弹窗的「改去别处/换分类」。
- **预期行为**：文件夹选择器（可搜索）→ 移动 + 撤销项 + 状态栏反馈；已在目标位置给"无需移动"。
- **实现**：`main.ts:668-718`（moveFileTo）、`modals.ts:242-283`（FolderPickerModal）。
- **状态**：**已实现**。
- **已知问题**：无（原"复用旧判断导致展示错位"已于 2026-10-23 修复：仅当文件与目标一致时复用判断结果，否则用手工决策，ISS-002 已处理）。
- **关联**：F-018、F-024。

### F-008 同名冲突处理
- **预期行为**：目标位置已有同名文件时依次尝试 `名字 1.md`、`名字 2.md`…（上限 100）；源=目标时不动。
- **实现**：`router.ts:235-256`（moveFile）。
- **状态**：**已验证**（router.test.ts 含同名冲突用例）。
- **已知问题**：循环上限 100 后仍冲突时行为未定义（实际会 rename 失败报错）。

### F-009 目标文件夹自动创建
- **实现**：`router.ts:99-111`（ensureFolder 逐级建目录）。
- **状态**：**已验证**（router.test.ts）。

---

## 2. 内容写入

### F-010 判断块（笔记内）
- **用户价值**：在笔记里留下判断依据（去向、置信度、领先优势、长期价值、概率分布、模型、时间）。
- **入口**：设置 → 判断信息块（开关/位置 top|bottom/样式 callout|details|quote/是否显示概率）。
- **预期行为**：用 `<!-- jev-route:start/end -->` 注释包裹以便精确替换；重复写入只保留一块；`stripRouteBlock` 能精确还原；未移动时标注"（未移动）"+ 原因。
- **实现**：`note-writer.ts:96-178`；常量 `constants.ts:8-9`。
- **状态**：**已验证**（note-writer.test.ts 45 用例，含三种样式与还原对称性）。
- **已知问题**：用户手动删除结束标记时不乱删内容（只找不到块，保留原文——有测试）。
- **关联**：F-012、F-013。

### F-011 frontmatter 写入
- **预期行为**：写 `jev-category` / `jev-confidence` / `jev-model` / `jev-routed-at` / `jev-folder`；分类 tag **去重追加**进 `tags`，不覆盖用户标签；frontmatter 解析失败不阻塞分流。
- **实现**：`note-writer.ts:212-262`；`router.ts:201-211`（processFrontMatter + try/catch）。
- **状态**：**已验证**（note-writer.test.ts）。
- **已知问题**：undo 时靠整体回滚 `previousContent` 撤掉这些字段（>2 万字笔记除外，见 F-024）。

### F-012 判断输入净化与缓存指纹
- **用户价值**：不把上次结论发给模型（防带偏）；内容没变不重复计费。
- **预期行为**：`toJudgeInput` 剥掉判断块 + `jev-*` frontmatter 行；指纹 `toJudgeFingerprintSource` 只看正文（不含 frontmatter），所以只改标签不会重新判断。
- **实现**：`note-writer.ts:180-210`。
- **状态**：**已验证**（note-writer.test.ts）。

### F-013 移除判断块
- **入口**：判断详情弹窗 ⋯ 菜单「移除判断块」。
- **实现**：`router.ts:264-267`、`note-writer.ts:129-144`。
- **状态**：**已验证**（纯函数部分）；弹窗接线未测。

---

## 3. 用户入口

### F-014 命令面板（7 条）
| 命令 ID | 行为 | 备注 |
|---|---|---|
| `route-current-note` | 建议模式判断 | force，跳过过短检查 |
| `route-current-note-move` | 判断并直接移动 | |
| `analyze-current-note` | 只判断（dryRun），弹详情 | 不写块不缓存 |
| `scan-inbox` | 批量扫描 | 见 F-022 |
| `accept-last-suggestion` | 接受最近建议 | 有 lastSuggestion 才可用 |
| `undo-last-route` | 撤销上次分流 | |
| `show-last-decision` | 打开详情弹窗 | |
| `toggle-auto-route` | 开关自动分流 | Notice + 状态反馈 |

- **实现**：`main.ts:360-435`。**状态**：**已实现**（接线层无单测）。

### F-015 右键菜单
- 文件列表（md 文件）与编辑器右键：「给出去向建议」「只判断」「移动到…」。实现 `main.ts:437-475`。**已实现**。

### F-016 ribbon
- 收件箱图标 → `scanInbox()`。`main.ts:65`。**已实现**。

### F-017 状态栏（三类条目）
- **主项**：就绪态"JEV"；结果态"分类短名 置信% → 目标"；可聚焦、Enter/Space、点开详情弹窗；`statusBarClearMs`（默认 12s，0=常驻）后回就绪。
- **接受项**：建议模式下独立条目，同窗口期存在。
- **撤销项**：移动成功后独立条目。
- 三者均为真控件（role=button, tabindex），`onunload` 显式 detach。
- **实现**：`main.ts:182-317`；样式 `styles.css`（DESIGN.md 为准）。
- **状态**：**已实现**；视觉规范见 `DESIGN.md` / `UI-REVIEW.md`。
- **已知问题**：批量扫描结束后"接受"项属于最后一篇（ISS-008）。

### F-018 判断详情弹窗（JevDecisionModal）
- 结论行 / 置信度·门槛 / margin / 长期价值 / 门槛结论 / 模型时间 token / 全概率条形图 / 操作（CTA 移动、换分类、⋯ 重判断·移除块）。
- **实现**：`modals.ts:24-185`。**已实现**。
- **关联**：F-007（移动动作）。

### F-019 分类选择器 / 文件夹选择器 / 确认弹窗
- `CategoryPickerModal`（真按钮行 + 自动聚焦首行）、`FolderPickerModal`（原生 SuggestModal，模糊搜索，上限 200 条）、`ConfirmModal`（破坏性动作二次确认，setWarning）。
- **实现**：`modals.ts:187-326`。**已实现**；`SuggestModal.onOpen()` 必须调 super 的坑已修复并留注释（modals.ts:252）。

---

## 4. 自动化与批量

### F-020 自动分流
- **预期行为**：`create`/`modify` 事件 → 停止编辑 `autoRouteDelayMs`（默认 4s）后判断；仅收件箱范围（或全库）；同文件防抖、`busy` 防并发、`suppressUntil` 静默窗口（自写文件触发的 modify 不回环）。
- **实现**：`main.ts:477-517`。
- **状态**：**已实现**（无单测）。
- **已知问题**：静默窗口固定 5s/2.5s 启发式；批量扫描时若用户正在编辑同名文件行为未测。
- **关联**：F-021。

### F-021 自动分流前确认（autoRouteRequireConfirm）
- **预期行为**：开 → 自动触发时走 dryRun（只判断不写任何文件），弹详情弹窗，由用户在弹窗里决定移动。
- **实现**：`main.ts:505-514` + `report()` 的 dryRun 分支（main.ts:598-607）。
- **状态**：**已实现**。
- **已知问题**：dryRun 分支**忽略 quiet**——任何 dryRun 都会弹窗（自动触发即"弹窗确认"是有意的，但与批量扫描 dryRun 的组合语义要在改动时小心）；dryRun 不写缓存，同一文件反复触发会重复调用 API（ISS-007）。

### F-022 批量扫描收件箱
- **预期行为**：列收件箱（或全库）md 文件 → 逐篇 runRoute（quiet），150ms 间隔 → 汇总 Notice（建议数/移动数/跳过/失败）。
- **实现**：`main.ts:722-801`。
- **状态**：**已实现**。
- **已知问题**：建议模式下逐篇写判断块、逐篇 API 调用（长队列成本）；无中断/暂停入口；只有最后一篇的建议可一键接受（ISS-008）。

---

## 5. 状态、数据与设置

### F-023 判断结果缓存
- **预期行为**：按路径 + 正文指纹缓存 `RouterDecision`，`cacheMinutes`（默认 30）内复用；上限 300 条，按时间淘汰；移动后旧路径失效、新路径续存。
- **实现**：`main.ts:98-115`、`router.ts:136-163`。
- **状态**：**已验证**（router.test.ts 缓存用例）。
- **已知问题**：无（原"onunload 不落盘防抖窗口内的更新"已于 2026-10-23 修复，ISS-004 已处理）。

### F-024 撤销
- **预期行为**：移动成功入栈（含移动前完整内容与写完后的正文指纹 `writtenHash`，>2 万字只记位置）；撤销 = 校验指纹后回写内容 + 挪回原目录 + 失效两端缓存；**分流后被编辑过的笔记只挪回位置、不回写内容**（防覆盖用户改动）；上限 10 条。
- **实现**：`main.ts:117-129`、`router.ts` undo()（返回 `UndoOutcome`）。
- **状态**：**已验证**（router.test.ts，含"分流后再编辑→撤销不覆盖"用例）。
- **已知问题**：`undoLast` 失败时该条已被 pop，无法重试（ISS-009）；旧数据无 `writtenHash` 的条目维持无校验回写。
- **2026-10-23 变更**：内容回写增加指纹校验；只写 frontmatter 的分流也纳入内容快照（原只有写判断块时快照）。ISS-001 已处理。

### F-025 设置持久化与迁移
- **预期行为**：`normalizeSettings` 把"缺失补默认、坏值退默认"，绝不改出厂常量；v0.1→v0.2 迁移：`indexFolder` 取 `inboxFolders[0]`，`moveOnJudge` 继承 `autoRouteEnabled`。
- **实现**：`settings-normalize.ts` 全文件。
- **状态**：**已验证**（24 用例）。
- **已知问题**：数值字段只校验"有限非负"，不夹上界（如 confidenceThreshold 可被手改成 5）。
- **2026-10-23 变更**：布尔字段（autoRouteEnabled 等 7 个）增加类型校验，脏值退回默认值。ISS-003 已处理。

### F-026 分类管理
- **预期行为**：增（A~Z 自动分配 key）删（≥2 保底）改（名称/判据/短名/tag/颜色/目标文件夹/启用开关）、上下移序；上限 `MAX_CATEGORIES=12`；重置全部/只重置名称（均有二次确认）。
- **实现**：`settings-tab.ts:376-648`。**已实现**。
- **已知问题**：新增分类 key 兜底 `K${Date.now()%1000}` 理论可撞（ISS-010）。

### F-027 组织方式预设
- **预期行为**：6 套（极简/PARA/卡片盒/GTD/约翰尼十进制/LYT-MOC）；点选只高亮，「应用」+二次确认才生效；替换前自动快照 `previousCategories`（可一键还原）；追加时 `remapPresetKeys` 重映射 key 冲突、超 12 中止；可选预建文件夹；index 目录一并切换。
- **实现**：`presets.ts`、`settings-tab.ts:176-373`。
- **状态**：**已验证**（presets.test.ts 13 用例：每套含删除类、remap 等）。
- **已知问题**：预设的 inboxFolder 均为英文/中文 vault 实际路径，默认套用到别的库要手动改。

### F-028 连接测试
- 设置页「测试」按钮：用样例文本真实调用一次 classify，显示结果或错误。`settings-tab.ts:134-173`。**已实现**。
- **已知问题**：`enabled` 变量在成功分支才检查 <2 分类，实际 classify 已抛错（逻辑冗余，无害）。

### F-029 维护动作
- 清空判断缓存 / 恢复全部默认设置（含 API Key，⚠️不可撤销），均有 ConfirmModal。`settings-tab.ts:896-947`。**已实现**。
- **已知问题**：「恢复全部默认」会重置 API Key 但不清 undo 栈（语义不对称，低风险）。

### F-030 i18n
- zh/en 双语，跟随 Obsidian UI 语言（`moment.locale()`）；数据层（常量/预设）在模块加载时选快照，运行时切语言不重算。
- **实现**：`i18n.ts`（en/zh 字典 + `t()` 插值）、`constants.ts`/`presets.ts` 的 ZH/EN 双份。
- **状态**：**已验证**（i18n.test.ts：插值、快照行为）。
- **已知问题**：`t()` 运行时读 `moment.locale()`，依赖 Obsidian 注入的 moment 全局（test/mocks 提供）。

### F-031 网络错误处理与重试
- 可重试（网络异常/429/529/5xx）：最多 3 次线性退避（800ms*n）；401/403/422 立即失败；错误文案按状态码解释；响应体带 error 字段直接报错。
- **实现**：`jev-client.ts:66-202`。**已验证**（重试/错误用例）。

---

## 6. 测试覆盖映射

| 测试文件 | 用例数 | 覆盖模块 | 缺口 |
|---|---|---|---|
| rules.test.ts | 42 | rules 全部 | — |
| note-writer.test.ts | 45 | note-writer 全部 | — |
| router.test.ts | 43 | router 流程/缓存/撤销/冲突/建议模式 | — |
| jev-client.test.ts | 26 | 客户端 | — |
| settings-normalize.test.ts | 24 | 迁移/校验（含布尔脏值） | — |
| presets.test.ts | 13 | 预设/remap | — |
| i18n.test.ts | 4 | t()/快照 | — |
| **合计** | **197** | | |
| **无** | — | main.ts / modals.ts / settings-tab.ts | 纯接线/UI 层，靠手工验证（README 已声明） |

## 7. 待核实清单（不得当已验证用）

1. `vault.process()` 的最低 Obsidian 版本 vs `minAppVersion: 1.5.0`（调研中，见 docs/TECHNICAL_REFERENCES.md）。
2. 移动端状态栏/Ribbon 实际表现（`isDesktopOnly: false` 下未实测）。
3. `autoRouteRequireConfirm` 的弹窗在移动端/多窗口下的焦点行为。
4. 真实 JEV 端点的计费与限流行为（README 计费数字未在本轮核对）。
5. UI-REVIEW.md 中的实机待验项（键盘走查、触摸命中区、断点、reduced-motion、读屏）仍未实测。

## 8. 交叉核对记录

- 2026-10-23 初版：逐文件通读 src/ 12 个模块 + test/ 7 个测试文件 + README/DESIGN/UI-REVIEW 后建立；`npm run verify` 193 用例全绿作为行为基线。抽样核对：F-002/F-003 与 rules.test.ts 断言对照；F-010/F-012 与 note-writer.test.ts 对照；F-023/F-024 与 router.test.ts 对照。**main.ts 接线层行为（F-005/F-017/F-020/F-021/F-022）仅有源码证据，无自动化测试**。
- 2026-10-23 维护批次：修复 ISS-001~006 后回写本账簿（F-005/F-007/F-023/F-024/F-025 及测试映射），`npm run verify` 197 用例全绿（含新增的撤销防覆盖、建议模式原因、布尔脏值 4 用例）。README 用例数与 F 类表述已同步。
