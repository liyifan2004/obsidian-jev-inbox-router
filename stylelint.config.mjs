/**
 * Stylelint 配置。
 *
 * 用 `stylelint-config-obsidianmd` —— **Obsidian 商店审查用的同一份规则集**。
 * 它的两条关键规则对应商店审查会提的两条：
 *
 *   - `declaration-no-important`：Avoid !important
 *   - `selector-pseudo-class-disallowed-list: ["has"]`：Avoid :has()
 *
 * 本插件已在 Obsidian 社区商店列表里，接进 CI 意味着这两类问题
 * 在**提交时**就被拦下，而不是等发版后被商店审查打回、从列表里下架。
 *
 * 配置策略：强制这两条**行为性**规则（它们的后果是插件被下架），
 * 关闭纯风格类规则（排版、颜色记法、类名格式）——
 * 那些是几百行纯排版改动，不解决审查问题却会淹没真正需要 review 的 diff。
 *
 * 与同 fleet 的 obsidian-media-speed-enhancer、obsidian-folio 同一套配置。
 */
export default {
	extends: ["stylelint-config-obsidianmd"],
	rules: {
		// ---- 审查关心的行为性规则：保持 error ----
		"declaration-no-important": true,
		"selector-pseudo-class-disallowed-list": [["has"]],

		// ---- 纯风格类规则：与审查无关，关闭 ----
		"rule-empty-line-before": null,
		"at-rule-empty-line-before": null,
		"comment-empty-line-before": null,
		"declaration-block-single-line-max-declarations": null,
		"color-function-alias-notation": null,
		"color-function-notation": null,
		"alpha-value-notation": null,
		"color-named": null,
		"selector-class-pattern": null,
		"no-descending-specificity": null,
		"property-no-vendor-prefix": null,
		"media-feature-range-notation": null,
	},
};
