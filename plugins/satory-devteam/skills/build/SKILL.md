---
name: build
description: Satory build - starts the autonomous process (workflow) over the tasks in the plan: Dev → Reviewer → QA → UI reviewer → Security → Docs → commit/push, up to N rounds per task. The third step after /satory-devteam:architect; run it again to continue.
argument-hint: "[milestone=M2] [max=<number of tasks>] [rounds=33] [path to the project]"
disable-model-invocation: true
---

# Satory: autonomous development

The user ran this skill to start the satory-build workflow. This is their explicit request to run a
Workflow. CLI: `SATORY="python3 ${CLAUDE_PLUGIN_ROOT}/bin/satory"`.

## 1. Checks
- The project is the path from `$ARGUMENTS` (if any) or the current directory. It must be **inside the
  session's working directory**, otherwise the Workflow cannot read the script. If it is not, tell the
  user to start Claude in the project directory or one of its parents.
- `$SATORY [--project <path>] plan json`: `ok` must be true, with no `errors`, and at least one task
  `todo` or `in_progress`. If the plan is empty, point to `/satory-devteam:architect`.
- `docs/SPEC.md` must have the status "Approved".
- If `ui_review` is true, `docs/UI.md` must exist. If it does not, point to `/satory-devteam:architect`.
- `git status`: you must be on `main` and clean, or on a `satory/T-…` branch of an interrupted task.
  If there are someone else's uncommitted changes, stop and ask.
- `$SATORY doctor`: if there are `problems`, show them. Blocking are: a missing git identity, docker
  for a project with `deploy`, node/npx for `e2e`, a missing GitHub login or `workflow` scope when there
  is an `origin`. For those, point to `/satory-devteam:setup` and stop. A missing scanner is only noted.

## 2. Start
1. `$SATORY [--project <path>] workflow` copies the current script to `.satory/run/satory-build.js` and
   returns the path (`script`) and the root (`root`).
2. Call the **Workflow** tool with `scriptPath` = `script` and `args` = an object:
   - `project`: `root`
   - `bin`: `${CLAUDE_PLUGIN_ROOT}/bin/satory`
   - `agentsDir`: `${CLAUDE_PLUGIN_ROOT}/agents`
   - `milestone`, `max`, `rounds`: only if given in `$ARGUMENTS` (form `key=value`)
   - `uxReview`: `true` when the user asks for a UX review of the whole app now: it runs at the first
     boundary between two tasks instead of waiting for the end of the milestone
   - `roleFiles`: `true` when the plugin's agents changed since this Claude session started (an update or
     a local edit): Claude Code loads the agent definitions once per session, so without it the agents
     would follow their old rules. The roles are then read from `agentsDir`.
3. Follow the progress in the conversation: start the **Monitor** tool with
   `command` = `tail -n 0 -F <root>/.satory/run/progress.log 2>/dev/null`, `description` = "satory build
   progress" and `timeout_ms` = 1800000. The CLI writes one line per event there: a task starts (▶), a
   stage of a round ends (✓/✗ with the stage and round), a task is done (✓ … done in N round(s)) or
   blocked (⛔), new questions (❓), plan and queue changes (🗂).
   - On each event, write the user one short line in their language (what happened, in plain words; no
     tool calls needed). Several events that arrive together are one line or a few short bullets.
   - When the monitor expires and the workflow is still running, start it again the same way.
   - When the workflow finishes, stop the monitor (TaskStop) and give the summary below.
4. Tell the user briefly that the process runs in the background, that you will report each step here,
   the details are visible with `/workflows`, the history is written to `docs/JOURNAL.md`, and they can
   keep working. If `$SATORY statusline` is not in their Claude Code status line yet, mention that
   `/satory-devteam:setup` can add it (a line like `satory 29/41 · ▶ T-014 r3 · … · ❓3`).

## 3. When the workflow finishes
Summarise the result:
- finished tasks (with the number of rounds, whether they were pushed, and the staging URL);
- blocked tasks with the reason → `/satory-devteam:status` to answer them;
- `stopped_on_error`, if any: show the error and propose a fix;
- remaining tasks and what they wait for;
- `questions`: the open questions for the user (and how many are critical), collected without stopping
  the work → `/satory-devteam:status` whenever it suits the user;
- `waiting_for_answers`: the next milestone did not start because critical questions are open. Say so
  plainly, show their titles (`$SATORY question list --open`), and point to `/satory-devteam:status`
  and then `/satory-devteam:build`.

If everything is done and the project has a deploy, suggest `/satory-devteam:release` for production.

## Continuing
After an interruption (closed session, error) just run `/satory-devteam:build` again. The task in progress
continues from its branch, and the round counter is kept.
