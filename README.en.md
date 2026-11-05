# JEV Inbox Router

**English** | [简体中文](README.md)

<p align="center"><b>Uses JEV to decide "which category does this note belong to", then routes it to the matching folder. It never writes any content for you.</b></p>

[![Release](https://img.shields.io/github/v/release/liyifan2004/obsidian-jev-inbox-router?style=flat-square)](https://github.com/liyifan2004/obsidian-jev-inbox-router/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Obsidian plugin](https://img.shields.io/badge/Obsidian-Plugin-purple?style=flat-square)](https://obsidian.md)

## Features

- **[Categories & destinations](docs/user-guide.en.md#what-it-does)**: six configurable categories (A Permanent knowledge / B Product ideas / C To research / D To-do / E Reference material / F Should be deleted), each with its own target folder.
- **[How results are presented](docs/user-guide.en.md#how-results-are-presented)**: status bar suggestion, in-note judgment block, Dataview-aggregatable frontmatter.
- **[Suggest mode](docs/user-guide.en.md#suggest-mode-default)**: by default nothing moves until you click "Accept".
- **[Organization presets](docs/user-guide.en.md#organization-presets)**: six built-in category schemes (Minimal Inbox / PARA / Zettelkasten / GTD / Johnny Decimal / LYT).
- **[Auto-routing](docs/user-guide.en.md#usage)**: batch-process the inbox with a configurable delay and confirmation.
- **[Safety boundaries](docs/user-guide.en.md#safety-boundaries)**: never deletes files; double gate before auto-move; auto-routing off by default.

## Installation

In Obsidian, open **Settings → Community plugins → Browse**, search for `JEV Inbox Router`, install and enable it.

Manual installation: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/liyifan2004/obsidian-jev-inbox-router/releases/latest), drop them into `.obsidian/plugins/jev-inbox-router/`, then reload Obsidian.

On first use, paste your TypeSafe API key into the settings page ([get one here](https://console.typesafe.ai/settings/keys)).

## Documentation

- [User guide](docs/user-guide.en.md) — the full story: usage, configuration, safety boundaries, known limitations
- [Changelog](https://github.com/liyifan2004/obsidian-jev-inbox-router/releases)
- [Issue tracker](https://github.com/liyifan2004/obsidian-jev-inbox-router/issues)

## Privacy

Each judgment sends the note body (up to 6000 characters) to TypeSafe. The judgment block and `jev-*` fields written by the plugin are never sent. Details in the [user guide](docs/user-guide.en.md#known-limitations).

## License

[MIT](LICENSE)
