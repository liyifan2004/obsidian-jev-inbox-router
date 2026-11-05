# JEV Inbox Router

[English](README.en.md) | **简体中文**

<p align="center"><b>用 JEV 判断「这条笔记属于哪一类」，然后把它送到对应的文件夹。它不替你写任何内容。</b></p>

[![Release](https://img.shields.io/github/v/release/liyifan2004/obsidian-jev-inbox-router?style=flat-square)](https://github.com/liyifan2004/obsidian-jev-inbox-router/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Obsidian plugin](https://img.shields.io/badge/Obsidian-Plugin-purple?style=flat-square)](https://obsidian.md)

## 功能

- **[分类与去向](docs/user-guide.md#它做什么)**：六个可配置的分类（A 永久知识 / B 产品灵感 / C 待研究 / D 待办事项 / E 引用资料 / F 应该删除），每个都能指定目标文件夹。
- **[结果呈现](docs/user-guide.md#它怎么呈现结果)**：状态栏建议、笔记内判断块、可被 Dataview 聚合的 frontmatter。
- **[建议模式](docs/user-guide.md#建议模式默认)**：默认只给建议不动文件，你点「接受」才移动。
- **[组织方式预设](docs/user-guide.md#组织方式预设)**：内置极简收件箱 / PARA / 卡片盒 / GTD / 约翰尼十进制 / LYT 六套分类方案。
- **[自动分流](docs/user-guide.md#用法)**：收件箱批量处理，可设延迟与确认。
- **[安全边界](docs/user-guide.md#安全边界)**：永不删除文件；双门槛才自动移动；自动分流默认关闭。

## 安装

在 Obsidian 中打开 **设置 → 第三方插件 → 浏览**，搜索 `JEV Inbox Router`，安装并启用。

手动安装：从 [最新版本](https://github.com/liyifan2004/obsidian-jev-inbox-router/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`，放入 `.obsidian/plugins/jev-inbox-router/` 后重新加载 Obsidian。

首次使用需要在设置页填入 TypeSafe 的 API Key（[获取地址](https://console.typesafe.ai/settings/keys)）。

## 文档

- [使用指南](docs/user-guide.md) —— 完整说明：用法、配置、安全边界、已知限制
- [更新日志](https://github.com/liyifan2004/obsidian-jev-inbox-router/releases)
- [问题反馈](https://github.com/liyifan2004/obsidian-jev-inbox-router/issues)

## 隐私

每次判断会把笔记正文（最多 6000 字）发送给 TypeSafe。插件自己写的判断块与 `jev-*` 字段不会发出去。细节见[使用指南](docs/user-guide.md#已知限制)。

## 许可证

[MIT](LICENSE)
