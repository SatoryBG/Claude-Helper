# md-to-html

Documents as a pair of files:

- **`name.md`** - the source. Claude writes only this file. It is cheaper to write and cheaper to read in later sessions.
- **`name.html`** - for people. Generated from the MD by pandoc, a template and Lua filters, **with no LLM tokens**, and always with the same look.

Hand-written HTML costs 2-3 times more output tokens than the MD (tags plus CSS). Here the HTML is free.

## Installation

```text
/plugin marketplace add SatoryBG/Claude-Helper
/plugin install md-to-html@satory-claude-helper
/md-to-html:install
```

`/md-to-html:install` checks for pandoc 3.1.10+ and installs it if missing:

| System | How pandoc is installed |
|---|---|
| WSL / Debian / Ubuntu | .deb from GitHub |
| Other Linux | tar.gz |
| macOS | Homebrew |
| Windows (Git Bash) | winget |

Other dependencies:

- `bash` and `awk` - present wherever Claude Code runs.
- `jq` - optional. Without it the hook uses python3 or sed.

## How it works

1. You ask for a document. Claude loads the `md-to-html` skill and writes `name.md` with front matter that contains `html: true`.
2. A PostToolUse hook catches the write and runs `md2html.sh`, which creates `name.html` next to the MD.
3. Every later edit of the MD regenerates the HTML.

Manual conversion, for example for an MD without `html: true` or for older files:

```bash
bash <plugin>/skills/md-to-html/md2html.sh [-t report|tech] file.md [file2.md ...]
```

## Front matter

```yaml
---
title: Title
subtitle: Optional
doctype: Report           # label above the title
date: 2026-10-20
author: Name
tags: [MikroTik, UniFi]
template: report          # report | tech
html: true                # enables automatic generation
lang: en                  # document language: en, bg, ...
toc: true                 # false hides the table of contents
toc-depth: 3
number-sections: false
width: wide               # report only: page at 80% width, full-width tables
---
```

## Languages

The page UI is localized: table of contents, callout titles, table filters, copy button, gantt month names and duration units.

| `lang` | UI |
|---|---|
| `en` | English |
| `bg` | Bulgarian |
| anything else | English fallback |
| missing | detected from the text: mostly Cyrillic gives `bg`, otherwise `en` |

Badge keywords are recognized in every available language, whatever the document language. `[Critical]{.sev}` and `[Критичен]{.sev}` both produce a critical badge.

**Adding a language:** copy `skills/md-to-html/i18n/en.json` to `<lang>.json` (for example `de.json`) and translate the values. No code changes are needed. A file can also hold only some of the keys - missing ones fall back to English.

## Styles

- **report** - reports, audits, analyses, recommendations. Narrow column, classic typography, table of contents in a box after the header.
- **tech** - configurations, commands, procedures, runbooks. Sticky side table of contents, a copy button on every code block.

Both styles support light and dark mode and printing. The HTML is a single self-contained file with no external dependencies, except for non-gantt mermaid diagrams (see below).

## Markdown syntax

| Need | Syntax |
|---|---|
| Callouts | `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` |
| Severity badge | `[Critical]{.sev}`, `[High]{.sev}`, `[Medium]{.sev}`, `[Low]{.sev}`, `[Info]{.sev}` |
| Task status | `[Done]{.sev}`, `[In progress]{.sev}`, `[Planned]{.sev}`, `[New]{.sev}` |
| Score 0-5 | `[3]{.score}`, `[4-5]{.score}` |
| Number cards | `::: kpis` + list `- **12** Critical` + `:::` |
| Box | `::: card` ... `:::` |
| Side-by-side cards | `::: cols` with several `::: card` inside |
| Roadmap | ` ```mermaid ` block with `gantt`, rendered as CSS bars without JavaScript |
| Other diagrams | ` ```mermaid ` (flowchart and others), rendered by mermaid.js from a CDN |
| SVG diagram | `![Fig. 1 - description](fig.svg)`, inlined so it inherits the page font |
| Filterable table | `::: {.filterable cols="2,3"}` + table + `:::` |
| Tasks | `- [x]` / `- [ ]` |
| Footnotes | `[^1]` |

The full reference for Claude is in [skills/md-to-html/SKILL.md](skills/md-to-html/SKILL.md).

## Limitations

- Non-gantt mermaid diagrams need internet access when the HTML is opened.
- All documents of one style share the same layout. Documents with a unique editorial design or interactive charts are out of scope.
- Typographic replacements are off: `--` stays `--`.

## Files

```text
md-to-html/
├── .claude-plugin/plugin.json
├── hooks/hooks.json                 # PostToolUse -> hook.sh
└── skills/
    ├── md-to-html/
    │   ├── SKILL.md                 # instructions for Claude
    │   ├── md2html.sh               # MD -> HTML converter (pandoc)
    │   ├── hook.sh                  # catches .md files with html: true
    │   ├── templates/doc.html       # pandoc HTML template
    │   ├── styles/                  # base, components, report, tech
    │   ├── filters/                 # callouts.lua, components.lua, i18n.lua
    │   └── i18n/                    # en.json, bg.json - UI labels and badge keywords
    └── install/
        ├── SKILL.md                 # /md-to-html:install
        └── scripts/install-pandoc.sh
```

## Changelog

- **1.0.1** - author name corrected to Ivailo Tanusheff.
- **1.0.0** - first release as a plugin:
  - report and tech styles;
  - components: badges, task statuses, scores, KPI cards, boxes, columns, gantt, SVG figures, filterable tables;
  - multilingual UI with language detection;
  - hook without a hard jq dependency;
  - pandoc installer.
