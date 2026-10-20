#!/usr/bin/env bash
# Starts the Playwright MCP server used by the browser-researcher agent.
# $1 = plugin option "browser_headed" ("true" shows the browser window, e.g. to log in once).
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v npx >/dev/null 2>&1; then
  echo "web-research: Node.js is not installed - browser research is unavailable. Run /web-research:install." >&2
  exit 1
fi
PROFILE="${HOME}/.cache/web-research/browser-profile"
mkdir -p "$PROFILE"
OUT="${HOME}/.cache/web-research/output"
mkdir -p "$OUT"
find "$OUT" -type f -mtime +1 -delete 2>/dev/null   # snapshots are only needed during the session
args=(--browser chromium --user-data-dir "$PROFILE" --output-dir "$OUT" --image-responses omit)
[[ "${1:-false}" == "true" ]] || args+=(--headless)
exec npx -y "$(cat "$DIR/playwright-mcp.version")" "${args[@]}"
