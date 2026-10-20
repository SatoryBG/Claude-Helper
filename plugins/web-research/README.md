# web-research

Token-efficient web research for Claude Code.

When the main conversation calls WebSearch or WebFetch directly, every result and every page summary lands in its context and is paid for again on each following turn, at the main model's price. This plugin moves research into a small subagent:

- **`web-research:researcher`** runs on Haiku with only WebSearch, WebFetch and Write.
- It works within explicit limits: max searches, max opened pages and answer length in words.
- It returns only a tight answer with sources, or saves a long result to a file and returns the path.

The main conversation sees a few hundred words instead of raw search output.

## Installation

```text
/plugin marketplace add SatoryBG/Claude-Helper
/plugin install web-research@satory-claude-helper
```

No external dependencies.

## How it works

| Part | What it does |
|---|---|
| `researcher` agent | Searches with as few requests as possible: picks sources from snippets, fetches pages in parallel with narrow questions, flags contradictions, answers in the language of the request. |
| SessionStart hook | Adds the delegation rules to every session (do not search directly, always pass limits, parallelize independent subtopics, save reusable results to a file). Costs about 150 tokens per session. |
| PreToolUse hook (optional) | When the `enforce` option is on, blocks WebSearch and WebFetch in the main conversation and tells Claude to delegate. Subagents are never blocked. |

## Turning enforcement on or off

The plugin has one option, `enforce`:

| Value | Behavior |
|---|---|
| off (default) | The rules are instructions only. Claude follows them, but nothing stops a direct search. |
| on | Direct WebSearch/WebFetch in the main conversation is blocked with a message to use the researcher. |

Ways to change it:

- In Claude Code: `/plugin configure web-research@satory-claude-helper`. The option is also listed in `/config` as "Block direct web tools in the main conversation".
- From a terminal:
  ```bash
  echo '{"enforce": "true"}' | claude plugin configure web-research@satory-claude-helper --values-stdin
  # values are strings: "true" or "false"
  ```
- At install time: `claude plugin install web-research@satory-claude-helper --config enforce=true`.

The value is stored under `pluginConfigs` in `settings.json`. An unset option counts as off. Restart Claude Code (or start a new session) after changing it.

## Example request

What Claude sends to the agent:

```text
Question: What are the current prices of the Microsoft 365 Business Premium and E3 plans in EUR?
Limits: max 3 searches, max 2 opened pages, answer up to 150 words.
```

## Files

```text
web-research/
├── .claude-plugin/plugin.json      # includes the "enforce" option
├── agents/researcher.md            # the research agent (Haiku)
├── hooks/hooks.json                # SessionStart + PreToolUse
└── scripts/
    ├── rules.md                    # delegation rules injected at session start
    ├── session-start.sh
    └── enforce.sh                  # blocks main-thread web tools when enforce is on
```

## Changelog

- **1.0.0** - first release: researcher agent, rules injected at session start, optional enforcement.
