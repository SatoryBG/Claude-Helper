---
name: design
description: Satory design - asks for a new design of the app, as a UX consultant would make it - an audit of the running app, design directions as mockups, the chosen design for every page (docs/design/, docs/UI.md) and the tasks that build it. The build runs it at the next boundary between tasks; also shows the result and lets the user switch to another direction.
argument-hint: "[a brief for the design, or: show | use <direction>]"
disable-model-invocation: true
---

# Satory: design

CLI: `SATORY="python3 ${CLAUDE_PLUGIN_ROOT}/bin/satory"`. The project is the current directory.
Talk to the user in the language they write in.

The design step is part of the build (`/satory-devteam:build`): at a boundary between two tasks, on main, it
runs when the app has a UI but no `docs/design/DESIGN.md` yet, or when it was asked for here. It audits the
running app (`docs/design/AUDIT.md`), proposes 2-3 directions as mockups (`docs/design/directions/<id>/`), a
critic chooses the strongest (unless the user chose), the designer designs every page in it
(`docs/design/mockups/`, `docs/design/DESIGN.md`, `docs/UI.md`), a critique and a revision follow, and the
planner adds the tasks that build it ahead of the remaining work. No approval is needed on the way; the user
comments when they want something different.

1. `$SATORY design status` and `$SATORY status` (is a build running: the branch `satory/T-…` or a running
   workflow in this session).
2. By `$ARGUMENTS`:
   - **show** (or empty when a design exists): show the result. Read the screenshots under
     `.satory/run/ui/design/` and describe the directions and the chosen design in a few lines each; give the
     paths of `docs/design/DESIGN.md`, the mockups and `docs/design/AUDIT.md`. If the Artifact tool is
     available, offer to publish the mockups as one private page (an index linking every mockup file) so the
     user can open them in the browser.
   - **use <direction>**: the user prefers another direction: `$SATORY design request --choice <direction>`
     (its folder name under `docs/design/directions/`); the build designs the whole app in it and replaces
     the planned design tasks that are not started (say so).
   - **a brief** (or empty with no design yet): ask for a new design with the user's wishes:
     ```bash
     $SATORY design request --note-stdin <<'SATORY_EOF'
     <the brief: what the user dislikes, wants, references; or "-" when none>
     SATORY_EOF
     ```
3. If a build is running, say the design runs at its next boundary between tasks and the progress shows it
   (🎨 lines). If not, suggest `/satory-devteam:build`: it starts with the design step.
