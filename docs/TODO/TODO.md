# Development TODO

## ToDo

- Doscover for specific project
- testModalWindow - attachments loader doesn't centered

- ⚠️ ALLOWED_ORIGINS not set in production - allowing all origins (not recommended)

### Active Issues

- `[ ]` Search by test note
- `[ ]` Show annotation/descriptions in a test

### Deferred / tech debt

Found during other work, consciously postponed. Each entry: what, where, why it matters.

- `[ ]` **`OUTPUT_DIR` and `NODE_ENV` ignored from root `.env` in dev** (2026-09-24, found in #145). `packages/server/src/config/environment.config.ts:47,59` reads them eagerly at module load; under `tsx watch` imports are hoisted above `dotenv.config()`, so `.env` values are not yet loaded. Prod build (tsc → CJS) is unaffected. Fix: turn them into getters, like the `jira` block in the same file.
- `[ ]` **Jira: moved ticket stays a plain chip** (2026-09-24, #145). `bulkfetch` returns a moved issue under its new key; the cache stores the new key, so a chip with the old tag gets no type/status. Fix idea: map the requested key → returned issue, cache under both.
- `[ ]` **Jira: Server / Data Center support** (2026-09-24, #145). Only Jira Cloud is supported (email + API token, Basic auth). DC uses Personal Access Tokens (Bearer) and a different API base.
- `[ ]` **Jira: reconcile ticket "automation test" fields with test tags** (2026-09-24, idea). Report where a ticket's custom field names a test title that no test tags, and vice versa. Needs a configurable custom-field id; catches links broken by test renames.

### Completed Issues ✅

### Draft:
