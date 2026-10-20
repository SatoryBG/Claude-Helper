---
name: md-to-html
description: Saves a document as a pair of files - Markdown (the source, cheap to write and to read in later sessions) and HTML (for people), generated from the MD by a script with no LLM tokens. Use whenever the user asks to save something as a document, report, procedure, guide or runbook, wants "text and HTML" / "an HTML version", or wants an existing .md converted to HTML. Works for any document language; Bulgarian and English UI labels are built in.
---

# md-to-html: MD + HTML documents

Write **only the Markdown file**. The HTML is generated from it by a script (pandoc + template + Lua filters) at zero token cost. Never write or edit the HTML by hand. In later sessions read the `.md`, not the `.html`.

## Steps

1. Write `name.md` with front matter (see below), including `html: true`.
2. The PostToolUse hook (on Write/Edit) creates `name.html` in the same folder and regenerates it on every later edit of the MD.
3. If the MD was created another way (Bash, copy) or has no `html: true`, run the converter manually:
   `bash <this skill's base directory>/md2html.sh [-t report|tech] file.md [file2.md ...]`
4. Check with `ls` that the `.html` exists. Do not read it - its content is the same as the MD.
5. If the hook reports that pandoc is missing, run the `md-to-html:install` skill.

## Front matter

```yaml
---
title: Document title
subtitle: Optional
doctype: Report           # label above the title, e.g. Report, Procedure, Analysis
date: 2026-10-20
author: Name              # optional
tags: [MikroTik, UniFi]   # optional
template: report          # report | tech
html: true                # enables automatic generation by the hook
lang: en                  # language of the document: en, bg, ... (see Language)
toc: true                 # default true; false hides the table of contents
toc-depth: 3              # optional
number-sections: false    # optional, numbers the headings
width: wide               # optional (report): page uses 80% of the window, tables full width
---
```

## Language

- Set `lang` to the language the document is written in (`bg` for Bulgarian, `en` for English). It drives the page UI labels: table of contents, callout titles, table filters, copy button, gantt month names and duration units.
- Without `lang` the language is detected: mostly Cyrillic text gives `bg`, anything else `en`.
- Labels live in `i18n/<lang>.json`. A language without a file falls back to English. To add a language, copy `i18n/en.json` to `i18n/<lang>.json` and translate it.
- Badge keywords (severity, task status) are recognized in every language that has a file, regardless of the document language: `[Critical]{.sev}` and `[Критичен]{.sev}` both work.

## Choosing a style

- **report** - for people who read and decide: reports, audits, analyses, recommendations, summaries. Narrow column, classic typography, table of contents in a box after the header.
- **tech** - for people who execute: configurations, commands, procedures, runbooks, references. Sticky side table of contents, a copy button on every code block.

When both kinds are produced back to back (e.g. a findings report and a remediation procedure), make **two separate MD files**, each with its own `template`. `-t` can force a style, but it overwrites the same output HTML - prefer separate files.

## Markdown conventions

- The document title goes in `title`; the body starts at `##`.
- Callouts: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` (titles are localized by `lang`).
- Code blocks always with a language (`bash`, `python`, `powershell`, `json`, `yaml`...) for highlighting.
- Tables with `|`, tasks with `- [x]` / `- [ ]`, footnotes with `[^1]`.
- Typographic replacements are off: `--` stays `--`. Use only the plain hyphen "-".

## Components

Use them when they carry meaning, not as decoration. The MD stays readable without them.

| Need | MD syntax | Result |
|---|---|---|
| Severity badge | `[Critical]{.sev}`, `[High]{.sev}`, `[Висок]{.sev}` | colored outline badge; class from the text (critical/high/medium/low/info and their translations) |
| Task status | `[Done]{.sev}`, `[In progress]{.sev}`, `[Planned]{.sev}`, `[New]{.sev}` (bg: Направено, В процес, Планирано, Ново) | soft tinted lozenge, Atlassian style: green, blue, grey, purple; a "Tasks" KPI card is neutral; several badges in one cell stay on one line; the same words in `::: kpis` color the cards |
| Score 0-5 | `[3]{.score}`, `[4-5]{.score}` | colored dot (0-1 red, 2 amber, 3 blue, 4-5 green) |
| Number cards | `::: kpis` + list `- **12** Critical` + `:::` | row of cards; color from the label |
| Box | `::: card` ... `:::` | framed section (e.g. metrics per goal, option A/B/C) |
| Columns | `::: cols` with several `::: card` inside | cards side by side, stacked on narrow screens |
| Roadmap / Gantt | ` ```mermaid ` block with `gantt` (dateFormat YYYY-MM-DD; tasks with dates or durations `30d`/`6w`/`3M`, `after id`; tags done/active/crit/milestone) | CSS timeline, no JavaScript, duration on the right |
| Other diagram | ` ```mermaid ` (flowchart, sequence...) | rendered by mermaid.js from a CDN - **needs internet when the HTML is opened** |
| SVG diagram | `![Fig. 1 - description](name.svg)` (SVG next to the MD) | SVG is inlined and inherits the page font; the alt text becomes the caption. Do not set font-family in the SVG |
| Filterable table | `::: {.filterable cols="2,3"}` + table + `:::` | filter buttons for columns 2 and 3, search box, click a header to sort |

Findings report example:

```markdown
::: kpis
- **12** Critical
- **22** High
- **69** Total findings
:::

::: {.filterable cols="2,3"}
| # | Severity | Domain | Issue |
|---|----------|--------|-------|
| 1 | [Critical]{.sev} | Router | PPTP enabled |
:::
```

Plan with task statuses (with `width: wide` in the front matter):

```markdown
::: kpis
- **23** Tasks
- **10** New
- **14** In progress
- **2** Done
:::

| Tasks | Status |
|-------|:------:|
| Removed unneeded admin accounts | [Done]{.sev} |
| Privileged access control | [In progress]{.sev} |
| Multi-factor authentication | [Planned]{.sev} |
| Break-glass account for Microsoft 365 | [New]{.sev} [In progress]{.sev} |
```

Status rules:

- The four statuses are Done, In progress, Planned and New (in Bulgarian: Направено, В процес, Планирано, Ново).
- A new task gets two badges: "New" first, then its execution status. They stay on one line.
- Do not add a separate "Due" column when all tasks share the same due date. The column is "Status".
- The colors follow Atlassian lozenges: soft tinted background with dark text, contrast above 4.5:1 in light and dark mode. Do not replace them with outlined or saturated colors - the user approved this look after the outlined version clashed.

Rare, uniquely designed documents (editorial layout, interactive charts) are out of scope - their HTML is written separately, but the MD remains the source.
