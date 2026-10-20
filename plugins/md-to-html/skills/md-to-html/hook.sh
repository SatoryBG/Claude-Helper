#!/usr/bin/env bash
# PostToolUse hook: after Write/Edit of a .md file with "html: true" in its front matter, regenerate the HTML next to it.
input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  f="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
elif command -v python3 >/dev/null 2>&1; then
  f="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' <<<"$input")"
else
  f="$(sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' <<<"$input" | head -1)"
fi
[[ "$f" == *.md && -f "$f" ]] || exit 0
awk '{ sub(/\r$/, "") } NR==1 && !/^---$/ { exit } NR==1 { next } /^(---|\.\.\.)$/ { exit } /^html:[[:space:]]*(true|yes)[[:space:]]*$/ { found=1; exit } END { exit !found }' "$f" || exit 0
if ! command -v pandoc >/dev/null 2>&1; then
  echo "md-to-html: pandoc is not installed, HTML for $f was not generated. Run /md-to-html:install." >&2
  exit 2
fi
if ! out="$(bash "$(dirname "${BASH_SOURCE[0]}")/md2html.sh" "$f" 2>&1)"; then
  echo "md-to-html: HTML generation failed for $f: $out" >&2
  exit 2
fi
