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

- `[ ]` **Security leftovers after API auth hardening** (2026-10-25). (1) CORS: `ALLOWED_ORIGINS` unset in production still allows every origin (`cors.middleware.ts`) — set it on the deploy host or fail closed. (2) Login has no rate limit/lockout, and the password compare is plain `!==` (`auth.service.ts`). (3) JWT in `?token=` URLs (WebSocket, `/attachments`, `/traces`) lands in proxy logs. (4) Vulnerable deps that need a major bump: `sqlite3` 6 (tar / @tootallnate/once / brace-expansion, build-time chain), `uuid` ≥11.1.1, `react-router-dom` 7, dev-only `vitest` 5 (tinypool), `turbo`. (5) `deleteExecution`/`deleteTestAttachments` build a path from the `:executionId` URL param — behind a JWT now, but still unvalidated. (6) Reporter run outside the dashboard (no spawn) gets 401 with auth on — design C has no reporter credential.

### Completed Issues ✅

### Draft:
