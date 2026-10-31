---
name: file-map
description: Where things live in this repo — testId generation, WebSocket URL, theme, rerun, attachments, flaky detection, DB schema, disk thresholds, project tabs, CI pipeline, status counts, dashboard tiles. Use when you need to find the file that owns a behaviour instead of searching for it.
---

# Quick File Finder

| Need to...                                        | File                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Generate testId                                   | `packages/reporter/src/index.ts`                                                                                                   |
| WebSocket URL                                     | `packages/web/src/features/authentication/utils/webSocketUrl.ts`                                                                   |
| Apply theme                                       | `packages/web/src/hooks/useTheme.ts`                                                                                               |
| Rerun button                                      | `packages/web/src/features/tests/components/history/ExecutionSidebar.tsx`                                                          |
| Copy attachments                                  | `packages/server/src/storage/attachmentManager.ts`                                                                                 |
| Flaky detection                                   | `packages/server/src/repositories/test.repository.ts`                                                                              |
| DB schema                                         | `packages/server/src/database/schema.sql`                                                                                          |
| Disk thresholds                                   | `packages/server/src/repositories/settings.repository.ts`                                                                          |
| Strip attachments                                 | `packages/server/src/services/test.service.ts` — `cleanupData` mode `'strip'` \| `'full'`                                          |
| Execution history pagination                      | `packages/web/src/features/tests/hooks/useTestExecutionHistory.ts`                                                                 |
| Disk warning banner                               | `packages/web/src/features/dashboard/components/DiskSpaceWarningBanner.tsx`                                                        |
| Search input                                      | `packages/web/src/shared/components/molecules/SearchInput.tsx`                                                                     |
| Generic alert/warning banner                      | `packages/web/src/shared/components/molecules/AlertBanner.tsx` (disk-space + CI pipeline-skip banners)                             |
| Project tabs config / default tab                 | `packages/web/src/hooks/useProjectTabs.ts`                                                                                         |
| Per-project `workers` override (CI + manual)      | `settings.repository.ts` (`ProjectTabConfig.workers`) + `pipelineExecution.service.ts` (`step.workers ?? maxWorkers`)              |
| Active project filter                             | `packages/web/src/features/tests/hooks/useTestFilters.ts`                                                                          |
| Tests list fetch (scoped by tab)                  | `packages/web/src/features/tests/store/testsStore.ts` — `listProject` → `GET /tests?project=&limit=`                               |
| CI auto-run pause                                 | `packages/web/src/hooks/useCIAutoRun.ts` + `packages/web/src/features/dashboard/components/CIAutoRunPauseBanner.tsx`               |
| CI pipeline (ordered multi-project runs)          | `packages/server/src/services/pipelineExecution.service.ts` + `packages/web/src/hooks/usePipelineStatus.ts`                        |
| CI queue / "busy" owner                           | `packages/server/src/services/ciRunQueue.service.ts`                                                                               |
| CI result Slack (messages, link rules)            | `packages/server/src/utils/ciSlackMessage.util.ts` + `services/ciNotifier.service.ts`                                              |
| Stop: live child processes, cancel flags, groups  | `packages/server/src/services/runProcessRegistry.service.ts` + `utils/processGroup.util.ts` + `utils/runStop.util.ts`              |
| Stop: orchestration (`stop()`, restart cleanup)   | `packages/server/src/services/pipelineExecution.service.ts` (data deletion: `TestService.discardRuns`)                             |
| Tab status badge/dot (passed/failed)              | `test.repository.ts` (`getProjectStatusSummary`) + `packages/web/src/hooks/useProjectStatusSummary.ts`                             |
| Filter-bar unlimited counts                       | `test.repository.ts` (`getTestStatusCounts`) + `packages/web/src/features/tests/hooks/useTestStatusCounts.ts`                      |
| Cmd+K test search (palette)                       | `features/tests/components/CommandPalette.tsx` + `hooks/useTestSearch.ts` → `searchLatestTests`                                    |
| Dashboard "Total Tests" tile                      | `packages/web/src/features/dashboard/components/Dashboard.tsx` + `DashboardStats.tsx` (`useTestStatusCounts`, unscoped)            |
| Tab status icons (running/queued)                 | `packages/web/src/shared/components/Header.tsx` (`renderStatusDot` — spinner = running, clock = queued)                            |
| GitHub Actions CI workflow                        | **Separate repo** — a separate deployment repo holds `.github/workflows/trigger-tests.yml`                                         |
| Jira ticket type/status sync + cache              | `packages/server/src/services/jira.service.ts` + `repositories/jiraTicket.repository.ts` (table `jira_ticket_cache`)               |
| Jira-enriched ticket chip (icon + status lozenge) | `packages/web/src/features/tests/components/TicketChips.tsx` (`JiraEnrichedChip`) + `hooks/useJiraTicketInfo.ts`                   |
| MCP server (read-only by default + run tools)     | `packages/mcp/src/` — `tools/*.ts` (8 tools), `client.ts` (typed GETs, run starts), `auth.ts` (login, 401 retry), `trim.ts` (caps) |
| MCP guard allowlist (the only `fetch`)            | `packages/mcp/src/http.ts` (`ALLOWED_GET`, login POST, `isAllowedRunPost`)                                                         |

`useDashboardStats` / `GET /api/runs/stats` is dead in the UI — kept only because `scripts/trigger-test-run.js` still calls the endpoint. Do not use it for new tiles.

Full structure: [docs/ai/FILE_LOCATIONS.md](../../../docs/ai/FILE_LOCATIONS.md)
