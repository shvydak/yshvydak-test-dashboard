import {z} from 'zod'
import type {DashboardClient} from '../client'
import {MAX_FIELD_CHARS} from '../constants'
import {cut, fitRows} from '../trim'
import {defineTool, jiraUnavailable, textResult, type ToolDef} from './common'

export function overviewTool(client: DashboardClient, host: string): ToolDef {
    return defineTool({
        name: 'dashboard_overview',
        title: 'Dashboard overview',
        description:
            'Start here. Which dashboard this is, whether login is on, the tabs (project, display name) with latest passed/failed counts, and Jira sync state. Counts: "failed" does not include timedOut tests.',
        input: z.object({}),
        handler: async () => {
            const [authEnabled, summary, tabs, jira] = await Promise.all([
                client.authEnabled(),
                client.summaryByProject(),
                client.tabs(),
                client.jiraStatus(),
            ])
            const config = new Map(tabs.ok ? tabs.value.map((t) => [t.project, t]) : [])
            const projects = new Set([...summary.map((s) => s.project), ...config.keys()])
            const bySummary = new Map(summary.map((s) => [s.project, s]))
            const tabRows = [...projects].map((project) => ({
                project: cut(project, MAX_FIELD_CHARS),
                displayName: cut(config.get(project)?.displayName, MAX_FIELD_CHARS),
                visible: config.get(project)?.visible,
                total: bySummary.get(project)?.total ?? 0,
                passed: bySummary.get(project)?.passed ?? 0,
                failed: bySummary.get(project)?.failed ?? 0,
            }))
            return textResult(
                fitRows(tabRows, (kept) => ({
                    target: host,
                    authEnabled,
                    tabs: kept,
                    tabNamesNote: tabs.ok
                        ? undefined
                        : `Tab display names unavailable: ${tabs.reason}. Projects come from test results.`,
                    jira: jira.ok
                        ? {
                              ...jira.value,
                              lastSyncError: cut(jira.value.lastSyncError ?? undefined, 300),
                          }
                        : jiraUnavailable(jira.reason),
                }))
            )
        },
    })
}
