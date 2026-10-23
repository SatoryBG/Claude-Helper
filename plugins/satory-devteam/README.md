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
| `/satory-devteam:request [what you found or want]` | A new input at any time - a defect, a change, an idea: the analyst puts it into the SPEC, the architect into the architecture and the plan. No restart of a running build. |
| `/satory-devteam:release [version]` | Production after explicit approval. Production gets the same Docker image that passed staging. |

## Agents

`satory-devteam:dev`, `satory-devteam:devops`, `satory-devteam:reviewer`, `satory-devteam:qa`,
`satory-devteam:ui-reviewer`, `satory-devteam:security`, `satory-devteam:docs`, `satory-devteam:auditor`
(milestone review), `satory-devteam:planner` (tasks for answered questions) and `satory-devteam:runner`
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

## Questions for the user

Gaps in the data rules - what the SPEC does not say, what Dev decided on its own, what is defined but not
enforced or not tested - are collected as questions and **never stop the work**. You answer them with
`/satory-devteam:status` whenever it suits you. They come from three places:
- **before the SPEC is approved** - the analyst goes through every entity and editable field (edits
  after records exist, chronology, balances, duplicates, implausible values) and asks you;
- **in every task** - Dev lists the product behaviour it chose without the SPEC (`decision`), the Reviewer
  and QA list the gaps they notice (`question`);
- **after every milestone** - `satory-devteam:auditor` reviews the data rules across everything built so
  far: questions, Dev's decisions to confirm, rules that are not enforced (`fix`) or not tested (`test`).
  Turn it off with `"milestone_review": false` in `.satory/project.json`.

Open `critical` questions hold the build at the next milestone boundary: the milestones already started
are finished, but no new one starts until the critical questions are answered, so nothing is built on top
of data rules that may change. The summary of the build says so. Turn it off with
`"critical_questions_gate": false`.

Each item has a severity (`critical` - numbers or data can silently become wrong; `major`; `minor`) and
options with a recommended one. Answers that change the requirements go into the SPEC; those that need
code become tasks automatically: between two tasks (and when it starts) the build runs the read-only
`satory-devteam:planner`, and `satory plan add` puts its tasks ahead of the work that builds on them and
marks the questions `planned` or, when the answer keeps the current behaviour, `resolved`. `/satory-devteam:release` warns about open critical
questions. The register is `.satory/questions.json`, readable as `docs/QUESTIONS.md`; while a task runs,
new items wait in `.satory/run/` and are written on main at the next task finish.

## Requests while the work runs

`/satory-devteam:request` takes anything new from you at any time: a defect you found while trying the
app, a change to something built, a new idea. It runs the analyst first (clarifying questions, the data
rules pass, new or changed acceptance criteria in the SPEC with a version bump), then the architect (fit
with the architecture and ADRs, and where it goes: a fix ahead of everything still to do, an addition to
a task still to do, or tasks in a later or new milestone - you choose, done tasks are never changed).
The request is tracked in the register (`kind: request`).

`main` changes only between two tasks, as in a real team: the task in progress is finished against the
specification it started with, and everything new waits. The request's documents (SPEC, architecture,
ADRs, UI guide) are written on their own branch (`satory queue begin`), and `satory queue add` puts them
together with the plan change into `.satory/run/queue/`. The build applies the queue at the next
boundary between two tasks, in order, before the planner: it merges the branch, then changes the plan
(tasks for a later milestone go after that milestone's tasks). With no task running, on a clean main, it
is applied at once - no restart either way. A change that conflicts with what a task changed stays in
the queue (with the ones after it) and is reported. `task finish` and `task block` refuse to touch main
when it changed while the task ran; running the build again rebases the task and goes on.
`/satory-devteam:status` writes the SPEC changes from your answers the same way.

`docs/PLAN.md` shows where each task comes from in the column **Source**: `plan` (the architect's plan),
`request Q-027` (a request), `M3 review Q-014` (a milestone review), `T-032 Q-033` (found by Dev, the
Reviewer or QA in that task) or `flaky test Q-037`; a task planned before and extended later reads
`plan + request Q-029`. It comes from the question ids in each task's `questions` (and `questions_add`
of an extension). A plan change can also only name them, for any task: `"links": [{"task": "T-034",
"questions": ["Q-029"]}]` (`"extended": true` for an extension). `plan json` returns it as `source`.

## Flaky e2e tests

With `commands.e2e_retry` in `.satory/project.json` (for Playwright:
`cd e2e && npx playwright test --last-failed --reporter=line`), an e2e check that fails runs only the
failed tests once more. If they pass, the check passes and the task goes on; each such test goes to the
register of questions as a `minor` `test` item ("Flaky e2e test: ..."), and a test flaky 3 times becomes
`major` (and reopens if it was dismissed). A real regression fails again and sends the task back as before.
The retry runs only when few tests failed: at most `e2e_retry_max_percent` of the tests in the run
(default 3 %, at least 1 test) - more failures are not flakiness.

## Experimental settings

Trial settings live in an `"experimental"` block of `.satory/project.json`. The workflow lists the ones
that are on when it starts; delete the key (or the whole block) to go back to the normal behaviour.

- **`e2e_task_first`** - QA's check runs only the current task's e2e tests (commands below; `{task}`
  becomes the task id). The whole e2e suite runs once, after Review, QA, UI and Security have passed and
  before Docs, so the rounds sent back by QA or the UI reviewer are much shorter. A task is never finished
  without a green whole suite. If it fails there, the task goes back to Dev and the next round runs the
  whole suite already in QA's check, so UI and Security do not review a build with a known regression.
  Regressions in earlier features are found later than without this setting. Example for Playwright (the
  QA agent puts the task id in every test title):

  ```json
  "experimental": {
    "e2e_task_first": ["cd e2e && npx playwright test --reporter=line --grep \"{task}|@smoke\""]
  }
  ```

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
agents/           dev, devops, reviewer, qa, ui-reviewer, security, docs, auditor, planner, runner
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
docs/QUESTIONS.md       questions for the user (generated from .satory/questions.json)
.satory/project.json    commands for build/test/e2e/security, UI review and deploy
.satory/run/            working files (gitignored): logs, state, captured output of long steps (sh/)
```

## Changelog

- **0.8.6** - the column **Source** in `docs/PLAN.md` (and `source` in `plan json`): the plan, a request, a
  milestone review, a task's Dev/Reviewer/QA or a flaky test, with the question ids; extensions of a task
  planned before after a `+`. A plan change takes `links` to name where existing tasks come from.
- **0.8.5** - the answered questions are planned again: `question list` grew past what an agent's tool
  output carries, so the planning between two tasks (and the register note and the milestone review)
  failed without a sign. `question list` is now small by default (open items in full, answered ones with
  the answer and refs, the rest by id, status and title); `--status a,b` filters, `--brief` shows only
  the identifying fields, `--full` everything. The planner reads the scenarios in `docs/QUESTIONS.md`.
- **0.8.4** - fewer duplicate questions and all in the documentation language: Dev, the Reviewer and QA
  get the items already in the register with each round and are told not to report them again, even
  reworded; the task context names the documentation language (`plan json` returns `language`), which
  every question uses. `/satory-devteam:status` asks the same question from several items once.
- **0.8.3** - a plan change can depend on the task that covers a question (`"depends_on": ["Q-028"]`,
  also in `depends`), e.g. on a task another queued change adds; `queue add` checks a change against the
  plan as it will be after the changes already waiting in the queue.
- **0.8.2** - queued changes build on each other: `queue begin` starts the new branch from the last queued
  one, and `queue apply` merges each with a merge commit (not a squash), so two queued edits of the same
  document (e.g. SPEC v4 and v5) merge in order without a conflict.
- **0.8.1** - `main` changes only between two tasks. New `satory queue begin|add|list|apply`: the
  documents of a change are written on their own branch and wait in `.satory/run/queue/` with the plan
  change; the build merges and applies them in order at the next task boundary (or at once on a clean
  main). `/satory-devteam:request`, `/satory-devteam:status` (SPEC changes from answers) and the
  architect's replanning during a build use it. `task finish` and `task block` refuse when main changed
  while the task ran, instead of reading main's plan (0.8.0); running the build again rebases the task.
  Replaces `plan add --queue` / `plan apply-queue` of 0.8.0.
- **0.8.0** - new `/satory-devteam:request` for input from the user at any time (defects, changes,
  ideas): analyst, then architect, then a plan change. `satory plan add` also adds milestones, extends
  tasks still to do (`updates`) and places tasks for a later milestone after that milestone; with
  `--queue` it waits in `.satory/run/plan-queue/` while a task runs and the build applies it at the next
  task boundary (`satory plan apply-queue`, before the planner). Fix: `task finish` and `task block` read
  the plan from main after switching to it, so a plan change made on main while a task ran is no longer
  overwritten. New register kind `request`.
- **0.7.3** - the default limit for retrying failed e2e tests (`e2e_retry_max_percent`) is 3 % of the
  run instead of 1 %.
- **0.7.2** - flaky e2e tests no longer cost a round: with `commands.e2e_retry` the failed tests of an
  e2e check run once more when at most `e2e_retry_max_percent` (default 1 %) of the run failed; passing
  on the retry passes the check and records the test as flaky in the register (`minor`, `major` after 3
  times). The journal and the build log name the flaky tests.
- **0.7.1** - QA runs the unit tests and the e2e tests it added or changed, no longer the whole e2e
  suite: the orchestrator runs that right after QA (and again before the task finishes with
  `e2e_task_first`), so the whole suite no longer ran twice per round (about 20 minutes saved per
  round at ~950 e2e tests).
- **0.7.0** - a new approach to the user's decisions: they no longer stop the work. Gaps in the data
  rules are collected as questions (analyst before the SPEC, Dev, Reviewer and QA in every task, the
  `auditor` after every milestone), the user answers them with `/satory-devteam:status` whenever it suits
  them, the answers go into the SPEC and the `planner` turns them into tasks between two tasks of the
  build. Only open critical questions hold the start of a new milestone. Includes 0.6.0-0.6.2; no other
  changes since 0.6.2.
- **0.6.2** - answered questions become tasks automatically: between two tasks (and when the build
  starts on main) the new read-only `planner` agent plans them, and the new `satory plan add` inserts
  the tasks ahead of the work that builds on them, adds dependencies to tasks still to do and marks the
  questions `planned` or `resolved` (new status for answers that keep the current behaviour).
  `plan json` returns the milestones.
- **0.6.1** - open critical questions keep the next milestone from starting (the started milestones are
  finished); the build summary reports `waiting_for_answers`. Off with `"critical_questions_gate": false`.
- **0.6.0** - questions for the user that never stop the work (see "Questions for the user"): the
  analyst's data rules pass before the SPEC is approved; Dev's `assumptions` and the Reviewer's and QA's
  `spec_gaps` in every task; the new `auditor` agent reviews each finished milestone (also milestones
  finished before the upgrade, at the next build). New `satory question add|list|answer|plan|reviewed|flush`,
  the register in `.satory/questions.json` and `docs/QUESTIONS.md`, `/satory-devteam:status` walks through
  the open items, the build summary counts them and the release warns about critical ones.
- **0.5.2** - `step after-qa` splits the e2e tests only when the workflow says it runs `full-e2e`
  (`--split-e2e`): a workflow started with an older script keeps running the whole suite in QA's check
  instead of finishing a task without it.
- **0.5.1** - `e2e_task_first` runs the whole e2e suite once, in the new step `full-e2e` after
  Security and before Docs, instead of in every round whose task tests pass. A failure there sends the
  task back to Dev, and the next round runs the whole suite in QA's check again.
- **0.5.0** - experimental `e2e_task_first` setting (see "Experimental settings"): QA's check runs
  the current task's e2e tests first and the whole suite only when they pass. Off unless set in
  `.satory/project.json`; the journal and Dev's feedback say when only the task's tests ran. The QA
  agent puts the task id in every e2e test title.
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
