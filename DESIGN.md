# DESIGN.md · JEV Inbox Router 界面设计契约

**项目**：JEV Inbox Router（Obsidian 插件，v0.1.0）
**使用者**：把一切先丢进收件箱、之后统一归档的个人知识管理者；主线是「判断 → 去哪」，不是「写什么」
**主要任务**：让用户在 3 秒内看懂一条笔记被判成哪一类、去了哪里、为什么（没）移动，并随时改判或撤销
**交付面**：状态栏项、判断弹窗、分类／文件夹选择器、设置页分类卡、笔记内判断块
**范围**：仅界面层。不改动判断逻辑、双门槛、缓存与撤销语义
**已提供的证据**：`styles.css`、`src/modals.ts`、`src/settings-tab.ts`、`src/main.ts`、`src/note-writer.ts`、`src/constants.ts`；脚本实算的 WCAG 对比度；`design-preview.html`（近似主题的静态对照）
**关键假设**：Obsidian 默认主题变量在各主题里语义稳定；插件的默认分类色由用户可改（因此规则必须对任意色值成立，而不是只对默认 6 色成立）；`minAppVersion 1.5.0`（Electron 25 / Chromium 114）支持 `color-mix()`

> 本文件是「目标契约」，不是「现状描述」。现状与差距见 `UI-REVIEW.md`。

## 1. 视觉主题

极简、原生、静默。这个插件替用户做决定，界面不该再抢戏。

- **密度**：紧凑但不断行。信息按「一屏一个主角 + 一行键值 + 一行弱化尾注」组织，不用卡片堆叠制造层级。
- **视觉性格**：完全寄生在 Obsidian 主题之上。插件不自带背景层、不自带字体、不自带阴影；唯一属于自己的视觉资产是**分类色**，且只用于标识。
- **与既有资产的关系**：沿用 Obsidian 内置 Lucide 图标（`inbox`、`search`、`folder-input`、`chevron-right`、`check`、`more-horizontal`）；不使用 emoji 或自绘图标。
- **层级手段排序**：字号 → 字重 → 间距 → 发丝线 →（仅最后）色块。**任何情况下不靠背景色块区分信息层级**。
- **参考判断**（与规则分开记录）：生产力／开发工具类界面的共同点是「安静外壳 + 高密度内容 + 单一强调色」。本项目取「安静外壳」和「单一强调色」，但不采用其信息卡片化布局，因为本插件每次只需要讲清一件事。

**五条不可协商的视觉原则**

1. 所有表面继承主题变量；插件不发明背景、不发明字体、不发明阴影。
2. 层级只用字号、字重、间距、发丝线建立；色块最多用一次（且优先不用）。
3. 分类色只做标识：≥8px 的圆点，或被选中项的唯一一根进度条。**永不进入文字层**。
4. 凡是能点的，就是真控件：可聚焦、44px 命中区、有 hover / focus-visible / disabled 状态。
5. 默认静默：一屏只呈现一个结论，细节按需展开或收进「⋯」。

## 2. 色彩

### 角色表

| 角色 | 变量 | 暗色 | 亮色 | 用途 |
|---|---|---|---|---|
| 画布 | `--background-primary` | `#1e1e1e` | `#ffffff` | 弹窗体、设置卡内部 |
| 次级面 | `--background-primary-alt` | `#1a1a1a` | `#fafafa` | 输入框、次级按钮底 |
| 状态栏底 | `--background-secondary` | `#161616` | `#f2f6f9` | 仅状态栏容器 |
| 悬停面 | `--background-modifier-hover` | `rgba(255,255,255,.067)` | `rgba(0,0,0,.05)` | 行悬停、图标按钮 |
| 发丝线 | `--background-modifier-border` | `#333` | `#e0e0e0` | 唯一的分隔手段 |
| 主文字 | `--text-normal` | `#dcddde` | `#2e3338` | 分类名、数值、主操作 |
| 次文字 | `--text-muted` | `#b3b3b3` | `#5c5c5c` | 标签、路径、尾注 |
| 弱文字 | `--text-faint` | `#666` | `#9a9a9a` | **仅装饰**，不得承载信息 |
| 主操作 | `--interactive-accent` | `#7f6df2` | `#6c56c4` | 唯一 CTA、聚焦环 |
| 分类标识 | `--jev-cat` | 用户设定 | 用户设定 | 由 JS 内联到元素，见下 |
| 分类折算色 | `--jev-ink` | 折算 85% | 折算 55% | 圆点、选中条 |

### 分类色的主题折算（核心规则）

任意用户设置的分类色都必须能安全显示在两种主题上，因此不直接使用原色，而是按主题向正文色折算：

```css
:root        { --jev-cat-mix: 55%; }   /* 亮色：向深色文字折算 */
body.theme-dark { --jev-cat-mix: 85%; }   /* 暗色：轻微提亮 */

.jev-ink {
	background: color-mix(in srgb, var(--jev-cat) var(--jev-cat-mix), var(--text-normal));
}
/* 不支持 color-mix 时退回原色（Obsidian 1.5+ 不需要，但保留降级） */
@supports not (background: color-mix(in srgb, red 50%, blue)) {
	.jev-ink { background: var(--jev-cat); }
}
```

实算结果（默认 6 色）：

| 分类 | 原色 | 亮色折算后 | 亮色对比 | 暗色折算后 | 暗色对比 |
|---|---|---|---|---|---|
| A 永久知识 | `#4C8DFF` | `#3e65a5` | 5.82:1 | `#6299fa` | 5.92:1 |
| B 产品灵感 | `#FF8A3D` | `#a1633b` | 4.81:1 | `#fa9655` | 7.59:1 |
| C 待研究 | `#9B8CFF` | `#6a64a5` | 5.28:1 | `#a598fa` | 6.73:1 |
| D 待办事项 | `#FFC53D` | `#a1833b` | 3.61:1 | `#fac955` | 10.76:1 |
| E 引用资料 | `#3DC9B0` | `#36867a` | 4.33:1 | `#55ccb7` | 8.50:1 |
| F 应该删除 | `#FF5C5C` | `#a14a4c` | 5.83:1 | `#fa6f70` | 6.01:1 |

**对比度已实测**：折算后全部 ≥3:1（图形位要求），其中 5 色 ≥4.33:1。D 在亮色下为 3.61:1，因此 D 折算色**只允许用于图形（圆点／进度条），仍不允许作为文字**。原色作为文字在亮色下为 1.58~3.20:1，全部不合格——这是 P0-1 的根因。

**非颜色线索**：分类永远同时以「圆点 + 分类名文字 + 位置（第一条 = 选中）」呈现；选中行额外加字重 600。颜色只做第三层冗余。

## 3. 字体

- **字族**：全部继承 Obsidian——正文 `--font-interface`，路径／标识／数值 `--font-monospace`。不引入任何 Web 字体，无授权依赖。
- **语言**：`zh-CN` 为主，中英混排。数字（置信度、倍数、token）统一 `font-variant-numeric: tabular-nums`。
- **字距**：一律 `0`，不使用负字距。
- **角色表**：

| 角色 | 字号 | 字重 | 行高 | 颜色 |
|---|---|---|---|---|
| 弹窗标题 | `--font-ui-medium` (15px) | 600 | 1.35 | `--text-normal` |
| 结论（分类名） | `--font-ui-medium` | 600 | 1.3 | `--text-normal` |
| 正文 / 行标签 | `--font-ui-small` (13px) | 400 | 1.5 | `--text-normal` |
| 辅助 / 键值标签 | `--font-ui-smaller` (11px) | 400 | 1.45 | `--text-muted` |
| 数据（路径、倍数、token） | `--font-ui-smaller` | 400 | 1.45 | `--text-muted` + mono + tabular |
| 微注 | 10px（`0.9em`） | 400 | 1.4 | `--text-muted` |

- **换行与截断**：分类名不超过 8 个汉字（`CategoryConfig.label` 约束）；目标文件夹路径允许单行 `ellipsis` + `title` 全文；判据描述限 3 行可见 + 滚动。概率行的标签列用 `max-content` 而非固定 px，字号放大后自然变宽，不截断关键信息。
- **中文排版**：长文本（判据描述、设置说明）行高 1.55~1.7，行长 ≤40 汉字；不使用两端对齐。

## 4. 组件样式

### 4.1 状态栏项

```css
.jev-status {
	display: inline-flex; align-items: center; gap: 6px;
	min-height: 22px; padding: 2px 6px; margin: -2px -6px;
	border-radius: var(--radius-s);
	cursor: pointer; color: var(--text-muted);
	font-variant-numeric: tabular-nums;
}
.jev-status:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.jev-status:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 1px; }
.jev-status.is-idle { color: var(--text-muted); }   /* 就绪：只显示「JEV」 */
.jev-status.is-ok  { color: var(--text-normal); }
.jev-status.is-warn { color: var(--text-warning); }
.jev-status.is-error { color: var(--text-error); }
.jev-status .jev-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.jev-status .jev-hint { opacity: 0; transition: opacity 120ms ease; color: var(--text-muted); }
.jev-status:hover .jev-hint { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .jev-status .jev-hint { transition: none; } }
@media (prefers-reduced-motion: no-preference) {
	.jev-status.is-busy .jev-dot { animation: jev-pulse 1.4s ease-in-out infinite; }
}
@keyframes jev-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
```

要点：文案不再常驻 `JEV ·` 前缀；就绪态只留「JEV」，结果态只留「待办 48%」；hover 才出现「查看判断详情」；`role="button"` + `tabindex="0"` + Enter/Space 由 TS 提供。

### 4.2 判断弹窗

顺序：标题 → **结论行** → 键值行 → 尾注 → 概率分布 → 操作行。固定使用 `titleEl`，内容区不再重复 `h2`。

```css
.jev-conclusion {
	display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
	padding-bottom: 14px; border-bottom: 1px solid var(--background-modifier-border);
}
.jev-conclusion .jev-cat-name { font-size: var(--font-ui-medium); font-weight: 600; }
.jev-conclusion .jev-target { color: var(--text-muted); }
.jev-conclusion .jev-target .jev-path { color: var(--text-normal); }

.jev-meta-line {
	display: flex; flex-wrap: wrap; gap: 4px 18px;
	padding: 12px 0; border-bottom: 1px solid var(--background-modifier-border);
	font-size: var(--font-ui-small);
}
.jev-meta-line .jev-kv { display: flex; gap: 6px; align-items: baseline; }
.jev-meta-line .jev-kv > dt { color: var(--text-muted); font-size: var(--font-ui-smaller); margin: 0; }
.jev-meta-line .jev-kv > dd { margin: 0; font-variant-numeric: tabular-nums; }
.jev-foot { padding: 10px 0 16px; font-size: var(--font-ui-smaller); color: var(--text-muted); }

.jev-prob-row {
	display: grid; grid-template-columns: 16px max-content minmax(60px, 1fr) 42px;
	align-items: center; gap: 10px; min-height: 26px;
	font-size: var(--font-ui-smaller);
}
.jev-prob-track { height: 6px; border-radius: 3px; background: var(--background-modifier-border); overflow: hidden; }
.jev-prob-fill  { height: 100%; border-radius: 3px; background: var(--text-faint); transition: width 200ms ease; }
.jev-prob-row.is-chosen .jev-prob-fill { background: color-mix(in srgb, var(--jev-cat) var(--jev-cat-mix), var(--text-normal)); }
.jev-prob-row.is-chosen .jev-prob-label,
.jev-prob-row.is-chosen .jev-prob-val { color: var(--text-normal); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .jev-prob-fill { transition: none; } }
```

| 元素 | 尺寸 | 状态 |
|---|---|---|
| 结论圆点 | 9×9px，圆 | 单色，无描边 |
| 概率行 | 26px 高，行间距 2px | 默认 / 选中（颜色 + 字重 + 首位） |
| 选中条 | 6px 高，圆角 3px | 唯一使用分类色的图形 |
| CTA | 高 30px，`--interactive-accent` 实底 | 唯一主操作，文案点名对象 |
| 次级按钮 | 高 30px，描边 | 一个：`换个去向…` |
| `⋯` 图标按钮 | 30×30px（移动端 44×44px 命中区） | 收纳 `重新判断` / `移除判断信息块` |

### 4.3 选择器

首选 Obsidian 原生 `SuggestModal`（键盘导航、模糊搜索、44px 行高、主题样式全部免费）。自绘时的下限：

```css
.jev-row {
	display: flex; align-items: center; gap: 10px;
	min-height: 44px; padding: 6px 12px;
	cursor: pointer; border-bottom: 1px solid var(--background-modifier-border);
}
.jev-row:last-child { border-bottom: none; }
.jev-row:hover { background: var(--background-modifier-hover); }
.jev-row:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
.jev-row .jev-path { color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jev-row .jev-mark { margin-left: auto; color: var(--text-muted); display: flex; gap: 6px; align-items: center; }
.jev-empty { padding: 22px 12px; text-align: center; color: var(--text-muted); font-size: var(--font-ui-small); }
```

搜索框必须带 `.text-input` 类（`.jev-search` 仅补充 `width:100%`），聚焦用 `.search:focus-within` 或 Modal 生命周期，不用 `setTimeout(focus, 50)`。

### 4.4 设置页分类卡

```css
.jev-cat-head {
	display: flex; align-items: center; gap: 10px; width: 100%;
	min-height: 44px; padding: 6px 10px;
	background: none; border: 0; font: inherit; text-align: left; cursor: pointer;
}
.jev-cat-head:hover { background: var(--background-modifier-hover); }
.jev-cat-head:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
.jev-chev { display: inline-flex; color: var(--text-muted); transition: transform 150ms ease; }
.jev-chev.is-open { transform: rotate(90deg); }
.jev-cat-card.is-disabled .jev-cat-label { color: var(--text-muted); }   /* 不再用 opacity */
```

| 组件 | 规格 |
|---|---|
| 分类卡 | 圆角 `--radius-s`，边框 1px `--background-modifier-border`，不自带底色 |
| 卡头 | 整行 `<button>` + `aria-expanded`；chevron 16px，150ms 旋转 |
| 启用开关 | Obsidian `addToggle`（`.checkbox-container`），带 `aria-label="启用 A 永久知识"` |
| 分类名输入 | `.text-input`，宽 `flex: 0 1 180px`，`aria-label` |
| 设置项 | `padding: 12px 0` + 发丝线分隔；标签列 `1fr`，控件列 240px |
| 破坏性动作 | 收进节末 `⋯` 菜单，点击后 `Modal` 二次确认 |

## 5. 布局

- **弹窗**：宽度默认（Obsidian `--modal-*`），内容单列，内边距 18px；不做双列，不做卡片网格。
- **内容顺序**（不可调换）：结论 → 依据（键值）→ 明细（概率分布）→ 操作。用户先看「去哪」，再看「为什么」。
- **间距刻度**：`4 / 8 / 12 / 16 / 24`。关系必须成立：元素内 < 同组项 < 组间 < 区段。本项目中：圆点与分类名 8px；键值项之间 18px；区块之间 14~16px（配发丝线）；弹窗内边距 18px。
- **设置页**：依次为 接口 → 分类与去向 → 自动分流 → 笔记内判断信息 → 状态栏 → 缓存与重置，顺序保持（已有的心智模型不动）。说明文字 `max-width: 46em`。
- **长内容**：文件夹路径单行省略 + `title`；判据描述 3 行文本域；概率分布固定 6~12 行，不设滚动容器（弹窗自身滚动）。
- **空态**：选择器无匹配 → 「没有匹配的文件夹」；无启用分类 → 「没有启用中的分类，请先在设置里启用」；无判断结果 → 「这个会话里还没有产生过判断结果」。

## 6. 深度与层级

只有两级，且不依赖阴影：

1. **发丝线**（1px `--background-modifier-border`）：分隔区块、行、设置项。
2. **色调层**（`--background-primary-alt` / `--background-modifier-hover`）：仅用于输入框、次级按钮、悬停态。

弹窗自身的阴影与遮罩由 Obsidian 提供，插件不追加。**明确不使用**：卡片内嵌卡片、彩色边框、装饰性阴影、渐变。圆角只用两级：容器 `--radius-m`（8px），控件与进度条 `--radius-s`（4px）。

## 7. 注意事项

| 禁止 | 原因 | 检查方式 |
|---|---|---|
| 把分类色设为文字色 | 用户可设置任意色，亮色主题下默认 6 色即 1.58~3.20:1，全部不合格 | 搜索 `style.color` 与 `--jev-cat` 的使用点；对任意新色跑一次对比度计算 |
| 用 `opacity` 表示禁用 | `opacity: .5` 会让文字跌破 4.5:1，并把「停用」与「不重要」混为一谈 | 禁用态单独截图量对比度 |
| 用 `div` + `onClickEvent` 当按钮 | 键盘不可达、触摸目标难以保证 | 只用键盘走完全流程；375px 下测命中区 |
| 一屏 4 个同级按钮 | 主操作被稀释，且用户到点击才知道后果 | 每个界面只允许一个 `setCta()` |
| 靠背景色块区分信息层级 | 本项目只需讲清一件事；色块一多就没有层级 | 灰度截图检查是否还能分辨三级信息 |
| 在设置页用 `dblclick` 触发展开 | 无任何视觉暗示 | 首次使用者测试能否自己找到展开方式 |
| 用 `--text-faint` 承载路径等必要信息 | 暗色实测 2.90:1 | 全文搜索 `--text-faint` 的用法，只保留装饰性场景 |

**未决与风险**

- 分类色由用户自由设置，折算只能保证多数色值可读；极端色（纯白、纯黑、极低饱和）折算后仍可能不足。建议在颜色输入旁给出实时「该色在当前主题下的可读性」提示（P2-6 顺带解决）。
- `--jev-cat` 需要由 TS 内联到元素（`el.style.setProperty("--jev-cat", color)`），当前实现是直接写 `background`，改造时需一并调整。
- 未做真机／读屏测试；`aria-*` 与焦点顺序属**设计意图**，落地后必须实测。
- 设置项文案「恢复默认分类」等命名调整属内容变更，需同步更新 README 的「配置」章节。

## 8. 响应式行为

| 视口 | 行为 |
|---|---|
| 1440 / 1024px（桌面） | 现状布局；弹窗单列；键盘全路径可达；`⋯` 菜单 30px 命中区 |
| 768px（平板） | 键值行允许换行；概率行标签列 `max-content` 自然压缩；设置项改上下堆叠（标签在上、控件在下，宽度 100%） |
| 375px（手机） | 行高 44px；`⋯` / 图标按钮命中区 44×44px；概率行 `42px` 数值列保留（等宽数字不可压缩）；路径省略优先于换行 |

- **键盘**：Tab 顺序 = 视觉顺序；弹窗内焦点闭环；`Esc` 关闭；关闭后焦点回到触发元素（状态栏项 / 菜单来源）。
- **触摸**：≥44px；不使用 hover 作为唯一可发现手段（`查看判断详情` 提示在触摸端常显或改为图标）。
- **文本压力**：200% 缩放、Obsidian 字体调至最大两档、超长文件夹路径、12 个字的中文分类名——四项均已定为检查项（见复测矩阵）。
- **动效**：只有两处（状态栏 busy 呼吸、chevron 旋转 150ms）；全部包在 `prefers-reduced-motion` 保护内。
- **状态**：加载（`测试中…`、扫描进度）、空（无匹配 / 无启用分类 / 无判断结果）、成功（状态栏 ok + Notice）、错误（状态栏 error + 可行动 Notice）、恢复（撤销入口 + 10 条撤销记录）——五态齐备后才算完成。

## 9. Agent 提示词指南

```
项目：Obsidian 插件 JEV Inbox Router（D:\MyProjects\obsidian-jev-inbox-router）。
目标：按 DESIGN.md 把插件界面改造到「极简、原生、静默」，不改变任何判断与分流逻辑。

必做约束：
1. 所有表面继承 Obsidian 主题变量；不引入字体、背景色块、阴影。
2. 分类色只允许出现在 ≥8px 圆点与「被选中项」的进度条上，颜色统一走
   color-mix(in srgb, var(--jev-cat) var(--jev-cat-mix), var(--text-normal))，
   亮色 55% / 暗色 85%。禁止把分类色赋予任何文字。
3. 层级只用字号、字重、间距、1px 发丝线；灰度下必须仍能分辨三级信息。
4. 一切可点元素用真控件：role/tabindex、:focus-visible、min-height 44px。
5. 每个弹窗只保留一个 setCta() 主操作，文案点名对象（如「移动到 要做的事」）。
6. 破坏性动作必须先二次确认，确认文案写明对象与后果。

触点与顺序：
- styles.css 全量重写（保留原类名前缀 jev-*，删除 opacity 禁用与固定 px 列宽）。
- src/modals.ts：标题统一用 titleEl；结论行/键值行/尾注替换 verdict+meta-grid；
  FolderPickerModal 改 extends SuggestModal<string>；CategoryPickerModal 改 Menu 或 6 格网格；
  移除 50ms setTimeout focus。
- src/settings-tab.ts：卡头改 <button> + chevron + aria-expanded，去掉 dblclick 与 opacity；
  启用开关改 addToggle 并带 aria-label；输入框加 .text-input；
  三个重置按钮合并为节末 ⋯ 菜单 + Modal 二次确认，文案写明后果。
- src/main.ts：状态栏去常驻前缀、补 is-idle/is-ok、加 role/tabindex/Enter/Space；
  分流成功后在 12s 窗口内提供「撤销」入口。

验收：
- 亮/暗两主题下，用脚本复算每个分类的标识色对比度 ≥3:1；文字不出现分类色。
- 纯键盘完成：状态栏 → 判断弹窗 → 换个去向 → 选定 → 撤销。
- 375/768/1024/1440px、200% 缩放、Obsidian 最大字号两档、超长路径、12 字分类名无截断与重叠。
- 开启系统「减少动效」后无动画残留。
- 每个弹窗只有一个 CTA；每个破坏性动作都有确认。

验证状态（截至 2026-09-21）：以上验收项均**尚未执行**。已完成的只有源码静态评审与对比度计算
（见 UI-REVIEW.md 与 design-preview.html）。不要在未运行的情况下把任一验收项标记为通过。
```

---

**落地状态**：界面层已按本契约改造（2026-09-21），源码见 `styles.css`、`src/modals.ts`、`src/settings-tab.ts`、`src/main.ts`；三处实现层面修正见文末「落地修正（2026-09-21）」。界面现状、差距排序与复测矩阵见 `UI-REVIEW.md`；设计差异的可视化对照见 `design-preview.html`。

---

## 落地修正（2026-09-21）

本节记录实现时对 §4.4 / §9（及 `UI-REVIEW.md` P1-6、P1-7）的三处修正，均为实现层面的必要偏离。前文的原则与规则（分类色只做标识、层级只靠字号/字重/间距/发丝线、可点即真控件、一屏一个 CTA）**不变**。

### 修正 1：分类卡头部不做整行 `<button>`，改用独立 chevron 按钮

- 原文（§4.4 / P1-6）：卡头整行 `<button>` + `aria-expanded`。
- 问题：头部里还要放 `<input>`（分类名）与启用开关。**按钮里嵌套输入控件是无效 HTML**，会导致点击冒泡错乱、焦点行为不可预测、读屏语义错误。
- 落地：头部保持 `div` 行；行首放**一个独立的** `<button class="jev-chev-btn" type="button">`（内嵌 Lucide `chevron-right`），带 `aria-expanded="true|false"` 与 `aria-controls="<展开区 id>"`，命中区 ≥44×44px，`:focus-visible` 有可见环。整行**不承担点击**，不用 `onClickEvent` 兜底。

### 修正 2：撤销入口用第二个状态栏项，不做状态栏项内的「可点后缀」

- 原文（§9 / P1-7）：在状态栏结果态追加「已移动 · 撤销」的可点后缀。
- 问题：状态栏主项已经负责「点击打开判断详情」，再嵌一个可点对象就是**嵌套交互**，键盘与读屏都会乱。
- 落地：新增**第二个状态栏项**（`this.addStatusBarItem()`），文案「撤销」，`role="button"` + `tabindex="0"` + `aria-label="撤销上一次分流"`，Enter/Space 触发；只在「刚刚成功移动过文件」之后的 `statusBarClearMs` 窗口内存在，窗口结束 `detach()` 并把引用置 `null`（不允许节点残留）；`statusBarEnabled` 关闭时一并清掉。自动分流（`quiet`）场景同样有退路，正好补上 P1-7 指出的缺口。

### 修正 3：折算色的最差底是次级面，55% 是保守取值（数学临界 60%）

- 原文（§2）：亮色折算 55% / 暗色 85%，并给出「对白底」的实算表。
- 补充实算（脚本：`.workbuddy/scratch/contrast-audit.mjs`）：
  - 折算色最差底**不是白底，而是次级面** `--background-secondary`（亮 `#f2f6f9` / 暗 `#161616`）。亮色下 D（待办）在次级面上只有 **3.32:1**，是全部组合里的最低值。
  - 比例扫描（亮色次级面 `#f2f6f9` 上的最差分类 D）：50% → 3.67:1、**55% → 3.32:1**、59% → 3.05:1、**60% → 2.98:1（首次跌破 3:1）**。因此**数学临界是 60%，55% 是留出余量的保守取值**——保留 55%，不要调高，也不要为了「更保险」加大比例（那是反向的）。暗色 85% 有 6.43~11.68:1 的充裕余量。

### 实现注记（同批落地，非原则变更）

- `--jev-cat` **必须有默认值**（`:root { --jev-cat: #7f8c99 }`）：`color-mix` 引用了未定义的 `var(--jev-cat)` 会让整条声明在计算值阶段失效，圆点变透明。
- 非选中概率条填充不用 `--text-faint`（对轨道 `--background-modifier-border` 仅 2.13:1 / 2.20:1），改用 `--text-muted`（5.07:1 / 6.03:1）。
- callout 标题色按主题分别取中性值（亮 `#56606C` 6.39:1 / 暗 `#B3BCC6` 8.67:1）：Obsidian 不提供 `--color-accent-rgb`，固定单值无法两主题都过 4.5:1，故用可被主题覆盖的 `--jev-callout-rgb`。
- `src/rules.ts` 的 `statusViewForRoute` **文本保持原样**（`test/rules.test.ts` 断言了「待办 48% → 要做的事」等字符串）；状态栏「去掉常驻 `JEV ·` 前缀」放在 `src/main.ts` 的 `setStatus()` 里做。
