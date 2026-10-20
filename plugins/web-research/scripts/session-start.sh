#!/usr/bin/env bash
# SessionStart hook: adds the delegation rules to the session context (stdout becomes context).
cat "$(dirname "${BASH_SOURCE[0]}")/rules.md"
