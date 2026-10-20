#!/usr/bin/env bash
# md-to-html: converts a Markdown document into a self-contained HTML file next to it.
# Usage: md2html.sh [-t report|tech] file.md [file2.md ...]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

force_style=""
if [[ "${1:-}" == "-t" ]]; then force_style="${2:?missing style after -t}"; shift 2; fi
[[ $# -ge 1 ]] || { echo "Usage: $(basename "$0") [-t report|tech] file.md ..." >&2; exit 1; }

front_matter() {
  awk '{ sub(/\r$/, "") } NR==1 && /^---$/ { f=1; next } f && /^(---|\.\.\.)$/ { exit } f' "$1"
}
fm_value() {
  grep -m1 -E "^$1:" <<<"$2" | sed -E "s/^$1:[[:space:]]*//; s/^[\"']//; s/[\"'][[:space:]]*$//; s/[[:space:]]+$//" || true
}

for in in "$@"; do
  [[ -f "$in" ]] || { echo "No such file: $in" >&2; exit 1; }
  fm="$(front_matter "$in")"
  style="${force_style:-$(fm_value template "$fm")}"
  style="${style:-report}"
  [[ "$style" == report || "$style" == tech ]] || { echo "Unknown style '$style' (report|tech): $in" >&2; exit 1; }

  out="${in%.*}.html"
  args=(
    -f commonmark_x-smart+autolink_bare_uris+implicit_figures -t html5 --standalone --embed-resources
    --resource-path "$(dirname "$in")"
    --template "$DIR/templates/doc.html"
    -H "$DIR/styles/base.html" -H "$DIR/styles/components.html" -H "$DIR/styles/$style.html"
    --lua-filter "$DIR/filters/callouts.lua" --lua-filter "$DIR/filters/components.lua"
    --syntax-highlighting=default
    -V style="$style" -V source="$(basename "$in")" -V generated="$(date '+%Y-%m-%d %H:%M')"
  )
  [[ "$(fm_value toc "$fm")" == "false" ]] || args+=(--toc --toc-depth="$(fm_value toc-depth "$fm" | grep -E '^[1-6]$' || echo 3)")
  [[ -n "$(fm_value title "$fm")" ]] || args+=(-M pagetitle="$(basename "${in%.*}")")
  [[ "$(fm_value number-sections "$fm")" == "true" ]] && args+=(--number-sections)
  [[ "$(fm_value width "$fm")" == "wide" ]] && args+=(-V wide=true)

  pandoc "${args[@]}" -o "$out" "$in"
  echo "$out"
done
