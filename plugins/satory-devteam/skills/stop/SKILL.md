---
name: stop
description: Satory stop - the running build stops after the step that runs now, with its result recorded, and goes on from the next step with /satory-devteam:build; "cancel" takes it back.
argument-hint: "[cancel] [path to the project]"
disable-model-invocation: true
---

# Satory: stop after the current step

CLI: `SATORY="python3 ${CLAUDE_PLUGIN_ROOT}/bin/satory"`. The project is the path in `$ARGUMENTS` or the current
directory; the word `cancel` in `$ARGUMENTS` takes back a stop asked for earlier.
Talk to the user in the language they write in.

1. `$SATORY status`: is a build running (a `satory/T-…` branch, `running` agents or steps)? If none runs, say so
   in one line and stop here; nothing is recorded (a new build clears a stop left from an earlier one anyway).
2. Without `cancel`: `$SATORY stop`. The build ends at its next boundary between two steps: the step that runs now
   (`running` in the status: an agent or a check, with its minutes) ends and its result is recorded, then the build
   stops with a `⏹` line in the progress. Tell the user in two or three lines: what runs now and that the build stops
   after it; where it goes on with `/satory-devteam:build` - the next step of the same round (the review after Dev's
   checks, QA after the review, Security after QA and the UI review, the whole e2e suite after Security, the
   documentation after the whole suite) or Dev of the next round when this round is sent back; and that
   `/satory-devteam:stop cancel` takes it back while the step still runs.
3. With `cancel`: `$SATORY stop --cancel` and say whether a stop was pending (`cancelled`).
4. Never stop the workflow with TaskStop here: that cuts the running step, whose work is then redone. If the user
   wants it stopped at once, they say so; then stop the workflow and its monitor (TaskStop) and say that the round
   goes on from its last resume point.
5. When the build has stopped (the workflow finishes with `stopped_on_usage`), stop the monitor (TaskStop) and give
   the summary of `/satory-devteam:build` (section "When the workflow finishes").
