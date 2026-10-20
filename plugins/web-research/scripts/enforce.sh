#!/usr/bin/env bash
# PreToolUse hook for WebSearch/WebFetch. Only active when the plugin option "enforce" is on.
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
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"web-research: direct WebSearch/WebFetch is disabled in the main conversation. Delegate to the web-research:researcher agent with the concrete question and limits (max searches, max opened pages, answer length in words)."}}
JSON
