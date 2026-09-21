// 源码里用了 window.setTimeout（Obsidian 运行环境下 window 一定存在）。
// 测试跑在 node 环境里，这里补一个最小 shim，避免默认 jsdom 带来的额外依赖。
const g = globalThis as unknown as { window?: unknown };
if (typeof g.window === "undefined") {
	g.window = globalThis;
}
