---
name: status
description: Satory status - shows how far the project has got, the blocked tasks and the questions for the user; records the answers and unblocks the tasks.
argument-hint: "[path to the project]"
disable-model-invocation: true
---

# Satory: status and unblocking

CLI: `SATORY="python3 ${CLAUDE_PLUGIN_ROOT}/bin/satory"`. The project is in `$ARGUMENTS` or the current directory.
Talk to the user in the language they write in.

1. `$SATORY status` and `$SATORY plan json`. Show briefly:
   - how many tasks are done, in progress, blocked and to do, and which one is next;
   - staging and prod (URL, image, when), the remote;
   - where the history is: `docs/JOURNAL.md` (for humans; the agents do not read it);
   - the open questions for the user (`questions` in the status): how many, how many critical.
   - queued changes waiting for the next task boundary: `$SATORY queue list` (how many). If the build
     reported that one could not be merged (a conflict with what a task changed), rebase its branch onto
     main and resolve it with the user (`git rebase main <branch>` in a worktree of that branch); the
     build retries it at the next boundary.
2. For every **blocked** task show the reason (`reason`) and classify it:
   - **Question from an agent** (business decision): ask the user (AskUserQuestion with options or a
     free answer). If the answer changes the requirements, update `docs/SPEC.md` (version + a history
     row) and commit on main. If it changes the UI direction, update `docs/UI.md` the same way.
   - **Rounds used up**: show the last feedback. Offer options: (a) guidance from the user, with which
     the task starts again; (b) replanning with `/satory-devteam:architect`, e.g. splitting the task;
     (c) it stays blocked. If the last stage was `ui`, also offer (d) adjusting `docs/UI.md` when the
     findings show that the guide itself is unclear or too strict.
   - **Technical error**: show the log and propose a fix.
3. Unblocking, with the answer or the guidance as text:
   ```bash
   $SATORY task unblock T-00X --note-stdin <<'SATORY_EOF'
   <the user's answer>
   SATORY_EOF
   ```
   The answer is recorded in the task as a "Clarification from the user", the round counter is reset,
   and the work on the branch continues from where it stopped.
4. **Questions for the user** (they never stop the work; the user answers when it suits them).
   `$SATORY question list --open` returns them: `question` (the SPEC does not define it), `decision` (Dev
   chose, confirm it), `fix` (defined but not enforced), `test` (not covered by a test), from Dev, the
   Reviewer, QA and the milestone reviews. If there are any, ask whether to go through them now; the user
   may also pick only the critical ones or postpone everything.
   - Go from critical to minor. For each, show the title, the concrete scenario from `detail` and the
     refs in a few lines, then ask with AskUserQuestion: the `options` (the first is recommended), plus
     "Later" (it stays open) and "Not needed" (dismissed). For `fix`/`test`: "Plan it" / "Later" /
     "Not needed". Up to 4 questions per AskUserQuestion call.
   - Record each answer (the option or the user's own text, with a short reason if they gave one):
     ```bash
     $SATORY question answer Q-00X --note-stdin <<'SATORY_EOF'
     <the answer>
     SATORY_EOF
     ```
     For "Not needed" add `--status dismissed`; for "Later" record nothing.
   - Answers that change the requirements go into `docs/SPEC.md` (version + history row, the affected
     R-IDs; a decision becomes an acceptance criterion with concrete values). `main` changes only between
     two tasks, so write the SPEC through the queue: `$SATORY queue begin` (a worktree of main on a new
     branch), edit `docs/SPEC.md` under its `dir`, then
     `$SATORY queue add --branch <branch> --dir <dir> --source answers --message "docs: specification vN"`
     with `{}` on stdin. It is merged at once on a clean main, or by the build after the current task.
   - Answers that need code changes (a different behaviour than built, an accepted `fix` or `test`) are
     turned into tasks automatically: the build runs the `planner` agent between two tasks (and when it
     starts), puts the new tasks ahead of the work that builds on them and marks the questions
     `planned` or `resolved`. Nothing to do for the user; if no build is running, suggest
     `/satory-devteam:build`.
   The register is in `.satory/questions.json` and readable in `docs/QUESTIONS.md` (both updated on main
   at the next task finish, or now with `$SATORY question flush` when on main).
   Open `critical` items keep the next milestone from starting (the started ones are finished): say so
   when there are any.
5. If there are tasks to run, suggest `/satory-devteam:build`. For a defect the user found or a new idea,
   point to `/satory-devteam:request` (it works while a build is running).
