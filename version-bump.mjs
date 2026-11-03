import { readFileSync, writeFileSync } from 'fs';

/**
 * 读写 JSON 时保留原文件的缩进风格与结尾换行。
 *
 * 直接 `JSON.stringify(obj, null, '\t')` 会把 2 空格缩进的 manifest 改成
 * tab 缩进、还会吃掉结尾换行 —— 每次发版都产生一大片无关的格式 diff，
 * 让真正的版本号改动淹没在噪音里。这里按原文件的缩进写回。
 */
function readJson(path) {
	const raw = readFileSync(path, 'utf8');
	return {
		data: JSON.parse(raw),
		indent: /^\t/m.test(raw) ? '\t' : /^\s+/m.test(raw) ? '  ' : '\t',
		trailingNewline: raw.endsWith('\n'),
	};
}

function writeJson(path, data, indent, trailingNewline) {
	let text = JSON.stringify(data, null, indent);
	if (trailingNewline) text += '\n';
	writeFileSync(path, text);
}

/**
 * 版本号同步脚本 —— 让 `npm version` 成为唯一的版本号入口。
 *
 * 为什么需要它：本仓库的手工改版本号曾让三处版本号漂移
 * （package.json 停在 0.1.0，manifest.json 已是 0.2.0）。
 * Obsidian 的插件提交机器会读仓库根目录的 manifest.json，商店后台读的
 * 又是 GitHub Release 上的 manifest.json —— 三处不一致会让用户拿到
 * 的版本号和实际代码对不上。
 *
 * 用法：
 *   npm version patch       # 0.2.0 -> 0.2.1，自动同步下面三处
 *   npm run version         # 不改版本号，只把已有版本号同步到三处
 *
 * 版本号以 **manifest.json 为准**（它是 Obsidian 真正读的那份），而不是
 * npm 的 package.json —— 因为历史上正是 package.json 落后了。如果 npm
 * 刚把 package.json 改成了更高的版本号，则以 npm 的为准（正常发版路径）；
 * 如果 package.json 反而更旧（漂移），则以 manifest 为准并把 package.json
 * 拉回来。
 *
 * 同步目标：
 *   - manifest.json  的 version（基准）
 *   - package.json   的 version
 *   - versions.json  新增 "<version>": "<minAppVersion>" 条目
 *
 * versions.json 是 Obsidian 的历史兼容表：每个发布过的版本对应它所需的
 * 最低 Obsidian 版本，用户从旧版本升级时 Obsidian 用它判断能否直升。
 */

const manifestFile = readJson('manifest.json');
const manifest = manifestFile.data;
const pkgFile = readJson('package.json');
const pkg = pkgFile.data;
const versionsFile = readJson('versions.json');
const versions = versionsFile.data;

/** npm version 刚写入的版本号（`npm run version` 时为 package.json 的现值）。 */
const npmVersion = process.env.npm_package_version;

/**
 * 选基准版本号。
 *
 * - npm 刚改过 package.json 且比 manifest 新 → 用 npm 的（正常发版）。
 * - 否则 → 用 manifest 的（漂移时把落后的 package.json 拉回来）。
 */
function pickVersion() {
	if (!npmVersion) return manifest.version;
	const asSemver = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
	const [a, b, c] = asSemver(npmVersion);
	const [x, y, z] = asSemver(manifest.version);
	const newer =
		a > x || (a === x && (b > y || (b === y && c >= z)));
	return newer ? npmVersion : manifest.version;
}

const targetVersion = pickVersion();

if (!targetVersion) {
	console.error(
		'version-bump.mjs 无法确定目标版本号：manifest.json 与 package.json 都缺少 version 字段。',
	);
	process.exit(1);
}

// --- manifest.json：版本号 + 记下 minAppVersion ---
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeJson('manifest.json', manifest, manifestFile.indent, manifestFile.trailingNewline);

// --- versions.json：登记新版本对应的 minAppVersion ---
if (!(targetVersion in versions)) {
	versions[targetVersion] = minAppVersion;
}
writeJson('versions.json', versions, versionsFile.indent, versionsFile.trailingNewline);

// --- package.json：与 manifest 保持一致 ---
// npm version 已经改过它，这里再确认一次，让 `npm run version`
// 也能把 package.json 拉回一致（修复历史漂移）。
if (pkg.version !== targetVersion) {
	pkg.version = targetVersion;
	writeJson('package.json', pkg, pkgFile.indent, pkgFile.trailingNewline);
}

console.log(
	`version-bump: ${targetVersion} (minAppVersion ${minAppVersion}) — ` +
		'manifest.json / versions.json / package.json 已同步',
);
