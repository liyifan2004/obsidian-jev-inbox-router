# 优化清单（Improvement Backlog）

系统审查产出。每项含：证据（文件:行）、影响、方案、验收标准。状态：`待处理` / `已处理` / `不处理`。
优先级：P0 数据丢失/崩溃 · P1 核心缺陷/高频障碍 · P2 明确收益的改进 · P3 低风险优化。

审查日期：2026-10-23。证据等级：**确认缺陷**（有代码证据）/ **设计改进**（非 bug）/ **待核实**。

---

## ISS-001（P1，确认缺陷）撤销回写可能覆盖用户后续编辑
- **证据**：`src/router.ts:270-288`——`undo()` 直接 `vault.modify(file, entry.previousContent)`，不校验笔记自分流后是否被编辑过。
- **影响**：分流后用户又改了笔记，此时撤销会把整篇打回分流时刻的内容，**丢用户改动**。属数据丢失风险。
- **方案**：UndoEntry 增加可选 `writtenHash`（分流写完后的正文指纹，route() 末尾 `cachedRead` 计算）；undo() 先读当前内容比对，不一致则只挪回原位、不回写内容，并如实提示。旧数据无该字段时维持原行为（存量条目最多 10 条、生命周期短）。
- **验收**：新增 router 单测——分流后改内容再撤销，内容不被覆盖、文件仍回原位；原撤销用例不回归。
- **状态**：已处理（2026-10-23）

## ISS-002（P1，确认缺陷）手动移动复用旧判断结果，详情/撤销信息错位
- **证据**：`src/main.ts:668-695`——`moveFileTo` 无条件取 `this.lastResult?.result.decision` 作为本次 decision；`lastResult` 可能来自**另一文件**或更早的判断，其 `categoryKey/targetFolder` 与本次移动无关。
- **影响**：右键「移动到…」移动文件 B 后，「显示上次判断」弹窗展示文件 A 的分类与目标（与实际去向不符）；`jev` 决策语义错乱。
- **方案**：`moveFileTo` 仅当 `lastResult.file` 与当前文件同路径且 `decision.targetFolder` 与目标一致时才复用；否则构造 manual decision（已有兜底逻辑，main.ts:674-686）。
- **验收**：类型检查过；逻辑上 manual decision 的 `targetFolder` 必等于实际移动目标。
- **状态**：已处理（2026-10-23）

## ISS-003（P2，确认缺陷）设置布尔字段不校验类型
- **证据**：`src/settings-normalize.ts:77-82` 用 `{...DEFAULT_SETTINGS, ...source}` 展开；数值/枚举逐一校验，**布尔字段没有任何校验**。`types.ts` 里布尔字段有 9 个（autoRouteEnabled、moveOnJudge、lowValueEnabled、blockEnabled 等）。
- **影响**：手改 data.json（README 明示"用户可以手改"）或旧版本残留脏数据时，`"false"`/`0`/`1` 等会被当真值，**自动分流可能意外开启**。与 normalize 头注释"输入按不可信处理"的自我要求不符。
- **方案**：加 `bool(value, fallback)`，对全部布尔字段统一校验（系统化，不是只修 moveOnJudge）。
- **验收**：新增 settings-normalize 单测覆盖字符串/数字/缺失三类输入。
- **状态**：已处理（2026-10-23）

## ISS-004（P2，确认缺陷）onunload 丢弃未落盘的缓存/撤销更新
- **证据**：`src/main.ts:68-86`——`onunload` 清掉 `this.saveTimer` 但不触发 `persist()`；`scheduleSave` 防抖 800ms。
- **影响**：最后一次分流后 800ms 内退出 Obsidian → 该次缓存与撤销记录丢失，重启后无法撤销。频率低但后果是"撤销失灵"。
- **方案**：`onunload` 里清 timer 后同步触发一次 `void this.persist()`（saveData 由 Obsidian 排队）。
- **验收**：代码走查；不引入重复保存（persist 幂等）。
- **状态**：已处理（2026-10-23）

## ISS-005（P2，确认缺陷）README 与实际行为漂移
- **证据**：`README.md:96` 写"161 个用例"，实际 193（2026-10-23 verify）；`README.md:32` 写 F 类"只标记，不移动"，实际 `deletionHandling` 可配（默认 mark）。
- **影响**：文档失真，维护者误判测试规模与安全边界。
- **方案**：数字改为动态表述（"190+ 用例"或直接 193 并注明随代码更新）；F 类表述补"默认只标记，可配置为移动/忽略"。README.en.md 同步。
- **验收**：与 `npm run verify` 实际输出一致。
- **状态**：已处理（2026-10-23）

## ISS-006（P2，设计改进）建议模式的判断块不写明"未移动"的原因
- **证据**：`src/router.ts:186-198`——建议模式下 `allowMove=false` 但 `blockedReason` 为空，判断块只显示"（未移动）"。
- **影响**：日后翻到旧笔记，无法从判断块区分"建议模式未移动"与"门槛未过被拦截"。
- **方案**：`options.allowMove === false` 且无其他 blockedReason 时，置 `blockedReason = t("blockedSuggestionMode")`（i18n 新键，zh/en 两份）。
- **验收**：note-writer/router 现有用例不回归；新增断言（可放 router.test.ts）。
- **状态**：已处理（2026-10-23）

## ISS-007（P3，设计改进）dryRun 不写缓存，自动确认模式重复计费
- **证据**：`src/router.ts:160` dryRun 提前 return，跳过 `setCache`；`autoRouteRequireConfirm` 路径走 dryRun（main.ts:510-513）。
- **影响**：开启"自动分流前确认"时，同一内容每次 modify 都会重新调用 JEV。
- **方案**：dryRun 也写缓存（只缓存判断，不写文件）。需确认与"只判断"命令语义兼容（命令带 force，不受影响）。
- **验收**：router 单测：dryRun 两次，第二次 fromCache=true。
- **状态**：待处理

## ISS-008（P3，设计改进）批量扫描后只有最后一篇的建议可一键接受
- **证据**：`main.ts:722-801` 循环内每篇 `runRoute` 都覆盖 `lastSuggestion`。
- **影响**：建议模式批量扫描后，状态栏「接受」只作用于最后一篇，容易误解。
- **方案**：候选方向——扫描结束后不显示「接受」项（改为提示逐篇打开处理），或维护小型建议队列。属交互设计决策，动手前需定方案。
- **状态**：待处理

## ISS-009（P3，确认缺陷）撤销失败即丢失该条记录
- **证据**：`main.ts:805-810` 先 `pop()` 再 `router.undo()`，失败不回推。
- **影响**：文件被移走/删除导致撤销失败时，该记录不可重试。
- **方案**：失败时回推栈顶或保留为"待处理撤销"。
- **状态**：待处理

## ISS-010（P3，理论风险）新增分类 key 兜底可碰撞
- **证据**：`settings-tab.ts:397` `K${Date.now() % 1000}`；`presets.ts:625-650` 的 remap 有 while 防撞，这里没有。
- **影响**：A~Z 全占用后再新增分类，1 秒内连点两次可能同 key。
- **方案**：复用 `remapPresetKeys` 同款 while 防撞。
- **状态**：待处理

## ISS-011（P2，已核实无问题）minAppVersion 与所用 API 的版本要求
- **证据**：下载官方 `obsidian-api/obsidian.d.ts`（2026-10-23 master）查 `@since` 标注：`Vault.process`=1.1.0、`FileManager.processFrontMatter`=1.4.4、`Vault.createFolder`=1.4.0、`FileManager.renameFile`=0.11.0、`addStatusBarItem`/`addRibbonIcon`/`cachedRead`=0.9.7、`SuggestModal`=0.9.20、`Menu.showAtPosition`=1.1.0。本插件声明 `minAppVersion: 1.5.0`。
- **结论**：所用 API 全部 ≤1.4.4，minAppVersion 1.5.0 覆盖充分，**无需改 manifest，也无需换写法**。
- **状态**：已处理（核实结论，无代码改动）

## ISS-012（P3，设计改进）「恢复全部默认设置」不清 undo 栈，语义不对称
- **证据**：`settings-tab.ts:934-946` 只重置 settings；确认文案说"全部设置…回到初始状态"。
- **影响**：轻微；用户可能误以为历史记录也清了。
- **方案**：文案补一句"撤销历史保留"，或提供清空选项。
- **状态**：待处理

## ISS-013（P3，设计改进）删除类识别依赖 key=F 或 label 含"删除/delete"
- **证据**：`rules.ts:46-53`。
- **影响**：用户自建删除类（如 key="X"、label="垃圾"）时 F 类处置不生效，被判删除的笔记会照常移动。
- **方案**：设置页为「删除类」提供显式选择（一个下拉），`resolveDeletionKey` 优先读显式配置。属配置语义增强，需迁移方案。
- **状态**：待处理

## ISS-014（P3，设计改进）缺单篇豁免机制
- **证据**：对标 Auto Note Mover 的 frontmatter 单篇禁用（`AutoNoteMover: disable`），本插件无对应能力（调研见 docs/TECHNICAL_REFERENCES.md TR-03）。
- **影响**：某篇笔记不想被判断/移动（如草稿、模板）时，只能整体关自动分流或移出收件箱。
- **方案**：frontmatter 含 `jev: disable`（或 `jev-disable: true`）的笔记跳过一切分流；`toJudgeInput` 时把该字段视为插件字段一并剥掉与否需定夺。
- **状态**：待处理

## ISS-015（P3，设计改进）同名冲突静默改名
- **证据**：`router.ts` moveFile 用 `名字 1.md` 后缀自动改名，不提示用户；Auto Note Mover 同场景选择警告并中止。
- **影响**：用户可能不知道笔记被改了名，日后搜索原名找不到。
- **方案**：移动结果 basename 变化时 Notice 提示"已改名为 X 以免冲突"。
- **状态**：待处理

## ISS-016（P3，设计改进）`undo()` 内容回写已改 `vault.process`（原子写）
- **证据**：官方自检清单推荐后台编辑用 `Vault.process`（TR-02）。
- **状态**：已处理（2026-10-23，随 TR-02 采纳落地）

## ISS-017（P2，确认缺陷）manifest 描述与实际行为自相矛盾
- **证据**：manifest.json 原文案 "It never writes content; it only decides where things should go."，但插件会写判断块（jev-route:start/end）与 frontmatter（jev-category 等）；README.en.md:17 "It never writes anything for you." 同病（紧跟的限定 "No summaries, no expansion, no rewriting" 才是本意）。属上架评审高风险误导项（调研结论见 TR-05）。
- **影响**：用户/评审按字面理解会认为插件零写入，与实际不符。
- **方案**：manifest 描述改为如实表述（"…and record the decision in the note. It never generates or rewrites your content."）；README 两处首句补限定。
- **状态**：已处理（2026-10-23，manifest.json 已改；README 措辞随下一批次一并润色）

## ISS-018（P2，兼容性）移动端状态栏不可见，无降级路径提示
- **证据**：官方 obsidian.d.ts `addStatusBarItem` 注明 "Not available on mobile."（TR-05 已一手核实）；`isDesktopOnly: false` 且 `src/` 无任何 `Platform.isMobile*` 分支。建议模式的「接受」入口在手机上完全不可见。
- **影响**：移动端用户只能走命令面板/右键菜单，但插件未在文档或界面内说明，易被当成功能缺失。
- **方案**：①`Platform.isMobileApp` 时以 Notice/命令提示替代状态栏入口；②README 移动端体验说明；③`emulateMobile` 自测清单。
- **状态**：待处理

## ISS-019（P3，文档）网络使用披露缺"独立声明段"格式
- **证据**：README 的端点/计费/发送范围散在 About 与 Known limitations 两节；《Developer policies》要求 README 有明确的网络使用声明（列出远程服务、原因、发送内容）。
- **影响**：审核可能要求补充；现状信息其实齐全，只是格式不合惯例。
- **方案**：README/README.en 增加「网络使用 / Network usage」小节，把端点、发送内容、不发送内容、关闭方式汇总到一处。
- **状态**：待处理

## ISS-020（P3，工程对齐）构建/工程结构与 sample-plugin 现状有差距
- **证据**：TR-05 A4 对照（2026-10 sample-plugin）：esbuild target es2018 vs 推荐 es2018→es2021、`builtin-modules` 包 vs `node:module` builtinModules、无 eslint-plugin-obsidianmd、无 version-bump 脚本、tsconfig 非全 strict。
- **影响**：无功能影响；影响维护效率与上架评审印象。
- **方案**：渐进对齐（分多个小 PR），strict 化另开任务。
- **状态**：待处理

---

## 2026-10-23 批次的实施与验证记录

已处理 ISS-001 ~ ISS-006，改动集中在：`src/types.ts`、`src/router.ts`、`src/main.ts`、`src/settings-normalize.ts`、`src/i18n.ts`、`test/router.test.ts`、`test/settings-normalize.test.ts`、`README.md`、`README.en.md`。

| 项 | 验收依据 |
|---|---|
| ISS-001 | 新增用例「分流后又编辑过笔记时，撤销只挪回位置、不覆盖内容」通过；原「还原内容」用例不回归 |
| ISS-002 | typecheck 过；复用条件收紧为「同一文件 + 目标一致」，否则走手工决策（目标=实际去向） |
| ISS-003 | 新增 2 个用例（脏值退回默认 / 合法 false 不被顶掉）通过 |
| ISS-004 | onunload 触发一次 `persist()`（代码走查；幂等） |
| ISS-005 | README/README.en 用例数改 197、F 类表述改「默认只标记（可配置）」、撤销限制补防覆盖说明 |
| ISS-006 | 新增用例「建议模式写明未移动原因」通过（断言判断块含原因文案） |

整体验证：`npm run verify`（typecheck + vitest 197 用例 + esbuild build）全绿。**未实机在 Obsidian 中加载验证**（环境限制，见账簿「待核实清单」）。

## 本轮不做/不改（记录理由）

- **main.ts/modals/settings-tab 无单测**：纯接线与 UI 层，现有 vitest 无 jsdom 环境，引 e2e 成本高。维持 README 声明 + 手工验证，不做为凑覆盖率的低价值测试。
- **API Key 明文存 data.json**：Obsidian 插件生态惯例（无系统钥匙串 API），README 已声明。不单独造轮子。
- **判断块三样式/位置**：行为有测试且稳定，无用户反馈问题，不动。
- **发外部 API 的隐私边界**：README「已知限制」已如实披露（正文 ≤6000 字会发送）。
