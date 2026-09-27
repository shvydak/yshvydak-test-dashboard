# Jira Ticket Type/Status on Chips

**Status:** ✅ Implemented (September 2026)
**Version:** 1.8.0 (in development)

## Overview

Ticket-key tags (`@ABC-123`) already render as chips that link to the tracker (see [README.md — Tags and tickets](../../README.md#tags-and-tickets)). This feature adds an optional, read-only layer on top: when the server is configured with Jira Cloud credentials, chips also show the ticket's **type** (icon) and **status** (background color from Jira's `statusCategory`), plus a tooltip with summary/status/assignee.

### Core Principle

**Read-only, opt-in via server env, and degrades to exactly today's behavior whenever anything about Jira isn't available.** No env vars set → no Jira API calls, ever. A ticket not yet synced, or one Jira couldn't resolve → the plain pre-existing chip. The dashboard never writes to Jira.

## Configuration

`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — all three required together (see [CONFIGURATION.md](../CONFIGURATION.md#jira-integration-optional)). Independent of the pre-existing `jira_base_url` app_setting (Settings → Tags & tickets), which only builds the chip's link target and needs no env config.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ Background sync (server.ts, every 30 min) + POST /jira/refresh │
└───────────────────────┬───────────────────────────────────────┘
                         ▼
┌───────────────────────────────────────────────────────────────┐
│ JiraService.refreshAllKnownKeys()                              │
│  1. TestRepository.getAllLatestMetadata() → every test's tags  │
│  2. extractJiraTicketKeysFromMetadataRows() → distinct @KEYs   │
│  3. Batches of 50 → POST /rest/api/3/issue/bulkfetch            │
│  4. JiraTicketRepository.upsertMany() (found issues only)      │
│  5. JiraTicketRepository.setLastSyncStatus() (ok/reason/time)  │
└───────────────────────┬───────────────────────────────────────┘
                         ▼
                 SQLite: jira_ticket_cache, jira_sync_status
                         ▲
┌────────────────────────┴──────────────────────────────────────┐
│ GET /api/jira/tickets?keys=... (TestsList → useJiraTicketInfo) │
│ GET /api/jira/status  (Settings → useJiraStatus)                │
│ POST /api/jira/refresh (Settings "Refresh now" button)          │
└───────────────────────┬───────────────────────────────────────┘
                         ▼
       TicketChips.tsx: JiraTicketInfoContext → JiraEnrichedChip
       (falls back to the plain chip when a key has no entry)
```

### Discovering which tickets to sync

`JiraService` doesn't ask Jira "what tickets exist" — it asks the dashboard's own data "what ticket-key tags are on any test right now" (`TestRepository.getAllLatestMetadata()`, latest row per `test_id`, unscoped by project), extracts keys with `extractJiraTicketKeysFromMetadataRows()`. That function's regex (`^@[A-Z][A-Z0-9]+-\d+$`) is **deliberately duplicated** from `packages/web/src/features/tests/utils/jiraTags.ts`'s `JIRA_TAG_PATTERN` — same reasoning as `generateStableTestId` (CLAUDE.md invariant 3): a small, stable pattern kept byte-identical across packages rather than pulled into a shared dependency.

### Fetching from Jira

`POST /rest/api/3/issue/bulkfetch` (Jira Cloud), batches of up to 50 keys (`issueIdsOrKeys`), requesting `fields: [issuetype, status, summary, assignee]`. **Not** `GET /rest/api/3/search` — that endpoint was removed from Jira Cloud (Atlassian changelog CHANGE-2046, 2025-08-01); using it would silently enrich nothing against a real site.

A key Jira can't resolve (deleted, no access, typo) is simply absent from the response's `issues` array — it does not appear in `issueErrors` either (that array is for transient per-issue failures only, per the Atlassian bulkfetch spec). Either way it stays absent from the cache afterward (same as "never synced"), and does **not** fail the rest of its batch. Only a batch-level failure (bad token, network error, Jira down — anything that makes the HTTP call itself fail) counts as a sync failure.

### Two independent outcomes are tracked

- **`jira_ticket_cache`** (`fetched_at` per ticket) — what's actually known about each ticket. `getLastSyncAt()` = `MAX(fetched_at)`, shown as "last synced …" in Settings.
- **`jira_sync_status`** (single row) — the outcome of the most recent sync **attempt**: `ok`, a short human `error_reason` (e.g. `"authentication (401)"`, `"rate limited (429)"`, `"Jira unavailable (503)"`, `"network error"`), and `attempted_at`. This is what makes a broken token visible: `enabled: true` alone only means "credentials are configured", not "syncing is working" — Settings shows both (`Jira: connected` + `· last sync failed: authentication (401)` when the last attempt failed).

Both timestamp columns are written as explicit `new Date().toISOString()` from JS, never SQL-side `CURRENT_TIMESTAMP` — SQLite's `CURRENT_TIMESTAMP` has no timezone suffix, and the frontend's `new Date(iso)` would parse that as local time instead of UTC.

### Concurrency

`JiraService` keeps a single in-flight sync promise. If a manual "Refresh now" click lands while the 30-minute timer's sync is still running (or the reverse), the second caller awaits and reuses the first sync's result instead of racing it.

### Known limitation

A renamed/moved ticket (bulkfetch would return it under its new key) keeps showing a plain chip forever under the old tag — the cache is keyed by ticket key and never resolves for a key Jira no longer recognizes.

## API

See [API_REFERENCE.md — Jira Integration](../API_REFERENCE.md#jira-integration) for full request/response shapes. Summary:

| Endpoint                         | Purpose                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/jira/status`           | `{enabled, lastSyncAt, lastSyncOk, lastSyncError}` for the Settings badge             |
| `GET /api/jira/tickets?keys=...` | Cached info for up to 200 keys (400 above that); missing keys are omitted, not errors |
| `POST /api/jira/refresh`         | Triggers an immediate sync; 400 if the integration isn't configured                   |

All three require a JWT, same rule as `/api/settings/*`.

## UI

`TicketChips.tsx` — for a ticket-key chip, looks up `JiraTicketInfoContext` (a `Map<key, JiraTicketInfo>` populated once per `TestsList` render via `useJiraTicketInfo(keys)`, covering every ticket key on the currently filtered test list in one batched request). No entry for that key → the pre-existing plain link chip, byte-for-byte unchanged code path. An entry → `JiraEnrichedChip`:

- **Type icon** (lucide-react): Bug, Task/Sub-task → CheckSquare, Story → Bookmark, Epic → Zap, anything else → a generic `Tag` icon (never guesses).
- **Status color**, from `statusCategory` (`new`/`indeterminate`/`done`) — grey/blue/green, using two new Tailwind tokens (`jiraBlue`, `jiraGreen` in `tailwind.config.js`) deliberately **not** named `blue`/`green`: those keys are already remapped to indigo/emerald in this app's palette (primary brand + the "Passed" pill), so reusing them would make a "Done" ticket chip read as a passed test.
- **Custom tooltip** (not the native `title`) on hover/focus: type + key, summary (2-line clamp), status name, assignee. Opens below the chip by default, but flips to open **above** it (`onMouseEnter`/`onFocus`, `getSpaceBelow()` in `TicketChips.tsx`) when there isn't room — measured against whichever is closer, the real viewport bottom or the nearest scrollable ancestor's edge (the test list scrolls inside its own `overflow-y-auto` pane in `TestsList.tsx`, which clips well before the viewport does). Found and fixed during manual visual verification: a row near the bottom of the list rendered a tooltip cut off mid-text.

Settings → Tags & tickets shows connection status (`Jira: connected` / `Jira: not configured`), last sync time, the last-attempt failure reason if any, and a "Refresh now" button (only rendered when `enabled`).

## Testing

- `packages/server/src/services/__tests__/jira.service.test.ts` — bulkfetch request shape, batching, `issueErrors` partial-batch handling, HTTP-status → reason mapping, network-error handling, concurrency guard, disabled → `getTicketInfo` returns `[]`.
- `packages/server/src/repositories/__tests__/jiraTicket.repository.test.ts` — cache upsert/round-trip, explicit ISO `fetched_at` (the timezone fix), sync-status round-trip.
- `packages/server/src/controllers/__tests__/jira.controller.test.ts` — key-count limit, key parsing, error responses.
- `packages/server/src/utils/__tests__/jiraTicketKey.util.test.ts` — key extraction, double-encoded metadata tolerance.
- `packages/web/src/features/tests/components/__tests__/TicketChips.test.tsx` — all three status categories, fallback when no data, tooltip content, that "other" tags are never enriched, search-hit ring doesn't erase the category color.
- `packages/web/src/features/tests/hooks/__tests__/useJiraTicketInfo.test.ts`, `packages/web/src/features/dashboard/hooks/__tests__/useJiraStatus.test.ts` — fetch/query behavior, degradation on failure.
- `packages/web/src/features/dashboard/components/__tests__/SettingsJiraSection.test.tsx` — connection badge, last-sync-failure display, refresh button.

## Related Documentation

- [Tags and tickets](../../README.md#tags-and-tickets) — the base feature this extends
- [API Reference](../API_REFERENCE.md#jira-integration)
- [Configuration](../CONFIGURATION.md#jira-integration-optional)
- [File locations](../ai/FILE_LOCATIONS.md)

---

**Last Updated:** September 2026
