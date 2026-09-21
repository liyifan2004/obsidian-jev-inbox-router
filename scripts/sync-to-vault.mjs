/**
 * 把构建产物同步到本地 Obsidian 库。
 *
 * 用法：
 *   node scripts/sync-to-vault.mjs
 *   node scripts/sync-to-vault.mjs "D:\\MyNotes\\另一个库"
 *
 * 目标库可以用命令行参数指定；不指定时读取 VAULT_PLUGIN_DIR 环境变量，
 * 再退回下面的 DEFAULT_VAULT。
 */
import { cp, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const PLUGIN_ID = "jev-inbox-router";
const DEFAULT_VAULT = "D:\\MyNotes\\学-习";
const FILES = ["main.js", "manifest.json", "styles.css"];

const vault = process.argv[2] || process.env.VAULT_PLUGIN_DIR?.replace(/[\\/]plugins[\\/][^\\/]+$/, "") || DEFAULT_VAULT;
const target = path.join(vault, ".obsidian", "plugins", PLUGIN_ID);
const source = process.cwd();

try {
	await access(path.join(source, "main.js"), constants.R_OK);
} catch {
	console.error("找不到 main.js，请先运行 npm run build。");
	process.exit(1);
}

await mkdir(target, { recursive: true });
for (const file of FILES) {
	await cp(path.join(source, file), path.join(target, file));
	console.log(`  ${file} -> ${path.join(target, file)}`);
}
console.log(`\n已同步到 ${target}`);
console.log("在 Obsidian 里到「设置 → 第三方插件」启用 JEV Inbox Router。");
