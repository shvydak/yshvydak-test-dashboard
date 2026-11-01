---
paths:
    - 'packages/web/**'
---

# Frontend Rules (auto-loaded for packages/web/\*\*)

## Layout

- **ALWAYS verify both desktop and mobile** when changing layout/components. Mobile breakpoint is `md:` (768px).
- `flex-1` buttons inside `flex-wrap` container wrap into a column on mobile — use two-row responsive layout instead (`space-y-2 md:space-y-0 md:flex`).
- Footer `mt-X` inside `flex-col h-screen` eats height from `main` — avoid top margin on footer.
- Sticky filter bar pattern: make `main` `overflow-hidden flex flex-col`, filter bar `shrink-0`, content area `flex-1 overflow-y-auto`.
- Mobile swipe pills need `bg-white/40+` opacity — `bg-white/15` is invisible on dark backgrounds.
- All icons: use `lucide-react` (already installed). Never use emoji or unicode characters in UI.
- Edit tool fails on multi-byte emoji — use Python `open(f).read().replace(...)` to swap them.

## Settings form alignment

Use `grid` not `flex justify-between` — different label lengths break horizontal alignment:

```tsx
// WRONG — labels push inputs to different positions
<div className="flex items-center justify-between gap-3">

// RIGHT — inputs stay aligned regardless of label width
<div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2">
  <span>Label</span>
  <input className={compactInputClass} />
  <span className="w-14 text-right text-xs">unit</span>
  <Button size="sm">Action</Button>
</div>
```

## Search is a feature set

Always implement together: ESC (clear/blur) + X button + result count + URL persistence (`?q=`).  
`SearchInput` props: `onClear`, `resultCount`. Without them, search UX is incomplete. No `showShortcutHint` on in-tab search: Cmd/Ctrl+K opens the palette, not that box.

## CSS tooltip on disabled buttons

Native `title` doesn't show on `disabled`. Use `group/noproject` + `group-hover/noproject:opacity-100`:

```tsx
<div className="relative inline-flex shrink-0 group/noproject">
    <Button disabled={!activeProject} ...>...</Button>
    {!activeProject && (
        <span className="pointer-events-none absolute top-full left-0 z-50 mt-3
            whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium
            text-white opacity-0 shadow-xl transition-opacity group-hover/noproject:opacity-100
            dark:bg-primary-500">
            Select a project tab to run tests
            <span className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 bg-primary-600 dark:bg-primary-500" />
        </span>
    )}
</div>
```

Use `top-full mt-3` (below button) — `bottom-full` goes behind the sticky Header.

## Programmatic focus — verify forwardRef chain

`Input` and `SearchInput` use `forwardRef`. If `ref.current` is `null`, check the entire chain (`atom → molecule → feature`). Every wrapper must also use `forwardRef`.

## URL param as a one-shot cross-page signal

For "navigate + side effect": add `?signal=1`, handle in `useEffect`, then remove immediately with `setSearchParams(params, {replace: true})`.

```tsx
useEffect(() => {
    if (searchParams.get('signal') === '1') {
        doSideEffect()
        const params = new URLSearchParams(searchParams)
        params.delete('signal')
        setSearchParams(params, {replace: true})
    }
}, [searchParams, setSearchParams])
```

## Hooks firing before authentication completes

Hooks called unconditionally in `App.tsx` fire before `checkAuth()` resolves → `WARN: No authentication provided` in server logs.

- React Query hooks: `enabled: isAuthenticated`
- `useEffect` hooks: `if (!isAuthenticated) return` as first line + add to deps
- Accept `isAuthenticated = true` param (default keeps Settings callers working)
- `App.tsx` must pass `isAuthenticated` to: `useDiskSpaceWarning`, `useCIAutoRun`, `useProjectTabs`

## Tests: useSearchParams requires MemoryRouter

Adding `useSearchParams` breaks existing tests: "may be used only in the context of a Router".  
Wrap in `<MemoryRouter initialEntries={['/?project=All_Tests']}>` and vary URL per test case.

## Shared test links

A test link is the page URL (`?project=…&testId=…`; `/dashboard?testId=…` for the flaky list). Both pages resolve it through `useTestLink`: the page's loaded list first, otherwise `GET /api/tests/by-test-id/:testId`. On a fresh load the list is usually not loaded yet, so the server answers. `TestsList` then sets `?project=` to the test's project. Not found → `TestLinkBanner` and `testId` removed; server error → banner, `testId` kept so a reload retries. Never resolve `testId` against `testsStore.tests` alone: it holds only the first 200 rows (5000 per tab).

## Test search palette

Cmd/Ctrl+K (state in `useCommandPalette`, mounted once in `App.tsx`) and the Header magnifier open `CommandPalette`; it queries `GET /api/tests/search` (all projects, latest row), never the capped store. A hit opens through `buildTestLinkPath` = the shared-link URL `/tests?project=…&testId=…`, so `useTestLink` stays the only resolver. The in-tab `SearchInput` is separate and has no shortcut hint. Esc in the palette stops at the palette (capture listener), so a test detail modal under it stays open.

## Errors, login return, Escape layers

- **Store errors are split.** `testsStore.error` = a failed list fetch (`fetchTests` only; `fetchRuns` just logs). It is cleared on a successful fetch (never at the start of a retry) and when the view changes (`setListProject`); a reply for a view the user already left is dropped. Rows carry `testsProject` (the project they were loaded for). No rows, or rows of another tab (`testsProject !== listProject`, e.g. right after a tab switch): full-page card. Rows of the current tab (a failed 30 s poll / live refresh): rows and the open detail modal stay and an inline, dismissible "Couldn't refresh the list" banner shows above the list until the next success. A status-filter list (`useFilteredTestsByStatus`) follows the same rule with its own query error: no rows of that filter → card, never "No tests found"; rows → banner. Action failures (rerun, run-all/group, discover, delete) go to `actionError`: a dismissible `AlertBanner` portalled above the modal, never the page-wide card. Never write an action failure to `error`.
- **Login returns to the opened page.** `LoginPage` redirects via `getPostLoginPath(window.location)` (same-origin relative path only, never `//host`, absolute URLs or `/login`), so a shared test link survives sign-in.
- **Only a real rejection logs out.** `verifyToken` marks a network error / 5xx as `unknown: true`; `App.tsx` keeps `_auth` then. 401/403 or a 200 with `valid: false` clears it.
- **Escape closes only the top layer.** A layer above the detail modal (lightbox, `ConfirmationDialog`, palette) listens in the capture phase and calls `stopImmediatePropagation`; the note textarea stops propagation in its own `onKeyDown` (unsaved draft → blur only, clean → cancel editing). A new overlay must follow the same rule.
- **An unsaved note draft is never dropped silently.** `TestNoteEditor` reports `onDirtyChange`; while dirty, every user close path of `TestDetailModal` (Esc, backdrop, X, swipe) opens a `ConfirmationDialog` "Discard unsaved note?" (Discard / Keep editing; Keep editing from the Steps tab returns to Overview), and `TestsList` asks the same before a link/palette hit replaces the open test (Keep editing puts the URL back). A `beforeunload` prompt guards reload / tab close while dirty. The Overview tab stays mounted (`hidden`) behind Steps so tab switches keep the draft.

## Counts and caches

- **Filter-bar counts come from `getTestStatusCounts` (DB-aggregated, unlimited), never from the paginated list.** `testsStore.tests` is capped at 200 without a project tab and 5000 with one. Deriving All/Passed/Failed from it silently caps the badge at page size. Use `useTestStatusCounts`. Symptom: an "All 200" badge that never grows. Rows with no project (`''`/NULL) are left out of the unscoped counts (`getTestStatusCounts`) and the unscoped list (`GET /tests` without `project`/`runId`) only when at least one named project exists; with none, nothing is hidden. Both use one shared predicate (`unscopedProjectFilter` in `test.repository.ts`), applied after picking each test's latest row, so the cards and the list agree. The tab badges (`getProjectStatusSummary`) always skip `project=''` rows.
- **A status-filtered LIST has the same trap as the badge.** Filtering `testsStore.tests` client-side for a non-"all" status can legitimately render 0 rows while the badge says otherwise, if the match sits outside the capped/recency-ordered window. Use `useFilteredTestsByStatus(filter, project)` to resolve Passed/Failed/Skipped/Pending/Noted from the server instead — reserve client-side filtering of the store for `filter === 'all'`.
- **Invalidate aggregate caches in one place.** `project-status-summary`, `test-status-counts` and `filtered-tests-by-status` (prefix — every status filter + project) must be invalidated inside `testsStore.fetchTests()`, not scattered across every mutation call site (rerun, delete, cleanup, websocket handlers) — it is too easy to miss one. Query keys nothing reads (`['tests']`, `['runs']`) are dead — invalidate real ones. Zustand reaches react-query through the shared singleton in `packages/web/src/config/queryClient.ts`, not a client created locally in `main.tsx`.
- **Live row patch (`applyLiveResult`) touches result fields only.** A `test:progress` `saved` event patches one row (store + `filtered-tests-by-status` lists) and refreshes the two count queries at most once per 1.5 s (deferred while the tab is hidden); tags/`notInCode` come from the list's catalog overlay — never copy raw result metadata into a row; an older result (by `timestamp`) never overwrites a newer row. Unknown row or no `phase` (old server) → throttled full reload.
- **`test_notes` mutations are invisible to `test_results` tracking.** Saving or deleting a note broadcasts nothing, so nothing refreshes for you: `TestDetailModal.tsx` → `handleSaveNote` / `handleDeleteNote` invalidate the "Noted" count and the filtered lists and call `fetchTests()` (the row's note preview lives in the store list).

## Tailwind and layout traps

- **Conflicting width utilities do not resolve by JSX order.** `` `${baseClassWithW40} w-16` `` still renders `w-40` — the winner is CSS _source_ order, not class-attribute order. Strip the size from the shared base class instead of appending an override.
- **Separate CSS Grid containers never share column widths.** A header `div.grid` plus one grid div per row with the same `grid-template-columns` still drifts, because `auto`/`fr` tracks size per grid instance. For a real table, put header cells and row cells as siblings in ONE grid, using `<Fragment key=...>` as the row group — not a wrapping `<div>`.

## Live run state

- **Every `connection:status` snapshot is the truth** (connect, each process start/end, force-reset, each new socket). `handleConnectionStatus` → `applyRunSnapshot` replaces `isRunningAllTests`, `runningTests` and `runningGroups` from `activeRuns`, so a `run:completed` lost while the socket was down cannot leave a spinner or a disabled Run button. Flags a Run click set in the last `RUN_START_GRACE_MS` (5 s) survive a snapshot (the server registers the process a moment after the click); when that grace ends, one module-level timer re-applies the latest snapshot, so a lost `run:completed` cannot leave them stuck. `runningTests` holds **execution ids** (the server's `originalTestId` is whatever id the client posted to `/:id/rerun`).
- **`rerunTest(executionId, project?)` takes an execution id.** The project (for the per-tab Workers override) comes from `project`, else from the store row with that id; the detail modal passes `test.project` because an older execution picked in the history is not in the list.
- **A hook that fetches per id needs a stale-reply guard.** `useTestAttachments` (cancel flag per effect run; clears the list on id change; revokes blob URLs of dropped or replaced responses) and `useTestExecutionHistory.loadMore` (generation counter bumped on test change) follow `useTestSearch`. A fetch effect without one lets a slower earlier answer overwrite the newer one.
- **Socket callbacks are read through refs.** `useWebSocket` dispatches via `handleMessageRef` and reads `options` from `optionsRef`; the socket outlives renders, so a closure captured at connect time would point at the first test the modal showed.
- **The selected-row highlight compares `testId`** (a live patch changes the row's execution id).
- **A screenshot blob opens in a new tab only if its declared MIME type is a raster image** (`canOpenBlobInTab`: png/jpeg/gif/webp); anything else, SVG included, downloads. A blob URL runs on the dashboard's origin, so server-side `nosniff`/CSP do not protect it. `AttachmentWithBlobURL.blobType` carries the type (`createProtectedFileBlob`).
