---
name: request
description: Satory request - a new input from the user at any time (a defect they found, a change to something built, a new idea). The analyst turns it into the SPEC, the architect fits it into the architecture and the plan (a fix now, an addition to tasks still to do, or a later milestone). Works while a build is running, without restarting it.
argument-hint: "[what you found or want, in a few words]"
disable-model-invocation: true
---

# Satory: a request from the user

CLI: `SATORY="python3 ${CLAUDE_PLUGIN_ROOT}/bin/satory"`. The project is the current directory.
Talk to the user in the language they write in; write the documents in the project's documentation
language (`language` in `.satory/project.json`).

The user describes something in `$ARGUMENTS` (or you ask for it): a defect they found while trying the
app, a change to how something built works, or a new idea. You act first as the **analyst**, then as the
**architect**, so the request is consistent with the SPEC and its questions and with the architecture
and the plan. A running build is never stopped or restarted, and `main` changes only between two tasks:
while a task runs, the documents are written on their own branch and the change waits in the queue
(`satory queue`); the build merges it at the next boundary between two tasks, then plans.

## 0. Where things stand
- `$SATORY status` and `$SATORY plan json`: the branch (`satory/T-…` means a task is running), the tasks,
  the milestones. `$SATORY question list`: the register, so you do not duplicate an item.
- Read `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/adr/`, `docs/UI.md` (if any) and the task files of
  the features the request touches. Reproduce a defect if you can (the staging URL, the API, the code)
  and say what you found.

## 1. Analyst
Follow the rules of `${CLAUDE_PLUGIN_ROOT}/skills/analyst/SKILL.md` (sections "Specification" and
"Changing an existing specification").
- Classify it: **defect** (the app does not do what the SPEC says - no SPEC change), **change** (the SPEC
  says something else or nothing; the built behaviour must change) or **new** (a new capability).
- Ask what is needed to make it testable, with AskUserQuestion and concrete options (up to 3 rounds):
  the expected behaviour with values, messages, edge cases. Do the data rules pass of the analyst for
  every new or changed field. Do not ask technical questions.
- For a change or a new capability: write it into `docs/SPEC.md` - new or changed requirements and
  acceptance criteria (Given/When/Then, concrete values), a version bump and a row in the change history
  with the source "request from the user". Show the user the new or changed criteria and get a yes.

## 2. Architect
Follow the "Replanning" and "Plan" rules of `${CLAUDE_PLUGIN_ROOT}/skills/architect/SKILL.md`.
- Architecture: does it fit `docs/ARCHITECTURE.md` and the ADRs? If it needs a decision (a new
  dependency, a data model change, an integration), write an ADR or update the architecture and say so.
- Where it goes. Offer the user the options that make sense, with your recommendation first:
  - **a fix now** - new tasks ahead of everything still to do (for a defect or a change to something
    built that later work relies on);
  - **with a task still to do** - extend that task (`updates`: `description_append`, `acceptance_add`,
    `requirements_add`), when it is about to build the same thing;
  - **in a later milestone** - new tasks in an existing milestone, or a new milestone (`milestones`:
    `{id, title, after}`) for a larger addition.
  Done tasks and the task in progress are never changed: work on them is a new task.
- Write the tasks like the architect: small, vertical, `owner`, `ui`, `milestone`, `depends_on`,
  `requirements`, a description that needs no guessing, `acceptance` with AC ids. `insert_before` places
  a task before a task still to do; `depends` makes tasks still to do wait for a new one (by its `ref`).
  A task added by an earlier request still in the queue has no id yet: depend on it by its question id
  (`"depends_on": ["Q-028"]`).

## 3. Record and plan
1. Put the request into the register, so it is tracked like the other decisions:
   ```bash
   $SATORY question add --source "request from the user" --note-stdin <<'SATORY_EOF'
   [{"kind": "request", "severity": "major", "title": "<one line>", "detail": "<what and why, the SPEC refs>", "refs": ["R-…", "AC-…"]}]
   SATORY_EOF
   $SATORY question answer Q-0XX --note-stdin <<'SATORY_EOF'
   <what was decided: the behaviour, where it goes in the plan>
   SATORY_EOF
   ```
   (`critical` when it can make numbers or data wrong; it then also holds the next milestone until done.)
2. Write the documents (`docs/SPEC.md`, `docs/ARCHITECTURE.md`, ADRs, `docs/UI.md`) in a worktree of
   main on a new branch - never on the current branch and never directly on main:
   ```bash
   $SATORY queue begin        # -> {"branch": "satory/queue-…", "dir": "/tmp/satory-queue-…"}
   ```
   Edit the files under `dir` (do the analyst's and architect's writing there from the start).
3. Queue the change: the documents and the plan change in one JSON (the request's id in each task's
   `questions` or `questions_add`):
   ```bash
   $SATORY queue add --branch <branch> --dir <dir> --source request --message "docs: <short name>" --note-stdin <<'SATORY_EOF'
   {"title": "<short name of the request>", "summary": "<2-3 sentences>",
    "milestones": [], "tasks": [{"ref": "…", "title": "…", "milestone": "M4", "owner": "dev", "ui": true,
      "depends_on": [], "requirements": [], "description": "…", "acceptance": ["AC-…"],
      "questions": ["Q-0XX"], "insert_before": "T-0YY"}],
    "updates": [], "depends": [], "resolved": []}
   SATORY_EOF
   ```
   It commits the documents on the branch, removes the worktree and checks the plan change against the
   current plan. On a clean main (no task running) it is merged and applied at once; otherwise it waits
   in `.satory/run/queue/` and the build applies it after the current task, before the planner.
4. Tell the user in a few lines what changed in the SPEC, which tasks were added or extended and where,
   and when the work starts (now, after the current task, or with milestone X). If no build is running,
   suggest `/satory-devteam:build`.
