import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

/**
 * ESLint 配置。
 *
 * `eslint-plugin-obsidianmd` 是 **Obsidian 官方提供的自查工具** ——
 * 「Check your Obsidian plugin against the official developer guidelines」，
 * 商店审查用的正是它这套规则。
 *
 * ## 为什么把它接进 CI
 *
 * 本插件已在 Obsidian 社区商店列表里。商店审查的意见**本来就能在本地跑出来**
 * （设置标题不要含插件名、没实现 getSettingDefinitions()、多余的 as 断言、
 * 未使用的导入、CSS 的 !important 与 :has()）。
 *
 * 把它接进 CI 意味着这些问题在**提交时**就被拦下，
 * 而不是等到发版后被打回、插件从列表里消失。
 *
 * 与 stylelint 的分工：
 *   - stylelint-config-obsidianmd → 管 CSS（!important / :has）
 *   - eslint-plugin-obsidianmd      → 管 TypeScript 源码
 *
 * 与同 fleet 的 obsidian-media-speed-enhancer、obsidian-folio、obsidian-mineru
 * 同一套配置。
 */
export default defineConfig([
	// 构建产物与 Node 脚本不是插件源码。
	// main.js 是 esbuild 产物（仓库根目录同时有 main.ts 与 main.js），
	// 不忽略它会让 ESLint 去 lint 打包后的代码。
	globalIgnores([
		"node_modules",
		"main.js",
		"dist",
		".workbuddy",
		"*.config.mjs",
		"*.config.mts",
		"version-bump.mjs",
		"version-sync.mjs",
	]),

	...obsidianmd.configs.recommended,

	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
			},
		},
		rules: {
			// 示例插件的占位类名。本插件用自己的前缀（jev-），
			// 但规则本身仍要检查「有没有抄模板里的名字」。
			"obsidianmd/sample-names": "off",
		},
	},

	{
		// 测试文件不按「插件源码」的规则审 ——
		// 商店审查看的是发布产物（main.js），测试里的 any 与断言是合理的。
		files: ["test/**/*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
		},
	},
]);
