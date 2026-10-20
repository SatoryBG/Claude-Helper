#!/usr/bin/env bash
# Installs everything the satory agent team needs on Ubuntu/Debian (incl. WSL2).
# Idempotent: already installed tools are left alone.
#   install-prereqs.sh            install what is missing
#   install-prereqs.sh --no-dotnet  skip the .NET SDK
set -uo pipefail

DOTNET=1
for arg in "$@"; do
  case "$arg" in
    --no-dotnet) DOTNET=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"
have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '\n==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*"; }

if ! have apt-get; then
  warn "Only Ubuntu/Debian (apt) are supported, including WSL2. On this system install manually:"
  warn "git, python3, docker + compose, node + npm, gh, gitleaks, semgrep, .NET SDK, Playwright Chromium."
  exit 2
fi

candidate() { apt-cache policy "$1" 2>/dev/null | awk '/Candidate:/ {print $2}' | grep -v '(none)'; }

say "apt packages"
$SUDO apt-get update -qq
wanted=(git python3 pipx curl ca-certificates nodejs npm gh gitleaks docker.io)
for compose in docker-compose-v2 docker-compose-plugin docker-compose; do
  if [ -n "$(candidate "$compose")" ]; then wanted+=("$compose"); break; fi
done
if [ "$DOTNET" = 1 ] && ! have dotnet; then
  sdk=$(apt-cache search --names-only '^dotnet-sdk-[0-9.]+$' 2>/dev/null | awk '{print $1}' | sort -V | tail -1)
  if [ -n "$sdk" ]; then wanted+=("$sdk"); else warn ".NET SDK is not in apt - see https://learn.microsoft.com/dotnet/core/install/linux"; fi
fi
install=()
for pkg in "${wanted[@]}"; do
  if dpkg -s "$pkg" >/dev/null 2>&1; then continue; fi
  if [ -n "$(candidate "$pkg")" ]; then install+=("$pkg"); else warn "package $pkg is not in apt - skipping"; fi
done
# docker.io conflicts with Docker's own docker-ce; keep whichever docker is already there
if have docker; then install=("${install[@]/docker.io}"); fi
if [ "${#install[@]}" -gt 0 ]; then
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${install[*]} || warn "apt install returned an error"
else
  echo "all apt packages are present"
fi

say "Docker service"
if [ -d /run/systemd/system ]; then
  $SUDO systemctl enable --now docker >/dev/null 2>&1 && echo "docker: $(systemctl is-active docker)"
else
  warn "systemd is not active - Docker will not start by itself."
  warn "On WSL add to /etc/wsl.conf:  [boot]  systemd=true  and run 'wsl --shutdown' from Windows."
fi
login_user="${SUDO_USER:-$(getent passwd 1000 | cut -d: -f1)}"
if [ -n "$login_user" ] && [ "$login_user" != root ] && ! id -nG "$login_user" | grep -qw docker; then
  $SUDO usermod -aG docker "$login_user" && echo "$login_user was added to the docker group (effective from the next login)"
fi

say "semgrep"
if have semgrep; then
  echo "present: $(semgrep --version)"
else
  $SUDO env PIPX_HOME=/opt/pipx PIPX_BIN_DIR=/usr/local/bin pipx install semgrep >/dev/null && echo "installed"
fi

say "Playwright Chromium"
if ls -d "$HOME"/.cache/ms-playwright/chromium* >/dev/null 2>&1; then
  echo "present"
else
  tmp="$(mktemp -d)"
  (cd "$tmp" && npx -y playwright@latest install --with-deps chromium >/dev/null 2>&1) \
    && echo "installed" || warn "failed - run manually: npx playwright install --with-deps chromium"
  rm -rf "$tmp"
fi

say "git"
[ -z "$(git config --global init.defaultBranch)" ] && git config --global init.defaultBranch main && echo "init.defaultBranch = main"
if have gh && gh auth status >/dev/null 2>&1; then
  gh auth setup-git >/dev/null 2>&1 && echo "git uses the gh credentials"
fi

say "Check"
python3 "$HERE/../bin/satory" doctor
