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
   - where the history is: `docs/JOURNAL.md` (for humans; the agents do not read it).
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
4. If there are tasks to run, suggest `/satory-devteam:build`.
