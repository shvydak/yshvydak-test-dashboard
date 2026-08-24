#!/usr/bin/env bash
# PreToolUse (Edit|Write): enforce the two architecture invariants from CLAUDE.md.
# Exit 2 blocks the write and sends stderr back to Claude as feedback.
set -uo pipefail

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)

# Edit sends new_string, Write sends content, MultiEdit sends edits[].new_string.
added=$(printf '%s' "$input" | jq -r '
  [ .tool_input.new_string?, .tool_input.content?,
    (.tool_input.edits? // [] | .[]?.new_string) ]
  | map(select(. != null)) | join("\n")' 2>/dev/null)

[ -n "$path" ] || exit 0
[ -n "$added" ] || exit 0

case "$path" in
    *.ts|*.tsx|*.js|*.jsx) ;;
    *) exit 0 ;;                 # docs and schema.sql legitimately name these patterns
esac
case "$path" in
    */__tests__/*) exit 0 ;;     # tests set up fixtures with raw SQL on purpose
esac

if printf '%s' "$added" | grep -qiE 'UPDATE[[:space:]]+test_results'; then
    case "$path" in
        */src/database/*) ;;     # one-off column migrations/backfills live here
        *)
            echo "BLOCKED — INSERT-only strategy. Every execution must be a NEW row in test_results: testId stays the same, id changes, and that is what makes execution history work. Never UPDATE an existing result. See CLAUDE.md > INSERT-only Strategy. If this really is a schema migration, it belongs in packages/server/src/database/." >&2
            exit 2 ;;
    esac
fi

if printf '%s' "$added" | grep -qE 'dbManager\.(run|get|all|exec)\('; then
    case "$path" in
        */src/repositories/*) ;;
        *)
            echo "BLOCKED — Repository Pattern. Direct DatabaseManager calls belong only in packages/server/src/repositories/. Route this through Controller -> Service -> Repository instead. See CLAUDE.md > Repository Pattern." >&2
            exit 2 ;;
    esac
fi

exit 0
