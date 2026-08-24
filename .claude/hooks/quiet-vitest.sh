#!/usr/bin/env bash
# PreToolUse (Bash): make vitest stop echoing the app's console output.
#
# A full `npm test` here prints every Logger.info from the code under test:
# 6518 lines / ~170k tokens. `--silent=true` cuts that to ~4k and leaves
# failure diffs, stack frames and the exit code untouched.
#
# The `=true` form is required: a bare `--silent` swallows the next positional
# argument, so `vitest run --silent path/to/x.test.ts` dies with a parse error.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)

[ -n "$cmd" ] || exit 0
# Only rewrite a single plain command — never something chained or piped.
case "$cmd" in
    *'&&'*|*'||'*|*';'*|*'|'*|*$'\n'*) exit 0 ;;
esac
case "$cmd" in
    *--silent*|*--reporter*) exit 0 ;;
esac

case "$cmd" in
    *vitest*)                       new="$cmd --silent=true" ;;
    "npm test"|"npm test "*|"npm run test"|"npm run test "*)
        case "$cmd" in
            *" -- "*) new="$cmd --silent=true" ;;
            *)        new="$cmd -- --silent=true" ;;
        esac ;;
    *) exit 0 ;;
esac

jq -nc --arg c "$new" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "Added --silent=true: vitest would otherwise print ~170k tokens of application logs.",
    updatedInput: { command: $c }
  }
}'
exit 0
