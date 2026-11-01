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
