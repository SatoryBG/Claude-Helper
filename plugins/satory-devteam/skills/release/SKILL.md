---
name: release
description: Satory release - promotes the current state from staging to production (local Docker) only after explicit approval by the user.
argument-hint: "[version, e.g. 1.2.0]"
disable-model-invocation: true
---

# Satory: release to production

CLI: `SATORY="python3 ${CLAUDE_PLUGIN_ROOT}/bin/satory"`. You work in the project directory.

## 1. Preliminary checks
- `$SATORY status`: you are on `main`, no tasks are in progress, staging is `healthy`.
- `git status` is clean.
- Latest version: `git describe --tags --abbrev=0` (there may be none).

## 2. What goes in
Show the user:
- the `## [Unreleased]` section of `CHANGELOG.md`;
- `git log <latest tag>..HEAD --oneline` (or the whole log if there is no tag);
- the staging URL, so they can look at it themselves before deciding;
- the blocked tasks, if any (they do **not** go in);
- the open questions for the user (`$SATORY question list --open`). If any is `critical`, list them and
  say that they can make the numbers or data wrong in production; recommend answering them first
  (`/satory-devteam:status`) and continue only if the user says so in the approval below.

## 3. Version
If there are `$ARGUMENTS`, use them. Otherwise propose one by SemVer: new functionality bumps minor, fixes
only bump patch, and the first release is `0.1.0` (or `1.0.0` if the user considers the product complete).

## 4. Approval (mandatory)
Ask with AskUserQuestion: "Release vX.Y.Z to production" / "Not now". **Release nothing without an explicit yes.**
The approval applies to this version only.

## 5. Release
`$SATORY release --version X.Y.Z`. The command:
- moves Unreleased into the version in the CHANGELOG;
- makes a commit and the tag `vX.Y.Z`;
- deploys to prod **the same image** that passed staging (if code changed after it, it first builds and
  goes through staging);
- runs a health check and pushes with the tags, if there is a remote.

Show the prod URL and the health check result.

## If something goes wrong
The previous prod image is in `$SATORY status` → `deploy.prod.previous`. Rolling back:
`$SATORY deploy prod --image <previous image>`, but only after the user confirms.

## Stopping an environment
`docker compose -p <name>-staging down` or `docker compose -p <name>-prod down`, where `<name>` is
`name` from `.satory/project.json`. The compose file is not needed, because the containers are found by
the project name.
