# web-research

Token-efficient web research for Claude Code.

When the main conversation calls WebSearch or WebFetch directly, every result and every page summary lands in its context and is paid for again on each following turn, at the main model's price. This plugin moves research into small Haiku subagents that work within explicit limits and return only a tight answer with sources (or save a long result to a file and return the path).

| Agent | Tools | Use for |
|---|---|---|
| `web-research:researcher` | WebSearch, WebFetch | Most questions. Fast and cheap. |
| `web-research:browser-researcher` | Real Chromium browser (Playwright MCP), WebSearch | Pages that render content with JavaScript; content behind clicks, tabs, pagination or search forms; cookie walls; sites where WebFetch returns empty or blocked content; sites that need a login. |

## Installation

```text
/plugin marketplace add SatoryBG/Claude-Helper
/plugin install web-research@satory-claude-helper
/web-research:install
```

| Agent | Needs |
|---|---|
| researcher | nothing |
| browser-researcher | Node.js 20+ and Playwright Chromium |

`/web-research:install` installs the browser-researcher's dependencies:

| System | How Node.js is installed |
|---|---|
| WSL / Debian / Ubuntu | NodeSource apt repo |
| macOS | Homebrew |
| Windows (Git Bash) | winget, then restart Claude Code and run the installer again |

After Node.js, the installer adds the Chromium build that matches the pinned Playwright MCP version, plus its system libraries on Linux. Restart Claude Code afterwards.

Without Node.js the plain researcher still works. Only the `playwright` server shows as failed in `/mcp`.

## How it works

| Part | What it does |
|---|---|
| `researcher` agent | Searches with as few requests as possible. Picks sources from snippets, fetches pages in parallel with narrow questions, flags contradictions, answers in the language of the request. |
| `browser-researcher` agent | Opens pages in headless Chromium. Reads visible text through `browser_evaluate`, which costs several times less than accessibility snapshots, and takes snapshots only when it has to click or type. Never submits forms that buy, sign up, send or post, and never enters credentials. |
| `playwright` MCP server | `@playwright/mcp`, pinned in `scripts/playwright-mcp.version`. Uses a persistent profile in `~/.cache/web-research/browser-profile`. Temporary output goes to `~/.cache/web-research/output` and is cleaned after a day. |
| SessionStart hook | Adds the delegation rules to every session (do not search directly, try the researcher before the browser, always pass limits, parallelize independent subtopics, save reusable results to a file). Costs about 300 tokens per session. |
| PreToolUse hook (optional) | When `enforce` is on, blocks WebSearch, WebFetch and the browser tools in the main conversation and tells Claude to delegate. Subagents are never blocked. |

## Options

| Option | Default | Effect |
|---|---|---|
| `enforce` | off | Block direct web and browser tools in the main conversation. When off, the rules are instructions only. |
| `browser_headed` | off | Show the browser window instead of running headless. Use it to log in to a site once. |

Ways to change an option:

- In Claude Code: `/plugin configure web-research@satory-claude-helper`. The options are also listed in `/config`.
- From a terminal:
  ```bash
  echo '{"enforce": "true", "browser_headed": "false"}' | claude plugin configure web-research@satory-claude-helper --values-stdin
  # values are strings: "true" or "false"
  ```
- At install time: `claude plugin install web-research@satory-claude-helper --config enforce=true`.

The values are stored under `pluginConfigs` in `settings.json`. An unset option counts as off. Restart Claude Code after changing an option.

### Sites that need a login

1. Turn `browser_headed` on and restart Claude Code.
2. Ask for something on the site. The browser opens in a visible window. On WSL this needs WSLg.
3. Log in by hand in that window.
4. Turn `browser_headed` off again and restart.

The session stays in the persistent profile, so later headless runs are logged in. The agent itself never types credentials.

## Example requests

What Claude sends to the agents:

```text
Question: What are the current prices of the Microsoft 365 Business Premium and E3 plans in EUR?
Limits: max 3 searches, max 2 opened pages, answer up to 150 words.
```

```text
Question: List the current open positions on the careers page and their locations.
Start URL: https://example.com/careers (the list is loaded with JavaScript)
Limits: max 3 pages, max 5 interactions, answer up to 200 words.
```

## Files

```text
web-research/
├── .claude-plugin/plugin.json      # options: enforce, browser_headed
├── .mcp.json                       # playwright MCP server
├── agents/
│   ├── researcher.md               # WebSearch/WebFetch agent (Haiku)
│   └── browser-researcher.md       # real-browser agent (Haiku)
├── hooks/hooks.json                # SessionStart + PreToolUse
├── skills/install/SKILL.md         # /web-research:install
└── scripts/
    ├── rules.md                    # delegation rules injected at session start
    ├── session-start.sh
    ├── enforce.sh                  # blocks main-thread web tools when enforce is on
    ├── playwright-mcp.sh           # starts the MCP server (headless unless browser_headed)
    ├── playwright-mcp.version      # pinned @playwright/mcp version
    └── install-browser.sh          # Node.js + Chromium installer
```

To move to a newer Playwright MCP:

1. Change `scripts/playwright-mcp.version`.
2. Run `/web-research:install` again, so the matching Chromium build is installed.
3. Bump the plugin version.

## Changelog

- **1.1.0** - browser-researcher agent:
  - real Chromium through a pinned Playwright MCP (0.0.83);
  - text-first reading through `browser_evaluate`;
  - `browser_headed` option for one-time logins;
  - `/web-research:install`;
  - enforcement now also covers the browser tools.
- **1.0.1** - author name corrected to Ivailo Tanusheff.
- **1.0.0** - first release: researcher agent, rules injected at session start, optional enforcement.
