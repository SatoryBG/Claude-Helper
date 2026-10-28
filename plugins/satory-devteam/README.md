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

What reaches GitHub (`origin`) and when: the task's branch `satory/T-…` after every step of a round
(Dev, QA, Docs, a block - a copy of the work in progress, forced since resuming rebases it; CI runs only
on `main`); `main` when a task is finished (the branch on GitHub is then deleted), and after every change
between two tasks (a queued request or answer, the planner's new tasks). A failed push never stops the
work; `task finish` reports it as `push_error`. `"push_task_branch": false` in `.satory/project.json`
keeps the task branches local.

## Commands

| Command | What it does |
|---|---|
| `/satory-devteam:setup` | Prepares the machine: tools, git identity, GitHub login. Once per machine. |
| `/satory-devteam:analyst <name or GitHub repo> [idea]` | Interview → `docs/SPEC.md`. Clones a given repo, creates a new private repo or works locally only. |
| `/satory-devteam:architect` | Stack (chosen together with you), architecture, ADRs, UI guide, `.satory/project.json`, task plan. |
| `/satory-devteam:build [milestone=M2] [max=N] [rounds=33]` | Autonomous workflow over the tasks in the plan. Run it again to continue. |
| `/satory-devteam:status` | How far the project has got, the blocked tasks and your answers to them. |
| `/satory-devteam:request [what you found or want]` | A new input at any time - a defect, a change, an idea: the analyst puts it into the SPEC, the architect into the architecture and the plan. No restart of a running build. |
| `/satory-devteam:design [brief \| show \| use <direction>]` | A new design of the app as a UX consultant makes it - audit, directions as mockups, every page designed, the tasks that build it; the build runs it at the next boundary. `show` shows the result. |
| `/satory-devteam:release [version]` | Production after explicit approval. Production gets the same Docker image that passed staging. |

## Agents

`satory-devteam:dev`, `satory-devteam:devops`, `satory-devteam:reviewer`, `satory-devteam:qa`,
`satory-devteam:ui-reviewer`, `satory-devteam:security`, `satory-devteam:docs`, `satory-devteam:auditor`
(milestone review of the data rules), `satory-devteam:code-health` (milestone review of the code), `satory-devteam:ux-review` (milestone review of the UX of the whole app), `satory-devteam:designer` (the design of the app: directions, mockups, design document),
`satory-devteam:planner` (tasks for answered questions) and `satory-devteam:runner`
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

## Following the progress

The CLI writes one line per event to `.satory/run/progress.log` (gitignored): a task starts, a stage of
a round ends with its verdict, a task is done or blocked, new questions, plan and queue changes.
- `/satory-devteam:build` follows that file with a monitor and reports each event in the conversation in
  a short line, while the session is open.
- `satory statusline` turns it into the Claude Code status line, e.g.
  `satory 29/41 · ▶ T-014 r3 · 17:40 ✓ T-014 r3 e2e: pass · ❓3 · 🗂1` (tasks done, the task and round in
  progress, the last event, open questions, queued changes). `/satory-devteam:setup` offers to add it
  to `~/.claude/settings.json`; outside a satory project it prints nothing. The text is bright cyan;
  `SATORY_STATUSLINE_COLOR` sets another SGR code (e.g. `97` white, `""` for the terminal's own).
- `/satory-devteam:status` shows the last events too.

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

The code is reviewed for reuse the same way. Dev looks for an existing function, component or query
before writing one and extends it rather than copying it; the Reviewer searches the whole code base for
what a change duplicates (a near copy of existing logic is `major`), the efficiency - above all the
database queries (N+1, work done in memory instead of the database, whole entities instead of
projections, tracking on reads, missing indexes, writes without a transaction, unbounded lists), then the
code (streams, async, HTTP clients) and the UI (re-fetches, waterfalls, cache keys) - the naming
(identifiers in English, never another language in Latin letters, one name per concept) and the
robustness (errors, resources, logs, magic values); QA reuses the test helpers. After
every milestone `satory-devteam:code-health` reviews the whole code base for duplicated logic,
inefficient code, naming, dead code and inconsistencies that slipped through, and its findings become one refactoring task (one
subtask per finding, behaviour unchanged) ahead of the work still to do. Turn that off with
`"code_health_review": false`.

The user experience is reviewed as well, not only the conformance to `docs/UI.md`. Dev designs a page
before building it (the user's main question, the presentation chosen and why, in the mini-spec) and
prefers charts, bars, heat strips or cards for comparisons and patterns over wide tables. The UI reviewer
judges each changed page as its user: a page that works but is hard to read or use is `major`, with a
concrete better design that Dev builds in the same task and writes into `docs/UI.md`. After every
milestone of an app with a UI on staging, `satory-devteam:ux-review` walks every page, menu and dialog;
its findings become one improvement task, done without asking (comment if you disagree). It runs in two
passes: the proposals, then a critique as a senior product designer that improves, replaces or drops each
one; both use the session's design skills (e.g. `dataviz`) when available. When finished milestones were never UX-reviewed (a project started with an older plugin), one review
runs by itself at the next boundary; `/satory-devteam:build uxReview=true` asks for one more now. Turn it off with
`"ux_review": false`.

The app is designed as a UX consultant would do it. Once the UI foundation is built (and whenever
`/satory-devteam:design` asks for it), the build runs the design step at a boundary between tasks: an audit of
the running app by usability heuristics and visual quality (`docs/design/AUDIT.md`), 2-3 design directions
as HTML mockups of the dashboard and a detail page (`docs/design/directions/`), a critic's choice of the
strongest (or the user's, with `/satory-devteam:design use <direction>`), every page designed in it
(`docs/design/mockups/`, `docs/design/DESIGN.md`, `docs/UI.md`), a critique and a revision, and the tasks
that build it, ahead of the remaining work. Dev builds each page to its mockup and the UI reviewer checks
it against the mockup. `/satory-devteam:design show` shows the result. Turn it off with
`"design_step": false`.

Nothing the reviews find is lost: the minor and nit findings of the Reviewer and the UI reviewer and the
low/info findings of Security (including its hardening suggestions: headers, CSP, limits, safe
defaults) of every task's passing round are kept in `.satory/run/polish.json` and become one polish task
after the milestone, done without asking. Turn it off with `"polish_task": false`.

Open `critical` questions hold the build at the next milestone boundary: the milestones already started
are finished, but no new one starts until the critical questions are answered, so nothing is built on top
of data rules that may change. The summary of the build says so. Turn it off with
`"critical_questions_gate": false`.

Each item has a severity (`critical` - numbers or data can silently become wrong; `major`; `minor`) and
options with a recommended one. Answers that change the requirements go into the SPEC; those that need
code become tasks automatically: between two tasks (and when it starts) the build runs the read-only
`satory-devteam:planner`, and `satory plan add` puts its tasks ahead of the work that builds on them and
marks the questions `planned` or, when the answer keeps the current behaviour, `resolved`. `/satory-devteam:release` warns about open critical
questions. "Later" postpones an item (`deferred`): it is not counted as open and opens again when a
flaky test fails once more or an agent raises the same item; critical items cannot be postponed. The
register is `.satory/questions.json`, readable as `docs/QUESTIONS.md`; while a task runs,
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

## Cost of a round

Most of the cost of an agent is its number of turns times the size of its context, which every turn sends
again. A round keeps both small without leaving out a check:

- **The SPEC in a fixed format.** A requirement is a heading `### R-001 - Title`, its criteria bullets
  `- **AC-001.1** - ...` under it, a non-functional requirement a bullet `- **NFR-001 - Title.** ...` (or a
  heading) and applies to every task (`spec.cross_cutting_prefixes` in `.satory/project.json`, default
  `NFR`). `satory spec check` checks it (unique ids, every criterion under its requirement, requirements no
  task covers) and writes the model to `.satory/run/requirements.json`; the analyst, a request and the
  answers to questions run it after every change, and the build reports format errors when it starts. The
  digests are built from this model, never from the wording.
- **Context digest.** The CLI writes `.satory/run/context/<task>.md` whenever the work changes (task start,
  after Dev, after QA, after each review; `satory task context <task>` writes it by hand): the full text
  of the requirements the task refers to (its ids from `docs/SPEC.md`, with ranges like "AC-003.8 -
  AC-003.10" and wildcards like "AC-003.*" expanded), the tables of contents of `docs/SPEC.md`,
  `docs/ARCHITECTURE.md`, `docs/UI.md` and `docs/design/DESIGN.md` with line numbers, the ADRs and mockups
  the task names, the files changed on its branch, the agents' notes and the last findings of each check
  (marked when not re-checked since). The parts of the SPEC that apply to every task come with it: a
  section of requirement bullets without requirement headings (the NFRs) in full, and the other sections
  (roles, data, out of scope, assumptions) by name and line. The agents start from it and read the documents by section; the
  documents stay the source of truth.
- **Notes between rounds.** Dev (or DevOps) and QA leave short notes for their next round in
  `.satory/run/notes/<task>-<role>.md`: the key files, the commands that worked, the traps and what is open.
  Each role reads only its own; a fresh start of a task removes them.
- **A register of findings.** The findings of the Reviewer, QA, the UI reviewer and Security go into one
  register per task (`satory finding`, `.satory/run/findings/<task>.json`) with stable ids (F-1, F-2 ...) and
  a status (open, fixed, disputed, dismissed, polish). The digest has the short list (one line each); the
  full record and history of each is in `.satory/run/findings/<task>/<id>.md`. In round > 1 a check gets
  its open findings and verifies each one (`verified`: fixed / open / worse with the new severity /
  dismissed) instead of reporting it again; an unverified blocking finding stays open. Dev fixes each one
  or disputes it (`finding_disputes`), and the check that raised it decides. A task goes back while a
  check has a blocking finding open. The non-blocking ones still open at the finish go to the polish task;
  after an interruption or an unblock the open ones are Dev's feedback.
- **Reviews of what changed.** In round > 1 the Reviewer, the UI reviewer and Security look at the changes
  made since their previous review (the UI reviewer also at the pages that use a shared component, token,
  layout, API or text those changes touch); the whole scope is reviewed the first time. The last results
  of the automatic checks (build/lint, the tests after QA, the whole e2e suite) are kept in the state.
- **What sends a task back.** QA fails a task for a defect: a contradiction with an acceptance criterion,
  the SPEC, the mini-spec, `docs/UI.md`, the architecture, an ADR, CLAUDE.md or a clarification, a wrong
  result, a regression, a crash or 5xx, lost data, a security problem or a serious accessibility
  violation. Where the expected outcome is a product decision no source makes, it becomes a question for
  the user instead of a test with QA's own expectation; the Reviewer does the same, while the correctness
  of the implementation keeps its normal severity.
- **Fewer turns.** Every role asks for independent tool calls in one message, related shell commands in
  one call and files read in larger ranges, and never for a skipped check.

## Tests in a round

A round does not run the whole test suite more than it has to. Dev runs `build`, `lint` and `test`
before handing over. QA runs only the unit and e2e tests it added or changed and the ones of the code the
task touches. The check after QA runs the whole unit suite (`test`) and only this task's e2e tests plus
the smoke tests. The whole e2e suite runs once, after Review, QA, UI and Security have passed and before
Docs, so the rounds sent back by QA or the UI reviewer are much shorter. A task is never finished without
a green whole suite. If it fails there, the task goes back to Dev and the next round runs the whole suite
already in QA's check, so UI and Security do not review a build with a known regression.

The task's e2e tests are selected by `commands.e2e_task` in `.satory/project.json` (`{task}` becomes the
task id). For Playwright it is derived from `commands.e2e` by appending `--grep "{task}|@smoke"`: QA puts
the task id in every e2e test title and the devops agent tags the smoke test `@smoke`. Set it when that
does not fit, e.g. smoke tests without the tag:

```json
"e2e_task": ["cd e2e && npx playwright test --reporter=line --grep \"{task}|smoke\\.spec\""]
```

With no `e2e_task` and an e2e command that is not a plain Playwright run, the whole suite runs in QA's
check as before.

## Experimental settings

Trial settings live in an `"experimental"` block of `.satory/project.json`. The workflow lists the ones
that are on when it starts; delete the key (or the whole block) to go back to the normal behaviour.
There are none at the moment.

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

- **1.5.0** - a register of findings per task (`satory finding`): stable ids, statuses, one-line list
  in the digest and a full record with history per finding; checks verify their open findings instead of
  reporting them again, Dev fixes or disputes each one, an unverified blocking finding stays open, the
  open non-blocking ones go to the polish task, and the open ones survive an interruption and an unblock.
  The SPEC has a fixed format checked by `satory spec check`, and the digests are built from its model
  (`.satory/run/requirements.json`); NFRs as headings or bullets, criteria with their requirement's
  heading, open questions never taken for requirements. Digest errors are logged in every step.
- **1.4.2** - fixes after a second review: the task's explicit requirements are never filtered out (a
  missing one is reported); the NFRs and the other cross-cutting SPEC sections are in every digest; an
  unblock clears the old findings with the round counter; the whole e2e suite in QA clears its earlier
  failure; dependencies still go to blocked tasks and the skipped ones are logged; previous non-blocking
  findings are shown apart ("already recorded for polish") so they are not reported again; a digest error
  is logged; build/lint failures keep their logs; "incomplete mini-spec" is defined; "AC-001.1 - 3 MB" is
  no longer read as a range.
- **1.4.1** - fixes after an independent review of 1.4.0: the minor findings of all rounds reach the
  polish task; the digest is rewritten by the CLI after Dev, QA and each review (no separate call) and
  never left stale; ranges, wildcards and noise in requirement ids, fenced blocks and nested bullets in the
  SPEC, bare mockup names; QA's and the whole e2e suite's findings are kept too, and a resumed task gets
  the failed ones as feedback; stale notes are removed on a fresh start; the edge-case rule keeps
  implementation correctness and the architecture as defects; the UI review covers pages fed by changed
  APIs and texts; the design step and the UX review wait until the task in progress is finished, and a
  plan change no longer adds dependencies to a started task (it is skipped instead of failing).
- **1.4.0** - cheaper rounds at the same quality (see "Cost of a round"): the context digest
  (`satory task context`), notes between rounds, reviews of what changed since the previous review (now
  also for the UI reviewer and Security, with the last findings kept across an interrupted build), QA and
  the Reviewer turn undefined edge cases into questions instead of failing the task, and every role batches
  its tool calls.
- **1.3.1** - a few failing unit tests (up to `unit_retry_max`, 3) run once more before the test gate
  fails; passing then counts, and they go to the register as flaky, as the e2e tests do.
- **1.3.0** - the design step: a UX audit, design directions as mockups, the chosen design for every page
  (`docs/design/`, `docs/UI.md`) and the tasks that build it, by the new `designer` agent and the UX
  reviewer as critic; it runs by itself once the UI foundation is built, and on request with the new
  `/satory-devteam:design`. Dev builds to the mockups and the UI reviewer checks against them.
- **1.2.2** - the register of questions is no longer passed through an agent's output (with ~190 items it
  came back cut, so the UX catch-up was skipped and the agents could not see the register): the CLI writes
  `.satory/run/register.md` and the agents read it; `plan json` gives the reviewed milestones.
- **1.2.1** - the UX review catches up by itself: finished milestones that were never UX-reviewed get
  one review of the whole app at the next boundary, without `uxReview=true`.
- **1.2.0** - nothing found is lost: the non-blocking findings of the Reviewer, the UI reviewer and
  Security become a polish task after every milestone; Security proposes hardening; the UX review runs
  twice (proposals, then a designer's critique) with the session's design skills, and `uxReview=true`
  runs it now.
- **1.1.0** - UX, not only conformance: Dev designs a page first, the UI reviewer judges presentation and
  usability and asks for a better design (and Dev updates `docs/UI.md`), the architect describes pages by
  purpose; after every milestone the new `ux-review` agent walks the whole app and its findings become an
  improvement task, done without asking.
- **1.0.2** - a gate run that failed on the environment (a package restore or network error such as
  "Restore operation failed", NU1301, ECONNRESET) also runs once more before it fails.
- **1.0.1** - `experimental.e2e_task_first` is no longer read; use `commands.e2e_task`.
- **1.0.0** - running only the task's e2e tests and the smoke tests in QA's check, with the whole e2e
  suite once after Security, is no longer experimental but always on (see "Tests in a round"). The
  command comes from `commands.e2e_task` and is derived for Playwright. The devops agent tags the smoke
  test `@smoke`.
- **0.10.8** - QA runs only the unit tests of the task and of the code it changes (filtered), not the
  whole unit suite: the check after QA runs the whole suite anyway, so a round no longer runs it up to
  three extra times (about 5 minutes each in a mid-size project).
- **0.10.7** - an adapted parameterised test may get new data (its cases are renamed with it) while the
  test keeps its cases; before, the renamed cases counted as deleted tests.
- **0.10.6** - `/satory-devteam:status` ends with a table of the remaining tasks (status, what each waits
  for, where it comes from) and what will still be added.
- **0.10.5** - with `roleFiles` the runner keeps its own definition (a default agent refused to record
  another agent's note it could not verify, and the build stopped).
- **0.10.4** - QA fixes how a flaky earlier test waits (listed as `flaky: <cause>` in "QA: adapted
  tests", what it asserts unchanged) instead of failing the task for it; the build skill passes
  `roleFiles` when the agents changed during the session, since Claude Code loads them once per session.
- **0.10.3** - Dev and QA stop every server or stub they start themselves (a `dotnet run` left running
  from the build output crashed later test runs).
- **0.10.2** - a build, lint or test gate whose run crashed (killed by a signal, a runtime or test host
  crash such as "Internal CLR error") runs once more before it fails, so a crash does not cost a round.
- **0.10.1** - the reviews check the database queries in detail, the naming (English identifiers, no
  other language in Latin letters, one name per concept), the robustness and magic values.
- **0.10.0** - reuse and efficiency: Dev reuses and extends existing code, the Reviewer searches the
  whole code base for duplicates and checks efficiency, QA reuses test helpers; after every milestone
  the new `code-health` agent reviews the whole code and its findings become one refactoring task.
- **0.9.5** - a newly flaky e2e test is reported in the progress too.
- **0.9.4** - the status line text is bright cyan.
- **0.9.3** - the status line text has an explicit colour, so it stays readable (`SATORY_STATUSLINE_COLOR`).
- **0.9.2** - "Later" postpones a question (status `deferred`): not counted as open, shown apart in the
  status, opened again when it comes back (a flaky test fails again, an agent raises it again).
- **0.9.1** - progress you can follow: every event goes to `.satory/run/progress.log`, the build skill
  reports each one in the conversation, and `satory statusline` is a status line for Claude Code
  (offered by the setup skill).
- **0.9.0** - fixes are bundled: the planner makes one task with subtasks for all the answers that go to
  the same place in the plan (separate tasks only for fixes that wait for later work), so the whole cycle
  runs once for all of them, not once for each; several planner tasks for the same place are merged
  automatically. A plan change can carry `subtasks` and `merge` (tasks still to do joined into the
  earliest of them, every reference moved to it); `/satory-devteam:request` uses both for fixes.
- **0.8.9** - no more duplicate questions from one round: the register list an agent gets now also
  holds the items Dev, the Reviewer and QA added earlier in the same round (before, all three saw the list
  from the start of the round and reported the same gap in their own words); `question add` returns the
  new items with their titles (`added_items`).
- **0.8.8** - more reaches GitHub: the task's branch after every step of a round (a copy of the work in
  progress, deleted when the task is merged; off with `"push_task_branch": false`) and `main` after every
  change between two tasks (queued requests and answers, the planner's tasks), not only at a task finish.
- **0.8.7** - a queued change with only `links` is applied too.
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
