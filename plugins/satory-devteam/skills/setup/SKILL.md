---
name: setup
description: Satory setup - prepares the machine for satory-devteam: installs the required tools (Docker, Node, Playwright, .NET SDK, gh, scanners), sets up the git identity and the GitHub login with the required scopes. Run once on every new machine; safe to run again.
argument-hint: "[--no-dotnet]"
disable-model-invocation: true
---

# Satory: machine setup

CLI: `SATORY="python3 ${CLAUDE_PLUGIN_ROOT}/bin/satory"`. Every command prints one line of JSON.

## 1. Diagnostics
`$SATORY doctor`. Show a short table: which tool is available (with version), which is missing, plus
`problems` (blocking, with `fix`) and `notes` (optional). If `ok` is true, say the machine is ready and
continue from step 5.

## 2. Tools
If tools are missing, explain what will be installed and ask for confirmation (AskUserQuestion):
- **apt packages**: git, python3, pipx, Docker + Compose, Node.js + npm, gh, gitleaks and the .NET SDK
  (the last one is skipped with `--no-dotnet` or if the user says they do not use .NET);
- Docker as a service, with the regular user added to the `docker` group;
- semgrep (via pipx, into `/usr/local/bin`) and Chromium for Playwright with its system libraries.

On confirmation run:
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/install-prereqs.sh" [--no-dotnet]`

- Root privileges are required. If you are not root and `sudo` asks for a password, ask the user to run
  the command themselves with `!` in front.
- Only Ubuntu and Debian (including WSL2) are supported automatically. On another OS show the list for
  manual installation.
- WSL without systemd: Docker will not start by itself. Explain that `/etc/wsl.conf` needs
  `[boot]` → `systemd=true`, followed by `wsl --shutdown` from Windows.

## 3. Git identity
If it is missing, ask for the name and email for the commits. If the user wants the commits linked to
their GitHub profile: the account's email or `…@users.noreply.github.com`. Then:
`git config --global user.name "…"` and `git config --global user.email "…"`.

## 4. GitHub
Based on `github` from doctor:
- **Not logged in**: the login is interactive (a one-time code in the browser) and you cannot do it for
  the user. Ask them to run `! gh auth login -h github.com -p https -w -s workflow`.
- **Missing the `workflow` or `repo` scope**: `! gh auth refresh -h github.com -s workflow`. Without
  `workflow`, GitHub refuses pushes of `.github/workflows/*`.
- Then run `gh auth setup-git`, so git uses these credentials for push and clone.

## 5. Status line
`$SATORY statusline` prints one line about the satory project of the current directory (tasks done,
the task and round in progress, the last event, open questions, queued changes) and nothing elsewhere.
Read `~/.claude/settings.json`. If it has no `statusLine`, offer to add it (AskUserQuestion); if it has
one, show it and offer to keep it or replace it. On yes, set (keeping the rest of the file):
```json
"statusLine": {"type": "command", "command": "f=$(ls -d \"$HOME\"/.claude/plugins/cache/*/satory-devteam/*/bin/satory 2>/dev/null | sort -V | tail -n 1); [ -n \"$f\" ] && python3 \"$f\" statusline"}
```
The glob finds the installed version, so the line survives plugin updates. It shows from the next
prompt on.

## 6. Finish
Run `$SATORY doctor` again and show the result. If everything is fine, the next step is
`/satory-devteam:analyst <name or GitHub repo> <short description>`.
Membership in the `docker` group takes effect for the regular user at the next login.
