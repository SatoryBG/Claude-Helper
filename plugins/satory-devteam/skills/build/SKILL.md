---
name: build
description: Satory build - starts the autonomous process (workflow) over the tasks in the plan: Dev → Reviewer → QA → UI reviewer → Security → Docs → commit/push, up to N rounds per task. The third step after /satory-devteam:architect; run it again to continue.
argument-hint: "[milestone=M2] [max=<number of tasks>] [rounds=7] [path to the project]"
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
3. Tell the user briefly that the process runs in the background, progress is visible with `/workflows`,
   the history is written to `docs/JOURNAL.md`, and they can keep working.

## 3. When the workflow finishes
Summarise the result:
- finished tasks (with the number of rounds, whether they were pushed, and the staging URL);
- blocked tasks with the reason → `/satory-devteam:status` to answer them;
- `stopped_on_error`, if any: show the error and propose a fix;
- remaining tasks and what they wait for.

If everything is done and the project has a deploy, suggest `/satory-devteam:release` for production.

## Continuing
After an interruption (closed session, error) just run `/satory-devteam:build` again. The task in progress
continues from its branch, and the round counter is kept.
