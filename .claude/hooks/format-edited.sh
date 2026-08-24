#!/usr/bin/env bash
# PostToolUse (Edit|Write): prettier the file Claude just touched.
# eslint is deliberately not run here — it costs ~1.3s per edit, and the
# pre-commit hook plus the TypeScript language server already cover it.
set -uo pipefail

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)

[ -n "$path" ] || exit 0
[ -f "$path" ] || exit 0
case "$path" in
    *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md) ;;
    *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
npx --no-install prettier --write --log-level warn "$path" >/dev/null 2>&1
exit 0
