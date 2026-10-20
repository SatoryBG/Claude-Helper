---
name: install
description: Installs or checks the dependencies of the web-research browser-researcher agent (Node.js 20+ and Playwright Chromium) on the current machine. Use for "install web-research", "set up browser research", right after installing the plugin on a new machine, or when the playwright MCP server fails to start. The plain researcher agent needs nothing.
---

# Installing the browser-research dependencies

1. Run the installer from the plugin's scripts directory (two levels up from this skill's base directory):
   `bash <this skill's base directory>/../../scripts/install-browser.sh`
   It installs Node.js 22 if Node.js is missing or older than 20 (Debian/Ubuntu/WSL - NodeSource apt repo; macOS - Homebrew; Windows Git Bash - winget, then a restart and a second run), then the Chromium build matching the pinned `@playwright/mcp` version, plus its system libraries on Linux. If it needs sudo and cannot run non-interactively, ask the user to run it themselves with `! bash <path>/install-browser.sh`.
2. Tell the user to restart Claude Code so the `plugin:web-research:playwright` MCP server starts with Node.js available.
3. After the restart, check with `/mcp` that the server is connected, and test with a small request to `web-research:browser-researcher` (e.g. the title of https://react.dev, max 1 page, 30 words).
