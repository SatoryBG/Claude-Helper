#!/usr/bin/env bash
# Installs pandoc >= 3.1.10 (needed for GitHub alerts). Exit 0 = ready, 1 = a manual step is needed.
set -euo pipefail
MIN="3.1.10"

version_ok() { [[ "$(printf '%s\n%s\n' "$MIN" "$1" | sort -V | head -1)" == "$MIN" ]]; }

if command -v pandoc >/dev/null 2>&1; then
  cur="$(pandoc --version | head -1 | awk '{print $2}')"
  if version_ok "$cur"; then echo "pandoc $cur is installed - nothing to do."; exit 0; fi
  echo "pandoc $cur is older than $MIN - upgrading."
fi

latest_url() { # $1 = regex for the asset file name
  curl -fsSL https://api.github.com/repos/jgm/pandoc/releases/latest \
    | grep -oE '"browser_download_url": *"[^"]+"' | cut -d'"' -f4 | grep -E "$1" | head -1
}
sudo_cmd() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }

case "$(uname -s)" in
  Linux)
    if command -v dpkg >/dev/null 2>&1; then
      arch="$(dpkg --print-architecture)"
      url="$(latest_url "-${arch}\.deb$")"
      tmp="$(mktemp -d)"; curl -fsSL -o "$tmp/pandoc.deb" "$url"
      sudo_cmd dpkg -i "$tmp/pandoc.deb"; rm -rf "$tmp"
    else
      arch="$(uname -m)"; [[ "$arch" == x86_64 ]] && arch=amd64; [[ "$arch" == aarch64 ]] && arch=arm64
      url="$(latest_url "linux-${arch}\.tar\.gz$")"
      tmp="$(mktemp -d)"; curl -fsSL "$url" | tar -xz -C "$tmp"
      sudo_cmd install -m 755 "$tmp"/pandoc-*/bin/pandoc /usr/local/bin/pandoc; rm -rf "$tmp"
    fi ;;
  Darwin)
    if command -v brew >/dev/null 2>&1; then brew install pandoc || brew upgrade pandoc
    else echo "Install Homebrew, or install pandoc from https://pandoc.org/installing.html"; exit 1; fi ;;
  MINGW*|MSYS*|CYGWIN*)
    if command -v winget >/dev/null 2>&1; then
      winget install --id JohnMacFarlane.Pandoc -e --accept-source-agreements --accept-package-agreements
      echo "Restart Claude Code so it picks up the new PATH."
    else echo "Install pandoc from https://pandoc.org/installing.html"; exit 1; fi ;;
  *) echo "Unknown OS: $(uname -s). Install pandoc manually."; exit 1 ;;
esac
pandoc --version | head -1
