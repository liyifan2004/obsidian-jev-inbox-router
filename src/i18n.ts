import { moment } from "obsidian";

/**
 * i18n：按 Obsidian UI 语言返回文案。
 * moment.locale() 返回 Obsidian 当前界面语言（"en"、"zh-cn" 等），
 * 插件自动跟随，无需用户在设置里再选一次。
 *
 * t() 支持模板插值（{name} 形式），用 split/join 替换以兼容低版本 target。
 * 数据层默认内容（DEFAULT_CATEGORIES、VALUE_LEVELS、预设方案）不在这里，
 * 它们由 constants.ts / presets.ts 在模块加载时按 uiIsZh() 选择 zh/en 快照。
 */

const en = {
	// ---- 通用 ----
	vaultRoot: "vault root",
	rootParens: "(vault root)",
	cancel: "Cancel",
	moreActions: "More actions",
	expand: "Expand",
	collapse: "Collapse",
	enable: "Enabled",
	folderMissing: " (missing)",

	// ---- 命令与菜单 ----
	cmdRouteSuggest: "Judge current note and suggest a destination",
	cmdRouteMove: "Judge current note and move it",
	cmdJudgeOnly: "Judge current note only (no move)",
	cmdScanInbox: "Scan inbox and process in bulk",
	cmdAcceptLast: "Accept last suggestion and move the note",
	cmdUndoLast: "Undo last route",
	cmdShowDecision: "Show last decision details",
	cmdToggleAutoRoute: "Toggle auto routing",
	ribbonScan: "JEV: scan inbox and process",
	menuSuggest: "JEV: judge and suggest",
	menuJudgeOnly: "JEV: judge only (no move)",
	menuMoveTo: "JEV: move to folder…",

	// ---- 状态栏 ----
	statusReady: "Ready",
	statusHint: "View decision details",
	ariaShowDecision: "Show last decision details",
	undoLabel: "Undo",
	ariaUndo: "Undo last route",
	acceptLabel: "Accept",
	ariaAccept: "Accept suggestion: move to {folder}",
	statusAnalyzing: "Analyzing: {name}",
	statusTooShort: "Too short, skipped",
	statusMissingKey: "Missing API Key",
	statusJudgeFailed: "Judgment failed",
	statusMovedTo: "Moved to {folder}",
	statusAlreadyAtTarget: "Already in the target folder",
	statusMoveFailed: "Move failed",
	statusAutoRouteOn: "Auto routing on",
	statusAutoRouteOff: "Auto routing off",
	statusUndone: "Undone last route",
	statusUndoFailed: "Undo failed",
	statusScanSuggest: "Scan done, {count} suggestions",
	statusScanMoved: "Scan done, {count} moved",

	// ---- 通知 ----
	noticeMissingKey:
		"Please fill in your API Key under Settings → JEV Inbox Router.",
	noticeJudgeFailed: "JEV judgment failed: {message}",
	noticeAutoRouteOn: "Auto routing enabled",
	noticeAutoRouteOff: "Auto routing disabled",
	noticeNoteMissing: "Can't find this note (it may have been moved or deleted).",
	noticeRouted: "Routed: {key} {label} ({pct}%) → {folder}",
	noticeMarkedOnly: "Marked but not moved: {reason}",
	noticeMovedTo: "Moved to {folder}",
	noticeMoveFailed: "Move failed: {message}",
	noticeInboxEmpty: "No Markdown notes to process in ({folders}).",
	noticeScanProgress: "JEV processing… {index}/{total}\n{path}",
	noticeScanSuggest:
		"Scan complete: {total} notes · {suggested} suggestions · {skipped} skipped · {failed} failed",
	noticeScanMoved:
		"Scan complete: {total} notes · {moved} moved · {marked} marked only · {skipped} skipped · {failed} failed",
	noticeNothingToUndo:
		"Nothing to undo (only the most recent routes survive a restart).",
	noticeUndone: "Undone: {path} → {previousPath}",
	noticeUndoFailed:
		"Undo failed: {path} not found (it may have been moved or deleted).",
	noticeNoDecisionYet: "No judgment has been made in this session yet.",
	noticeBlockRemoved: "Decision block removed.",
	manualKey: "Custom",
	manualLabel: "Manually assigned",

	// ---- rules.ts：门槛与状态栏 ----
	gateConfidenceLow: "Confidence {p}% is below the {threshold}% threshold",
	gateMarginLow:
		"Top pick leads by only {margin}×, below the {threshold}× threshold",
	statusMoved: "{short} {pct} → {folder}",
	statusUncertain: "{short} {pct} uncertain",
	statusAtTarget: "{short} already at target",
	suggestAtTarget: "Already in {folder}",
	suggestOk: "Suggest {short} {pct} → {target}",
	suggestUncertain: "Suggest {short} {pct} uncertain → {target}",

	// ---- router.ts：拦截原因 ----
	blockedDeletionIgnore:
		'This note was judged as "should delete"; the current setting is to leave it untouched',
	blockedDeletionMark:
		'This note was judged as "should delete"; marked but not moved (the plugin never deletes files)',

	// ---- note-writer.ts：判断块 ----
	blockTitle: "JEV routing decision → {key} {label}",
	detailsSummary: "{title} ({pct})",
	blockDestination: "**Destination**: {key} {label} → {target}",
	notMovedSuffix: " (not moved)",
	blockConfidence:
		"**Confidence**: {pct} · threshold {threshold} · margin {margin}",
	blockValue: "**Long-term value**: {index}/{total} — {level}",
	blockProbabilities: "**Probability distribution**: {distribution}",
	blockBlockedReason: "**Why not moved**: {reason}",
	blockModel: "**Judged by**: {model} · {time}",
	marginFarAbove: "far above runner-up",

	// ---- modals.ts ----
	decisionTitle: "JEV routing decision",
	kvConfidence: "Confidence",
	kvMargin: "Margin",
	kvValue: "Long-term value",
	kvRequirement: "Requirement",
	confidenceValue: "{value} (threshold {threshold})",
	marginValue: "{value} (threshold {threshold})",
	valueNotAssessed: "Not assessed",
	gatePassed: "Passed both gates",
	gateNotPassed: "Not met",
	modelConfidenceFoot: "self-reported confidence {pct}",
	ctaMoveTo: "Move to {folder}",
	ctaMoveToRoot: "Move to vault root",
	btnOther: "Choose another…",
	menuReroute: "Re-judge",
	menuRemoveBlock: "Remove decision block",
	pickerTitle: "Choose a destination category",
	pickerEmpty: "No enabled categories — enable some in the settings first.",
	folderPickerPlaceholder: "Type to filter…",

	// ---- jev-client.ts ----
	truncatedOmitted: "… ({count} characters omitted here) …",
	errNetwork: "Network request failed: {text}",
	err401: "API Key invalid or expired (401)",
	err403:
		"Access denied (403). Check whether your account has been admitted from the waitlist.",
	err422: "Request body validation failed (422): {text}",
	err429: "Rate limited (429), try again later",
	err529: "TypeSafe overloaded (529), try again later",
	errHttp: "JEV request failed ({status}): {text}",
	errRequestFailed: "JEV request failed",
	errJevReturned: "JEV returned an error: {json}",
	errNoApiKey:
		"API Key is not set. Fill it in under Settings → JEV Inbox Router → JEV API.",
	errNeedTwoCategories:
		"At least 2 enabled categories are required for a single-choice judgment.",
	questionCategory:
		"Which category does this note essentially belong to? Judge only by its content; do not judge its writing quality, and do not assume a short note is worthless.",
	questionValue:
		"How much long-term value does this note have for its owner?",
	errNoValidCategory:
		"JEV did not return a valid category result. Check the category configuration.",
	errUnknownCategory:
		'JEV returned an unknown category "{key}". Check whether the category configuration was just changed.',

	// ---- settings-tab.ts ----
	settingsIntro:
		"JEV does one thing: decide which category a note belongs to, then send it to the matching folder. It never rewrites, expands or summarizes your content.",
	sectionApi: "JEV API",
	apiKeyPlaceholder: "apikey_… or sk-…",
	apiKeyDesc:
		"Your TypeSafe key, get one at console.typesafe.ai/settings/keys. Stored in plain text in this plugin's data.json, never uploaded anywhere else.",
	settingEndpoint: "Endpoint",
	endpointDesc: "Default {endpoint}. Only change this when using your own proxy.",
	settingModel: "Model",
	modelDesc:
		"jev-latest follows the newest version; you can also pin a version such as jev-1.13.0.",
	settingTestConnection: "Test connection",
	testConnectionDesc:
		"Sends a sample note to JEV to verify the key, endpoint and category setup.",
	btnTest: "Test",
	btnTesting: "Testing…",
	testSampleTitle: "Product review tomorrow",
	testSamplePath: "Inbox/Product review tomorrow.md",
	testSampleContent:
		"Tomorrow at ten I'll walk the CTO through the Q3 roadmap; I need to finish the competitor-comparison slide beforehand, and remember to ask when the budget gets approved.",
	testOk:
		"Connection OK: {key} {label} ({pct}%) → {folder}\nModel {model}",
	testFewCategories:
		"Note: fewer than 2 enabled categories will fail in real use.",
	testFailed: "Test failed: {message}",

	sectionOrganization: "Organization",
	orgHint:
		"Built-in presets based on mainstream knowledge-management methods; you can fine-tune every category later under \"Categories & destinations\". Click a preset to select it, then press Apply below to take effect.",
	presetMeta: "{count} categories · → {folder}",
	settingApplyMode: "Apply mode",
	applyModeDesc:
		"Replace overwrites your current categories with the preset (a snapshot is saved first, restorable with one click); append keeps your categories and adds the preset after them.",
	optionReplace: "Replace existing categories (recommended)",
	optionAppend: "Append as new categories",
	ariaCreateFolders: "Also create the preset's folders",
	applyBarWithPreset: "To apply: {name}",
	applyBarName: "Apply preset",
	applyBarDescConfirm:
		"A confirmation dialog will spell out exactly what changes before applying.",
	applyBarDescPick: "Pick a preset above first.",
	btnApplyPreset: "Apply selected preset",
	btnRestorePrevious: "Restore previous organization",
	applyReplaceLine1:
		'This will replace your {count} categories with the "{name}" preset ({preview}). ',
	applyReplaceLine2:
		"Your current {count} categories will be saved as a snapshot first and can be restored with one click below. ",
	applyAppendLine:
		'This will append {count} categories from the "{name}" preset after your {existing} categories ({total} in total; aborted if over the limit). ',
	applyCreateFoldersLine: "Missing folders will also be created: {folders}. ",
	applyIndexLine: "The index folder will be set to {folder}. ",
	applyConfirmTitleReplace: 'Apply "{name}" preset (replace)',
	applyConfirmTitleAppend: 'Apply "{name}" preset (append)',
	confirmReplace: "Replace categories",
	confirmAppend: "Append categories",
	noticeAppendOverLimit:
		"Appending would make {total} categories, over the limit of {max}. Aborted; nothing was changed.",
	noticePresetReplaced: 'Replaced with the "{name}" preset.',
	noticePresetAppended: 'Appended the "{name}" preset.',
	errCreateFolder: "Failed to create folder {path}: {message}",
	restorePreviousTitle: "Restore previous organization",
	restorePreviousBody:
		"This will restore the {snapshot} categories from before the preset was applied (names, criteria, destinations and colors), replacing the current {current} categories. This cannot be undone.",
	confirmRestore: "Restore categories",
	noticeRestored: "Previous organization restored.",

	sectionCategories: "Categories & destinations",
	categoriesHint:
		"Each row is a category. The criteria description is fed to JEV — the more specific, the more accurate. The destination decides which folder the note is sent to. To switch the overall scheme, pick a preset under \"Organization\" above; single categories can be edited anytime.",
	btnAddCategory: "Add category",
	noticeMaxCategories: "At most {max} categories.",
	newCategoryName: "New category",
	overflowResetAll: "Reset to default categories (incl. folders)",
	overflowResetNames: "Reset names & descriptions only",
	resetCategoriesTitle: "Reset to default categories",
	resetCategoriesBody:
		"All names, short names, criteria, destination folders and colors go back to the initial 6 categories; categories you added or modified will be removed. This cannot be undone.",
	confirmResetCategories: "Reset categories",
	noticeResetCategories: "Reset to default categories.",
	resetNamesTitle: "Reset names & descriptions only",
	resetNamesBody:
		"Only each category's name, short name and criteria go back to the initial text. Your chosen destination folders, tags, order and colors are kept.",
	confirmResetNames: "Reset names & descriptions",
	noticeResetNames: "Category names and descriptions reset.",
	catKeyTooltip:
		"Category key, used as the JEV option key; changing it requires re-judging existing notes.",
	placeholderCategoryName: "Category name",
	ariaCategoryName: "Name of category {key}",
	ariaEnableCategory: "Enable {key} {label}",
	settingTargetFolder: "Target folder",
	targetFolderDesc: "Where notes of this category end up.",
	settingCriteria: "Criteria description",
	criteriaDesc:
		"Tell JEV what content counts as this category. The more specific, the more accurate.",
	settingShortName: "Status bar short name",
	shortNameDesc:
		"The status bar has limited space; use two or three characters.",
	settingTag: "Tag to write",
	tagDesc:
		"Written into frontmatter tags when routing; leave empty to skip.",
	settingColor: "Color",
	colorDesc: "Dot and probability bar color in the UI.",
	tooltipMoveUp: "Move up",
	tooltipMoveDown: "Move down",
	tooltipDelete: "Delete this category",
	noticeMinCategories: "Keep at least 2 categories.",

	sectionAuto: "Auto routing",
	settingMoveOnJudge: "Move automatically after judging",
	moveOnJudgeDesc:
		"Off (recommended) = after judging, show a suggestion in the status bar for one-click accept; on = move the file right away once both gates pass, no confirmation.",
	settingAutoRoute: "Enable auto routing",
	autoRouteDesc:
		"When on, notes landing in the index folder are judged automatically a few seconds after you stop editing. Try the manual commands a few times before turning this on.",
	settingWatchScope: "Watch scope",
	watchScopeDesc:
		"Index folder: only notes inside the given folder. Whole vault: every new note gets judged (broader, use with care).",
	optionWatchInbox: "Watch index folder only",
	optionWatchVault: "Watch the whole vault",
	settingIndexFolder: "Index folder (where new notes land)",
	indexFolderDesc:
		"JEV watches this folder and suggests destinations. Consider setting Obsidian's \"Default location for new notes\" here too (Settings → Files & links).",
	settingDelay: "Wait after editing stops",
	delayDesc:
		"In seconds. No judgment fires while you are still typing.",
	settingConfirm: "Confirm before auto routing",
	confirmDesc:
		"When on, every auto route first opens a dialog showing the destination so you can decide whether to move.",
	settingMinChars: "Minimum content length",
	minCharsDesc:
		"Notes shorter than this (after stripping markup) are not judged, avoiding wasted calls on empty notes.",
	settingConfidence: "Confidence threshold",
	confidenceDesc:
		"Lower bound for the chosen option's probability (0–1). With six categories the probability spreads naturally; around 0.4 works well. Higher is more conservative.",
	settingMargin: "Margin threshold",
	marginDesc:
		"Top pick probability ÷ runner-up probability. Below this ratio JEV is torn between two or three categories, so it only marks and does not move.",
	settingLowValue: "Also ask about long-term value",
	lowValueDesc:
		"Additionally asks whether the note is worth keeping; the result is written into the decision block to help you decide on cleanup.",
	settingDeletion: 'When judged as "should delete"',
	deletionDesc: "The plugin never deletes files, no matter what.",
	optionDeletionMark: "Mark only, don't move (recommended)",
	optionDeletionMove: "Move to that category's folder",
	optionDeletionIgnore: "Do nothing at all",

	sectionBlock: "In-note decision info",
	settingBlockEnabled: "Write decision info",
	blockEnabledDesc:
		"Leaves the decision result in the note so you can later trace why it lives where it does. Only writes data, never touches your prose.",
	settingPlacement: "Insert position",
	optionTop: "Top of note",
	optionBottom: "End of note",
	settingBlockStyle: "Display style",
	blockStyleDesc: "The collapsed style is the least intrusive in long notes.",
	optionCallout: "Callout card",
	optionDetails: "Collapsible block",
	optionQuote: "Plain quote",
	settingShowProbabilities: "Show full probability distribution",
	showProbabilitiesDesc:
		"Lists every category's probability with progress-bar characters. Off keeps only the conclusion.",
	settingFrontmatter: "Write frontmatter fields",
	frontmatterDesc:
		"Writes jev-category / jev-confidence / jev-model / jev-routed-at, aggregate-able with Dataview.",

	sectionStatusBar: "Status bar",
	settingStatusBar: "Show decision results in the status bar",
	statusBarDesc:
		"Shows only \"JEV\" when ready, and \"short name confidence\" with a result. Click it to open the full decision details.",
	settingClearMs: "Result display duration",
	clearMsDesc:
		"In seconds; reverts to \"Ready\" afterwards. Enter 0 to keep it visible.",

	sectionMaintenance: "Cache & reset",
	settingCacheMinutes: "Decision cache duration",
	cacheDesc:
		"In minutes. Unchanged content reuses the last judgment, saving calls.",
	settingResetBar: "Reset & clear",
	resetBarDesc:
		"Currently {count} cached entries. Every action below asks for confirmation first.",
	overflowClearCache: "Clear decision cache",
	overflowRestoreAll: "Restore all defaults (incl. API Key)",
	clearCacheTitle: "Clear decision cache",
	clearCacheBody:
		"Currently {count} cached entries. After clearing, every note needs a fresh JEV call next time, costing extra usage.",
	confirmClearCacheBtn: "Clear cache",
	noticeCacheCleared: "Cache cleared.",
	restoreAllTitle: "Restore all default settings",
	restoreAllBody:
		"Everything — API Key, categories, thresholds and cache duration — returns to its initial state, and the decision cache is cleared. This cannot be undone.",
	confirmRestoreAllBtn: "Restore all settings",
	noticeAllRestored: "Default settings restored.",
};

const zh: Record<keyof typeof en, string> = {
	// ---- 通用 ----
	vaultRoot: "库根目录",
	rootParens: "（库根目录）",
	cancel: "取消",
	moreActions: "更多操作",
	expand: "展开",
	collapse: "收起",
	enable: "启用",
	folderMissing: "（不存在）",

	// ---- 命令与菜单 ----
	cmdRouteSuggest: "判断当前笔记并给出去向建议",
	cmdRouteMove: "判断当前笔记并直接移动",
	cmdJudgeOnly: "只判断当前笔记（不移动）",
	cmdScanInbox: "扫描收件箱并批量处理",
	cmdAcceptLast: "接受上一次建议并移动笔记",
	cmdUndoLast: "撤销上一次分流",
	cmdShowDecision: "查看最近一次判断详情",
	cmdToggleAutoRoute: "切换自动分流开关",
	ribbonScan: "JEV：扫描收件箱并处理",
	menuSuggest: "JEV：判断并给出去向建议",
	menuJudgeOnly: "JEV：只判断（不移动）",
	menuMoveTo: "JEV：移动到指定文件夹…",

	// ---- 状态栏 ----
	statusReady: "就绪",
	statusHint: "查看判断详情",
	ariaShowDecision: "查看最近一次判断详情",
	undoLabel: "撤销",
	ariaUndo: "撤销上一次分流",
	acceptLabel: "接受",
	ariaAccept: "接受建议：移动到 {folder}",
	statusAnalyzing: "分析中：{name}",
	statusTooShort: "内容太短，跳过",
	statusMissingKey: "缺少 API Key",
	statusJudgeFailed: "判断失败",
	statusMovedTo: "已移到 {folder}",
	statusAlreadyAtTarget: "已经在目标文件夹",
	statusMoveFailed: "移动失败",
	statusAutoRouteOn: "自动分流 开",
	statusAutoRouteOff: "自动分流 关",
	statusUndone: "已撤销上一次分流",
	statusUndoFailed: "撤销失败",
	statusScanSuggest: "扫描完成，已给出建议 {count} 条",
	statusScanMoved: "扫描完成 {count} 篇已移动",

	// ---- 通知 ----
	noticeMissingKey: "请在 设置 → JEV Inbox Router 里填写 API Key。",
	noticeJudgeFailed: "JEV 判断失败：{message}",
	noticeAutoRouteOn: "自动分流已开启",
	noticeAutoRouteOff: "自动分流已关闭",
	noticeNoteMissing: "找不到这条笔记（可能已被移动或删除）。",
	noticeRouted: "已分流：{key} {label}（{pct}%）→ {folder}",
	noticeMarkedOnly: "已标记但未移动：{reason}",
	noticeMovedTo: "已移动到 {folder}",
	noticeMoveFailed: "移动失败：{message}",
	noticeInboxEmpty: "收件箱里没有待处理的 Markdown 笔记（{folders}）",
	noticeScanProgress: "JEV 处理中… {index}/{total}\n{path}",
	noticeScanSuggest:
		"扫描完成：共 {total} 篇 · 已给出建议 {suggested} 条 · 跳过 {skipped} · 失败 {failed}",
	noticeScanMoved:
		"扫描完成：共 {total} 篇 · 移动 {moved} · 仅标记 {marked} · 跳过 {skipped} · 失败 {failed}",
	noticeNothingToUndo: "没有可撤销的分流记录（插件重启后只保留最近几次）。",
	noticeUndone: "已撤销：{path} → {previousPath}",
	noticeUndoFailed: "撤销失败：找不到 {path}（可能已被移动或删除）。",
	noticeNoDecisionYet: "这个会话里还没有产生过判断结果。",
	noticeBlockRemoved: "已移除判断块。",
	manualKey: "自定义",
	manualLabel: "手动指定",

	// ---- rules.ts：门槛与状态栏 ----
	gateConfidenceLow: "置信度 {p}% 低于门槛 {threshold}%",
	gateMarginLow: "首选只比次选高 {margin} 倍，低于门槛 {threshold}×",
	statusMoved: "{short} {pct} → {folder}",
	statusUncertain: "{short} {pct} 存疑",
	statusAtTarget: "{short} 已在目标位置",
	suggestAtTarget: "已在 {folder}",
	suggestOk: "建议 {short} {pct} → {target}",
	suggestUncertain: "建议 {short} {pct} 存疑 → {target}",

	// ---- router.ts：拦截原因 ----
	blockedDeletionIgnore: "该笔记被判为「应该删除」，当前设置是不处理",
	blockedDeletionMark:
		"该笔记被判为「应该删除」，已标记但未移动（插件不会删除文件）",

	// ---- note-writer.ts：判断块 ----
	blockTitle: "JEV 分流判断 → {key} {label}",
	detailsSummary: "{title}（{pct}）",
	blockDestination: "**去向**：{key} {label} → {target}",
	notMovedSuffix: "（未移动）",
	blockConfidence:
		"**置信度**：{pct} · 门槛 {threshold} · 领先优势 {margin}",
	blockValue: "**长期价值**：{index}/{total} — {level}",
	blockProbabilities: "**概率分布**：{distribution}",
	blockBlockedReason: "**未自动分流的原因**：{reason}",
	blockModel: "**判断模型**：{model} · {time}",
	marginFarAbove: "远高于次选",

	// ---- modals.ts ----
	decisionTitle: "JEV 分流判断",
	kvConfidence: "置信度",
	kvMargin: "领先优势",
	kvValue: "长期价值",
	kvRequirement: "要求",
	confidenceValue: "{value}（门槛 {threshold}）",
	marginValue: "{value}（门槛 {threshold}）",
	valueNotAssessed: "未评估",
	gatePassed: "已过双门槛",
	gateNotPassed: "未达标",
	modelConfidenceFoot: "自报置信 {pct}",
	ctaMoveTo: "移动到 {folder}",
	ctaMoveToRoot: "移动到 库根目录",
	btnOther: "换个去向…",
	menuReroute: "重新判断",
	menuRemoveBlock: "移除判断信息块",
	pickerTitle: "选择去向分类",
	pickerEmpty: "没有启用中的分类，请先在设置里启用",
	folderPickerPlaceholder: "输入关键字过滤…",

	// ---- jev-client.ts ----
	truncatedOmitted: "…（此处省略 {count} 字）…",
	errNetwork: "网络请求失败：{text}",
	err401: "API Key 无效或已过期（401）",
	err403: "没有访问权限（403），请检查 Key 所属账号是否已从 waitlist 放行",
	err422: "请求体校验失败（422）：{text}",
	err429: "触发限流（429），稍后重试",
	err529: "TypeSafe 服务过载（529），稍后重试",
	errHttp: "JEV 请求失败（{status}）：{text}",
	errRequestFailed: "JEV 请求失败",
	errJevReturned: "JEV 返回错误：{json}",
	errNoApiKey: "尚未填写 API Key。请到 设置 → JEV Inbox Router → JEV 接口 里填入。",
	errNeedTwoCategories: "至少需要启用 2 个分类才能做单选判断。",
	questionCategory:
		"这条笔记本质上属于哪一类？只根据内容判断归属，不要评价它的文笔，也不要因为写得短就认为它没价值。",
	questionValue: "这条笔记对使用者未来的长期价值有多高？",
	errNoValidCategory: "JEV 没有返回有效的分类结果，请检查分类配置。",
	errUnknownCategory: "JEV 返回了未知分类「{key}」，请检查分类配置是否刚被改动。",

	// ---- settings-tab.ts ----
	settingsIntro:
		"JEV 只做一件事：判断这条笔记属于哪一类，然后把它送到对应的文件夹。它不会改写、扩写、总结你的任何内容。",
	sectionApi: "JEV 接口",
	apiKeyPlaceholder: "apikey_… 或 sk-…",
	apiKeyDesc:
		"TypeSafe 的 key，在 console.typesafe.ai/settings/keys 获取。以明文存在本插件的 data.json 里，不会上传到别的地方。",
	settingEndpoint: "端点地址",
	endpointDesc: "默认 {endpoint}。只有走自建代理时才需要改。",
	settingModel: "模型",
	modelDesc: "jev-latest 会跟随最新版本；也可以写死版本号，例如 jev-1.13.0。",
	settingTestConnection: "测试连接",
	testConnectionDesc:
		"发一条样例笔记给 JEV，确认 Key、端点、分类配置都能正常工作。",
	btnTest: "测试",
	btnTesting: "测试中…",
	testSampleTitle: "明天的产品评审",
	testSamplePath: "Inbox/明天的产品评审.md",
	testSampleContent:
		"明天上午十点跟张总过 Q3 路线图，要提前把竞品对比那一页补上，另外记得问一下预算什么时候批。",
	testOk: "连接正常：判为 {key} {label}（{pct}%）→ {folder}\n模型 {model}",
	testFewCategories: "提示：启用的分类少于 2 个，实际使用会报错。",
	testFailed: "测试失败：{message}",

	sectionOrganization: "组织方式",
	orgHint:
		"内置几套主流知识管理理论的分类方案，也可以之后在「分类与去向」里逐条改成自己的目录习惯。点选一套预设，再点下面的「应用」才会生效。",
	presetMeta: "{count} 个分类 · → {folder}",
	settingApplyMode: "应用方式",
	applyModeDesc:
		"替换会用预设覆盖现有分类（应用前自动存快照，可一键还原）；追加则保留现有分类，把预设排在后面。",
	optionReplace: "替换现有分类（推荐）",
	optionAppend: "追加为新分类",
	ariaCreateFolders: "同时创建预设的文件夹",
	applyBarWithPreset: "将应用：{name}",
	applyBarName: "应用预设",
	applyBarDescConfirm: "应用前会弹窗确认，写清楚会改动什么。",
	applyBarDescPick: "先在上面点选一套预设。",
	btnApplyPreset: "应用选中的预设",
	btnRestorePrevious: "还原上一次组织方式",
	applyReplaceLine1:
		"将把 {count} 个分类替换为「{name}」预设（{preview}）。",
	applyReplaceLine2:
		"你现有的 {count} 个分类会先存为快照，可在下方一键还原。",
	applyAppendLine:
		"将把「{name}」预设的 {count} 个分类追加到现有 {existing} 个分类之后（共 {total} 个，超过上限会中止）。",
	applyCreateFoldersLine: "并创建缺失的文件夹：{folders}。",
	applyIndexLine: "index 目录会设为 {folder}。",
	applyConfirmTitleReplace: "应用「{name}」预设（替换）",
	applyConfirmTitleAppend: "应用「{name}」预设（追加）",
	confirmReplace: "替换分类",
	confirmAppend: "追加分类",
	noticeAppendOverLimit:
		"追加后共 {total} 个分类，超过上限 {max}，已中止，未改动任何数据。",
	noticePresetReplaced: "已替换为「{name}」预设。",
	noticePresetAppended: "已追加为「{name}」预设。",
	errCreateFolder: "创建文件夹 {path} 失败：{message}",
	restorePreviousTitle: "还原上一次组织方式",
	restorePreviousBody:
		"将把分类恢复为应用预设前的 {snapshot} 个分类（名称、判据、去向与配色都会还原），当前的 {current} 个分类会被替换。此操作不可撤销。",
	confirmRestore: "还原分类",
	noticeRestored: "已还原上一次组织方式。",

	sectionCategories: "分类与去向",
	categoriesHint:
		"每一行是一个分类。判据描述是喂给 JEV 的说明，写得越具体，判断越准。去向决定这条笔记被送到哪个文件夹。想换个整体的组织方式，去上面的「组织方式」选预设；单个分类随时可以改。",
	btnAddCategory: "新增分类",
	noticeMaxCategories: "最多 {max} 个分类。",
	newCategoryName: "新分类",
	overflowResetAll: "重置为默认分类（含文件夹）",
	overflowResetNames: "只重置名称与描述",
	resetCategoriesTitle: "重置为默认分类",
	resetCategoriesBody:
		"所有分类的名称、短名、判据描述、目标文件夹与配色都会恢复成初始的 6 个分类；你新增或改过的分类会被移除。此操作不可撤销。",
	confirmResetCategories: "重置分类",
	noticeResetCategories: "已重置为默认分类。",
	resetNamesTitle: "只重置名称与描述",
	resetNamesBody:
		"只会把每个分类的名称、短名和判据描述恢复成初始文案。你已选好的目标文件夹、标签、顺序与配色都会保留。",
	confirmResetNames: "重置名称与描述",
	noticeResetNames: "已重置分类名称与描述。",
	catKeyTooltip: "分类标识，作为 JEV 的选项 key；改动后需要重新判断已有的笔记",
	placeholderCategoryName: "分类名",
	ariaCategoryName: "分类 {key} 的名称",
	ariaEnableCategory: "启用 {key} {label}",
	settingTargetFolder: "目标文件夹",
	targetFolderDesc: "这条笔记最终被送到哪里。",
	settingCriteria: "判据描述",
	criteriaDesc: "告诉 JEV 什么内容算这一类。写得越具体越准。",
	settingShortName: "状态栏短名",
	shortNameDesc: "状态栏空间有限，用两三个字概括。",
	settingTag: "写入标签",
	tagDesc: "分流时写进 frontmatter 的 tags，留空则不写。",
	settingColor: "配色",
	colorDesc: "界面上的小圆点和概率条颜色。",
	tooltipMoveUp: "上移",
	tooltipMoveDown: "下移",
	tooltipDelete: "删除该分类",
	noticeMinCategories: "至少保留 2 个分类。",

	sectionAuto: "自动分流",
	settingMoveOnJudge: "判断后自动移动",
	moveOnJudgeDesc:
		"关闭（推荐）= 判断后只在状态栏给建议，由你一键接受；开启 = 判断达标后直接移动文件，无需确认。",
	settingAutoRoute: "启用自动分流",
	autoRouteDesc:
		"开启后，落在 index 目录里的笔记在停止编辑若干秒后会被自动判断。建议先用手动命令试几次再打开。",
	settingWatchScope: "监听范围",
	watchScopeDesc:
		"index 目录：只处理指定文件夹里的笔记。整个库：新建的笔记都会被判断（范围更大，慎用）。",
	optionWatchInbox: "只监听 index 目录",
	optionWatchVault: "监听整个库",
	settingIndexFolder: "index 目录（新建笔记的落点）",
	indexFolderDesc:
		"JEV 监听这个目录，判断后给出建议去向。建议把 Obsidian 的「新笔记默认位置」也设到这里（设置 → 文件与链接）。",
	settingDelay: "停止编辑后等待",
	delayDesc: "单位秒。你还在打字时不会触发判断。",
	settingConfirm: "自动分流前确认",
	confirmDesc: "打开后，每次自动分流都会先弹窗让你看一眼去向，再决定是否移动。",
	settingMinChars: "最短内容长度",
	minCharsDesc: "去掉标记符号后不足这么多字符就不判断，避免为空白笔记浪费调用。",
	settingConfidence: "置信度门槛",
	confidenceDesc:
		"被选中选项的概率下限（0~1）。六个分类做单选时概率天然分散，0.4 左右比较合适；调高会更保守。",
	settingMargin: "领先优势门槛",
	marginDesc:
		"首选概率 ÷ 次选概率。低于这个倍数说明 JEV 在两三类之间摇摆，此时只标记不移动。",
	settingLowValue: "同时询问长期价值",
	lowValueDesc:
		"额外问一句这条笔记值不值得留，结果写在判断块里，帮助你决定要不要清理。",
	settingDeletion: "被判为「应该删除」时",
	deletionDesc: "无论如何插件都不会删除文件。",
	optionDeletionMark: "只标记，不移动（推荐）",
	optionDeletionMove: "移动到该分类的文件夹",
	optionDeletionIgnore: "完全不处理",

	sectionBlock: "笔记内的判断信息",
	settingBlockEnabled: "写入判断信息",
	blockEnabledDesc:
		"在笔记里留一段判断结果，方便日后回溯「它为什么在这里」。只写数据，不改动你的正文。",
	settingPlacement: "插入位置",
	optionTop: "正文开头",
	optionBottom: "正文末尾",
	settingBlockStyle: "显示样式",
	blockStyleDesc: "折叠样式在长笔记里最不挡视线。",
	optionCallout: "Callout 卡片",
	optionDetails: "可折叠块",
	optionQuote: "普通引用",
	settingShowProbabilities: "显示完整概率分布",
	showProbabilitiesDesc:
		"把每个分类的概率都列出来，含进度条字符。关掉则只留结论。",
	settingFrontmatter: "写入 frontmatter 字段",
	frontmatterDesc:
		"写入 jev-category / jev-confidence / jev-model / jev-routed-at，可用 Dataview 聚合。",

	sectionStatusBar: "状态栏",
	settingStatusBar: "在状态栏显示判断结果",
	statusBarDesc:
		"就绪时只显示「JEV」，有结果时显示「分类短名 置信度」。点一下可以打开完整判断信息。",
	settingClearMs: "结果保留时长",
	clearMsDesc: "单位秒，到点后收成「就绪」。填 0 表示一直显示。",

	sectionMaintenance: "缓存与重置",
	settingCacheMinutes: "判断结果缓存时长",
	cacheDesc: "单位分钟。内容没变就直接复用上一次的判断，省调用。",
	settingResetBar: "重置与清空",
	resetBarDesc: "当前缓存 {count} 条。以下动作都会先弹窗确认。",
	overflowClearCache: "清空判断缓存",
	overflowRestoreAll: "恢复全部默认设置（含 API Key）",
	clearCacheTitle: "清空判断缓存",
	clearCacheBody:
		"当前缓存 {count} 条。清空后，所有笔记下次都需要重新调用 JEV 判断，会消耗额外调用。",
	confirmClearCacheBtn: "清空缓存",
	noticeCacheCleared: "缓存已清空。",
	restoreAllTitle: "恢复全部默认设置",
	restoreAllBody:
		"包括 API Key、分类、门槛与缓存时长在内的全部设置都会回到初始状态，并清空判断缓存。此操作不可撤销。",
	confirmRestoreAllBtn: "恢复全部设置",
	noticeAllRestored: "已恢复默认设置。",
};

const localeMap: Record<string, Partial<typeof en>> = {
	en,
	zh,
	"zh-cn": zh,
};

/** 取当前语言文案；支持 {name} 形式的变量插值。 */
export function t(
	key: keyof typeof en,
	vars?: Record<string, string | number>
): string {
	const loc = moment.locale();
	const dict = localeMap[loc] ?? localeMap[loc.split("-")[0]] ?? en;
	let s: string = (dict[key] as string | undefined) ?? en[key];
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			s = s.split("{" + k + "}").join(String(v));
		}
	}
	return s;
}

/** 当前 UI 是否为中文（供数据层在模块加载时选择 zh/en 快照） */
export function uiIsZh(): boolean {
	const loc = moment.locale();
	return loc === "zh" || loc.startsWith("zh-");
}
