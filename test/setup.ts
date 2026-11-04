// 源码里用了 window.setTimeout（Obsidian 运行环境下 window 一定存在）。
// 测试跑在 node 环境里，这里补一个最小 shim，避免默认 jsdom 带来的额外依赖。
//
// 用 globalThis 而不是裸的 window：node 环境没有 window 这个全局变量，
// 直接引用会抛 ReferenceError。官方规则 obsidianmd/no-global-this 针对的是
// **插件源码**（移动端弹出窗口里 globalThis 不是当前窗口），
// 测试桩不在发布产物里，所以这里只作局部说明，不改用 window。
const g = globalThis as unknown as { window?: unknown };
if (typeof g.window === "undefined") {
	g.window = globalThis;
}
