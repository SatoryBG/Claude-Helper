---
name: install
description: Installs or checks the md-to-html dependencies (pandoc 3.1.10+) on the current machine. Use for "install md-to-html", "set up md-to-html", right after installing the plugin on a new machine, or when the hook reports that pandoc is missing.
---

# Installing the md-to-html dependencies

1. Run the installer from this skill's directory:
   `bash <this skill's base directory>/scripts/install-pandoc.sh`
   It checks for pandoc >= 3.1.10 and installs it if missing (Debian/Ubuntu/WSL - .deb from GitHub; other Linux - tar.gz; macOS - Homebrew; Windows Git Bash - winget). If it needs sudo and cannot run non-interactively, ask the user to run it themselves with `! bash <path>/install-pandoc.sh`.
2. Test with a sample document: in the scratchpad directory create `test.md` with front matter `title: Test`, `template: tech`, `html: true` and one section. The hook should create `test.html` next to it.
3. If the hook did not fire, run `bash <md-to-html skill base directory>/md2html.sh test.md` manually and show the error.
4. Report the pandoc version and the test result.

jq is optional - without it the hook falls back to python3 or sed.
