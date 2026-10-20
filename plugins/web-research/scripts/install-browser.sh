#!/usr/bin/env bash
# Installs what the browser-researcher agent needs: Node.js >= 20 and the Chromium build
# that matches the pinned @playwright/mcp version. Exit 0 = ready, 1 = a manual step is needed.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_PKG="$(cat "$DIR/playwright-mcp.version")"
MIN_NODE=20

sudo_cmd() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }
node_major() { node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }

if [[ -z "$(node_major)" || "$(node_major)" -lt $MIN_NODE ]]; then
  echo "Installing Node.js (>= $MIN_NODE)..."
  case "$(uname -s)" in
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo_cmd bash -
        sudo_cmd apt-get install -y nodejs
      else echo "Install Node.js $MIN_NODE+ with your package manager: https://nodejs.org/en/download"; exit 1; fi ;;
    Darwin)
      if command -v brew >/dev/null 2>&1; then brew install node
      else echo "Install Homebrew or Node.js $MIN_NODE+ from https://nodejs.org/en/download"; exit 1; fi ;;
    MINGW*|MSYS*|CYGWIN*)
      if command -v winget >/dev/null 2>&1; then
        winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
        echo "Restart Claude Code so it picks up the new PATH, then run this installer again."; exit 1
      else echo "Install Node.js $MIN_NODE+ from https://nodejs.org/en/download"; exit 1; fi ;;
    *) echo "Unknown OS: $(uname -s). Install Node.js $MIN_NODE+ manually."; exit 1 ;;
  esac
fi
echo "node $(node --version)"

# Install the Chromium build that matches the Playwright version used by the pinned MCP package.
PW_VERSION="$(npm view "$MCP_PKG" dependencies --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);console.log((d.playwright||d["playwright-core"]||"latest").replace(/^[\^~]/,""))})')"
echo "Installing Chromium for playwright@$PW_VERSION..."
if [[ "$(uname -s)" == Linux ]]; then
  sudo_cmd npx -y "playwright@$PW_VERSION" install-deps chromium
fi
npx -y "playwright@$PW_VERSION" install chromium
npx -y "$MCP_PKG" --version >/dev/null 2>&1 || true   # warm the npx cache so the first start is fast
echo "Browser research is ready ($MCP_PKG)."
