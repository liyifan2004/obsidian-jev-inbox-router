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
