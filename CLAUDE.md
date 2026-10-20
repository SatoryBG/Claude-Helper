# Claude-Helper

This repo is a Claude Code **marketplace** of personal plugins. The catalog is `.claude-plugin/marketplace.json`; each plugin lives in `plugins/<name>/`.

## Rules for changes

- **Everything in the repo is in English** (code, comments, messages, docs) so other people can use it. User-facing localization goes into data files (e.g. `plugins/md-to-html/skills/md-to-html/i18n/<lang>.json`), not into code.
- **Keep the READMEs current at all times.** When a plugin is added, removed or changed (new skill, hook, dependency, syntax, command), update in the same commit:
  - the root `README.md` - the plugin table and general instructions;
  - `plugins/<name>/README.md` - the plugin details and its changelog.
- When a plugin changes, bump `version` in both `plugins/<name>/.claude-plugin/plugin.json` and its entry in `marketplace.json` (semver: patch for fixes, minor for features, major for breaking changes). Without a new version `/plugin update` does not see the change.
- Before committing: `claude plugin validate . --strict` and `claude plugin validate plugins/<name> --strict` must pass.
- Run scripts as `bash <path>` (do not rely on the executable bit - the repo also lives on a Windows file system). Hook paths use `${CLAUDE_PLUGIN_ROOT}`; paths in SKILL.md are relative to the skill's base directory.
- Use only the plain hyphen "-" in text, never em or en dashes.
