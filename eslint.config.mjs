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
		// 构建期脚本：跑在 Node 里而不是 Obsidian 里。
		// 用插件的规则审它只会得到假告警（Node API、移动端兼容等），
		// 它也不进发布产物（商店只下载 main.js / manifest.json / styles.css）。
		"scripts/",
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

			// UI 文案用 sentence case。
			//
			// brands 里放的是**产品标识**，不是普通英文词 ——
			// 规则会把它们当成普通词小写（`JEV` → `Jev`），
			// 但这些名字是 API 里的真实取值，改了就不对。
			//
			// 另加 ignoreRegex 跳过含汉字的字符串：
			// 规则的分词正则只匹配 ASCII 字母数字，中文文案本来不受影响，
			// 但中英混排（如「JEV 收件箱」）会被误判。中文 UI 不需要 sentence case。
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					enforceCamelCaseLower: true,
					brands: ["JEV", "jev-latest", "API"],
					ignoreRegex: ["[\\u4e00-\\u9fff]"],
				},
			],
		},
	},

	{
		// 移动端通知的降级实现：**刻意不用** Obsidian 的 DOM 扩展 API。
		//
		// obsidianmd/prefer-create-el 建议把
		//   document.createDocumentFragment() → createFragment()
		//   document.createElement("span")   → createSpan()
		//   document.createElement("button") → createEl("button")
		//
		// 但 `createFragment` 在 obsidian.d.ts 里是 **declare global**，
		// 不是导出成员 —— 运行时可用性未经验证。
		// 而这段代码是移动端的**降级路径**，本来就要求在
		// minAppVersion 1.5.0 上能用，所以只用最基础的标准 DOM。
		//
		// 规则的 autofix 会改写这里，所以对这一处单独豁免并写明理由，
		// 而不是关掉整个规则（其他地方仍要它把关）。
		files: ["src/main.ts"],
		rules: {
			"obsidianmd/prefer-create-el": "off",
		},
	},

	{
		// 测试文件不按「插件源码」的规则审 ——
		// 商店审查看的是发布产物（main.js），测试里的 any 与断言是合理的。
		//
		// no-deprecated 也要放开：测试要**直接调用** display() 来跑命令式路径
		// （minAppVersion 1.5.0 的那条路径），而 display() 在 1.13+ 的类型定义里
		// 标了 @deprecated。测试里调用它是有意为之，不是遗留代码。
		files: ["test/**/*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			"@typescript-eslint/no-deprecated": "off",
			"obsidianmd/no-global-this": "off",
		},
	},
]);
