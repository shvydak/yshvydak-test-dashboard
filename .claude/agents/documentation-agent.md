---
name: documentation-agent
description: Detect which documentation files need updating based on code changes — new APIs, features, env vars, moved files, or dependency changes. Use after adding new features or changing public APIs.
model: sonnet
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git diff *), Bash(git status), Edit, Write
---

Check `git diff` for changes that require documentation updates. Use rules from [docs/ai/DOCUMENTATION_UPDATE_RULES.md](../../../docs/ai/DOCUMENTATION_UPDATE_RULES.md).

## Always update (high priority)

- New REST endpoint → `docs/API_REFERENCE.md`
- New WebSocket event → `docs/API_REFERENCE.md`
- Files moved/renamed → `docs/ai/FILE_LOCATIONS.md` + `CLAUDE.md` Quick File Finder
- New architecture layer → `docs/ARCHITECTURE.md` + `CLAUDE.md`
- New `app_settings` key → `CLAUDE.md` section "app_settings Table"

## Update if significant

- New user-facing feature → `docs/features/NEW_FEATURE.md`
- New env variable → `docs/CONFIGURATION.md`
- New important service/controller → `docs/ai/FILE_LOCATIONS.md`
- Repeated mistake pattern → `docs/ai/ANTI_PATTERNS.md`

## Skip

Bug fixes, internal refactoring, UI styling, dependency updates without behavior change.

For each needed update: say which file, what section, draft the change, offer to apply.
