#!/usr/bin/env bash
# PreToolUse hook for WebSearch/WebFetch and the plugin's browser tools. Only active when the plugin option "enforce" is on.
# Calls from a subagent (hook input has agent_id) are always allowed; calls from the main
# conversation are denied with a reason that tells Claude to delegate to the researcher.
case "${CLAUDE_PLUGIN_OPTION_ENFORCE:-false}" in true|1|yes) ;; *) exit 0 ;; esac

input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  agent="$(jq -r '.agent_id // empty' <<<"$input")"
elif command -v python3 >/dev/null 2>&1; then
  agent="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("agent_id") or "")' <<<"$input")"
else
  agent="$(sed -n 's/.*"agent_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' <<<"$input" | head -1)"
fi
[[ -n "$agent" ]] && exit 0

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"web-research: direct web tools are disabled in the main conversation. Delegate to web-research:researcher (or web-research:browser-researcher for pages that need a real browser) with the concrete question and limits."}}
JSON
