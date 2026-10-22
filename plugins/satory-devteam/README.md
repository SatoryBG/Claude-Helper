# satory-devteam - a team of AI agents for software development

A Claude Code plugin. It takes a small software project from the idea to production: you approve the
specification, the plan and the production release, and everything in between runs autonomously.

```
/satory-devteam:analyst ───► SPEC.md ──► ✋ approval
/satory-devteam:architect ─► ARCHITECTURE.md + UI.md + plan ──► ✋ approval
/satory-devteam:build ─────► for every task:
                             Dev → Reviewer → QA → UI reviewer → Security → Docs → commit + push → staging
                             (every send-back starts again from the Reviewer; up to 33 rounds, then escalation)
/satory-devteam:release ───► ✋ approval ──► production
```

## Commands

| Command | What it does |
|---|---|
| `/satory-devteam:setup` | Prepares the machine: tools, git identity, GitHub login. Once per machine. |
| `/satory-devteam:analyst <name or GitHub repo> [idea]` | Interview → `docs/SPEC.md`. Clones a given repo, creates a new private repo or works locally only. |
| `/satory-devteam:architect` | Stack (chosen together with you), architecture, ADRs, UI guide, `.satory/project.json`, task plan. |
| `/satory-devteam:build [milestone=M2] [max=N] [rounds=33]` | Autonomous workflow over the tasks in the plan. Run it again to continue. |
| `/satory-devteam:status` | How far the project has got, the blocked tasks and your answers to them. |
| `/satory-devteam:release [version]` | Production after explicit approval. Production gets the same Docker image that passed staging. |

## Agents

`satory-devteam:dev`, `satory-devteam:devops`, `satory-devteam:reviewer`, `satory-devteam:qa`,
`satory-devteam:ui-reviewer`, `satory-devteam:security`, `satory-devteam:docs` and `satory-devteam:runner`
(a mechanical executor of the CLI; haiku for quick steps, sonnet for the long ones - build, tests,
deploy - because it has to wait for a Bash call that moved to the background).

The rules are enforced by code (`bin/satory`), not only by the instructions:
- Dev cannot touch the tests;
- QA writes only tests and only adds them; no test can ever disappear. A test from an earlier task may
  be adapted only when the current task's requirements contradict it, with a reason in the task file
  ("QA: adapted tests"); it is recorded in the journal;
- the Reviewer, the UI reviewer and Security are read-only;
- the technical writer touches only documentation;
- `docs/JOURNAL.md` is append-only and the agents have no access to it.

## User interface quality

Projects with a UI get two extra safeguards:
- **A shared UI foundation.** The analyst asks about audience, brand, reference products and density; the
  architect picks a component library (as an ADR) and writes `docs/UI.md` - design tokens, app shell,
  shared components, empty/loading/error states, content rules, viewports and accessibility rules. Task
  T-002 builds that foundation, and every UI task builds on it.
- **A UI reviewer in every round.** After QA passes, `satory-devteam:ui-reviewer` opens the app on
  staging, takes screenshots at mobile, tablet and desktop widths, runs an axe accessibility scan and
  checks the result against `docs/UI.md`. Blocker/major findings send the task back to Dev. QA also adds
  permanent axe and no-horizontal-scroll e2e tests for every new page.

It is enabled with `"ui": { "review": true }` in `.satory/project.json`; per task, `"ui": false` in the
plan skips it.

## Installation

```text
/plugin marketplace add SatoryBG/Claude-Helper
/plugin install satory-devteam@satory-claude-helper
/satory-devteam:setup
```

`/satory-devteam:setup` installs the dependencies (Ubuntu/Debian, including WSL2) and checks the machine:

| Needs | Why |
|---|---|
| git, gh (logged in with the `repo` and `workflow` scopes) | branches, commits, pushes, new repos |
| python3 3.10 or newer | the `satory` CLI |
| Docker + Compose | local staging and prod |
| Node.js + npm, Playwright Chromium | e2e tests, QA exploration, the UI reviewer |
| gitleaks, semgrep (optional) | security scans |
| .NET SDK (optional, skip with `--no-dotnet`) | .NET projects |

## Updating

```text
/plugin marketplace update satory-claude-helper
/plugin update satory-devteam@satory-claude-helper
```

The new version is loaded in the next Claude Code session.

The plugin's `.gitattributes` enforces LF line endings (the bash and python scripts break with CRLF). The
CLI is called through `python3`, so it does not depend on the executable bit, which is lost on a Windows
file system.

## Structure

```
.claude-plugin/   plugin.json
skills/           setup, analyst, architect, build, status, release
agents/           dev, devops, reviewer, qa, ui-reviewer, security, docs, runner
bin/satory        CLI (python3): plan, file guards, checks, journal, merge/push, deploy
workflow/         satory-build.js - the orchestrator (Workflow script)
templates/        SPEC, ARCHITECTURE, UI, ADR, task, project.json, plan.json, CHANGELOG, JOURNAL
scripts/          install-prereqs.sh
```

## In every project

```
docs/SPEC.md            requirements (R-xxx) and acceptance criteria (AC-xxx)
docs/ARCHITECTURE.md    architecture; docs/adr/ - decisions
docs/UI.md              UI guide (projects with a UI)
docs/PLAN.md            generated from .satory/plan.json
docs/tasks/T-xxx.md     task: Dev mini-spec, QA coverage, disputes, clarifications
docs/JOURNAL.md         history of everything (append-only)
.satory/project.json    commands for build/test/e2e/security, UI review and deploy
.satory/run/            working files (gitignored): logs, state, captured output of long steps (sh/)
```

## Changelog

- **0.4.5** - a long step no longer stops the workflow when its runner returns too early. A step
  that runs longer than the 10-minute Bash limit (e.g. `step after-qa` with the whole e2e suite) moves to
  the background, and the haiku runner sometimes returned right away with no output instead of waiting:
  the workflow stopped with "unparsable output" although the step finished fine. Now:
  - the long steps (`after-dev`, `pre-qa`, `after-qa`, `security-scan`, `task finish`) run on a sonnet
    runner (`runnerLong` in the workflow's models), the quick ones stay on haiku;
  - their stdout and exit code are also written to `.satory/run/sh/`; when the runner's answer has no
    result, the new `satory wait <id>` collects it there, in calls of up to 9 minutes (3 hours in total),
    and reports a step that never started or died. A step is still never run twice;
  - `satory workflow` empties `.satory/run/sh/` before each run.
- **0.4.4** - The runner returns its result only after the Bash result has arrived. Before, a runner
  could answer in the same message as the Bash call with a placeholder, so the workflow stopped with
  "unparsable output" although the command had run.
- **0.4.3** - QA can adapt a test from an earlier task when the current task's requirements
  contradict it (e.g. a placeholder page that became a real one). Before, the add-only guard restored
  every changed line of an earlier test file, so such a task could never pass. QA lists each adapted file
  with the reason in the new "QA: adapted tests" section of the task file; unlisted changes are still
  restored, an adapted file may not lose lines, test names must stay, and every adaptation is recorded in
  the journal. Dev disputes such tests instead of blocking with a question.
- **0.4.2** - the runner that executes the `satory` steps calls Bash with the maximum timeout
  (600 s) instead of the 120 s default: on a slow file system (e.g. WSL `/mnt/c`) `step after-dev`
  (build + lint) ran past 120 s, moved to the background and the workflow stopped with
  "unparsable output". The default limit of rounds per task is now 33 (was 7).
- **0.4.1** - the CLI works on Python 3.10-3.12 again: the file guards used `PurePath.full_match`
  (Python 3.13+) and crashed in `step after-dev` on Ubuntu 24.04 (Python 3.12). The glob matching is now
  built in and behaves the same on every version; `doctor`, `setup` and the CLI itself report a python3
  older than 3.10.
- **0.4.0** - English and UI quality:
  - everything (agents, skills, templates, CLI messages, workflow) is in English; each project's
    documentation language is still set by `language` in `.satory/project.json`;
  - UI foundation: the analyst asks about look and feel, the architect picks a component library and
    writes `docs/UI.md`, task T-002 builds the shared shell and components;
  - new `ui-reviewer` agent between QA and Security: screenshots at three viewports, axe scan, checks
    against `docs/UI.md`;
  - QA adds permanent axe and no-horizontal-scroll tests for new pages;
  - the architect asks for the preferred stack instead of assuming .NET;
  - moved into the `satory-claude-helper` marketplace.
- **0.3.0** - renamed from `satory` to `satory-devteam`.
- **0.2.1** - the CLI runs through `python3`, LF line endings enforced.
- **0.2.0** - first release: analyst, architect, autonomous build workflow, status, release.
