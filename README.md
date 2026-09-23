# JEV Inbox Router

[![Release](https://img.shields.io/github/v/release/liyifan2004/obsidian-jev-inbox-router?style=flat-square)](https://github.com/liyifan2004/obsidian-jev-inbox-router/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Obsidian plugin](https://img.shields.io/badge/Obsidian-Plugin-purple?style=flat-square)](https://obsidian.md)

用 [JEV](https://typesafe.ai)（TypeSafe 的 System One 模型）判断"这条笔记属于哪一类"，然后把它送到对应的文件夹。

**它不替你写任何东西。** 没有摘要、没有扩写、没有改写正文。它只回答一个问题：

> 这个东西应该去哪？

## 它做什么

所有进入 Obsidian 的东西——随手记录、网页剪藏、微信复制、PDF 摘录、AI 对话、代码片段、产品灵感——先落在收件箱里。插件调用 JEV，让它在（可配置的）分类里单选一个：

| 分类 | 默认去向 |
|---|---|
| A 永久知识 | `大学` |
| B 产品灵感 | `腾讯-产品` |
| C 待研究 | `_附件-归档-模板/归档` |
| D 待办事项 | `要做的事` |
| E 引用资料 | `_附件-归档-模板/附件` |
| F 应该删除 | 只标记，不移动 |

分类名称、判据描述、目标文件夹全部可以在设置页里改成你自己的目录结构。

## 它怎么呈现结果

1. **状态栏**：`待办 48% → 要做的事`。建议模式下会附一个「接受」项，点一下才真的移动。点状态栏本体打开完整判断信息。
2. **笔记内判断块**：写在正文开头（或末尾），含去向、置信度、领先优势、长期价值、完整概率分布、模型与时间。只写数据，不动你的正文。
3. **frontmatter**：`jev-category` / `jev-confidence` / `jev-model` / `jev-routed-at`，可用 Dataview 聚合。

## 安全边界

- **永不删除文件。** 被判为"应该删除"的笔记只会被标记，或者按你的设置挪到一个文件夹。
- **双门槛才自动移动。** 置信度（被选中选项的概率）和领先优势（首选 ÷ 次选）必须同时达标，否则只标记不移动。
- 自动分流**默认关闭**。先手动用几次，确认判断可信再打开。
- 判断结果按内容指纹缓存，内容没变不会重复调用。

## 用法

| 操作 | 入口 |
|---|---|
| 判断当前笔记并给建议 | 命令面板：`JEV：判断当前笔记并给出去向建议` |
| 判断当前笔记并直接移动 | 命令面板：`JEV：判断当前笔记并直接移动` |
| 接受上一次建议 | 状态栏「接受」，或命令面板：`JEV：接受上一次建议并移动笔记` |
| 只看判断不移动 | 命令面板：`JEV：只判断当前笔记（不移动）` |
| 批量处理收件箱 | 左侧 ribbon 的收件箱图标，或命令面板：`JEV：扫描收件箱并批量处理` |
| 撤销上一次分流 | 命令面板：`JEV：撤销上一次分流` |
| 对某个文件单独操作 | 文件列表 / 编辑器右键菜单 → JEV 的命令 |

## 配置

1. 设置 → JEV Inbox Router → **JEV 接口**：填入 TypeSafe 的 API Key（`console.typesafe.ai/settings/keys`）。点「测试」确认连通。
2. **分类与去向**：为每个分类挑一个目标文件夹。判据描述写得越具体，判断越准。
3. **自动分流**：想开再开。

### 组织方式预设

设置页新增「组织方式」一节，内置 6 套主流知识管理理论的分类方案：极简收件箱（当前默认）、PARA、卡片盒（Zettelkasten）、GTD、约翰尼十进制、LYT/MOC。点选一套后按「应用」，可选**替换**（现有分类自动存快照，可一键还原）或**追加**（key 冲突时自动重映射），并可勾选是否预建预设的文件夹；index 目录会一并设为预设建议的收集目录。之后仍可在「分类与去向」里逐条修改。

### 建议模式（默认）

默认情况下，判断后**不动文件**：状态栏显示「建议 去哪」，旁边出现「接受」项，点一下（或用命令 `JEV：接受上一次建议并移动笔记`）才真的移动。你亲手点的接受等同人工确认，不受置信度双门槛限制——双门槛只用来拦「无人值守的自动移动」。想让插件判断达标后直接移动，打开自动分流节里的「判断后自动移动」；老用户升级后该开关会保持你原来的自动分流行为。

### index 目录

「自动分流 → index 目录（新建笔记的落点）」是 JEV 的监听与建议来源。建议把 Obsidian 的「新笔记默认位置」也设到这里（设置 → 文件与链接），新笔记一落进 index 就会被判断并给出建议去向。

## 安装（开发版）

```bash
npm install
npm run verify        # 类型检查 + 单元测试 + 构建，一条命令跑完
npm run sync          # 复制到默认 vault 的 plugins 目录
# 或指定别的库：node scripts/sync-to-vault.mjs "D:\path\to\your\vault"
```

然后在 Obsidian 的「设置 → 第三方插件」里启用 JEV Inbox Router。

## 开发与测试

| 命令 | 作用 |
|---|---|
| `npm test` | 跑单元测试（vitest，161 个用例） |
| `npm run test:watch` | 监听模式 |
| `npm run typecheck` | `tsc --noEmit`，覆盖 `src/` 与 `test/` |
| `npm run build` | esbuild 打包成 `main.js` |
| `npm run verify` | 上面三件事一起跑 |

测试不需要 Obsidian 本体：`test/mocks/obsidian.ts` 是 API 桩，`test/helpers/fake-vault.ts` 是内存版库（含 `renameFile` 与 `processFrontMatter` 的行为）。`vitest.config.mts` 把 `obsidian` 这个 import 指到桩上。

覆盖范围：判断规则与双门槛（`rules.ts`）、判断块与 frontmatter 的读写（`note-writer.ts`）、JEV 请求构造与错误重试（`jev-client.ts`）、完整分流流程 / 缓存 / 撤销 / 同名冲突（`router.ts`）、设置迁移（`settings-normalize.ts`）。`main.ts` 是纯接线层（命令注册、状态栏、事件订阅），未做单元测试。

## 配套工具

- `scripts/sync-to-vault.mjs` —— 把构建产物同步进 Obsidian 库
- `scripts/gh-push.ps1` —— 一条命令把当前分支推到 GitHub，可选自动建私有库
- `docs/github-push-from-agent.md` —— 为什么非交互环境下 `git push` 会静默失败，以及怎么绕过去

## 关于 JEV

JEV 不生成文本，只返回带概率的类型化答案（`choice` / `score` / `noul`）。插件用的是 `choice`：六个分类作为候选项，一次请求拿到完整概率分布。

- 端点：`POST https://api.typesafe.ai/v1/systemone`
- 模型：`jev-latest`
- 计费：输入 $0.042 / M tokens，输出免费

## 已知限制

- 撤销记录只保留最近 10 次，存在 `data.json` 里；内容超过 2 万字的笔记不会回滚正文改动，只回滚位置。
- 每次判断会把笔记正文（最多 6000 字）连同你自己的 frontmatter 一起发给 TypeSafe。**插件自己写的判断块和 `jev-*` 字段不会发出去**——否则下一次判断会被上一次的结论带偏。介意的话不要开启自动分流。
- 缓存指纹**只看正文**，不看 frontmatter。因此只改 frontmatter（标签、别名之类）不会触发重新判断。
- 六个选项单选的原始概率天然偏低（0.3~0.6 属正常），不要拿它跟二分类的置信度直接比。插件用的是「被选中选项的概率」和「首选 ÷ 次选」两个数，不是模型自报的 `confidence`。

## License

[MIT](LICENSE)
