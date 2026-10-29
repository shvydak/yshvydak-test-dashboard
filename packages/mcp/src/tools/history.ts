import {z} from 'zod'
import type {DashboardClient} from '../client'
import {
    HISTORY_DEFAULT_LIMIT,
    HISTORY_MAX_LIMIT,
    MAX_ERROR_LINE_CHARS,
    MAX_FIELD_CHARS,
} from '../constants'
import {cut, firstLine, fitRows, plain} from '../trim'
import {defineTool, isFailing, textResult, type ToolDef} from './common'

const input = z.object({
    testId: z.string().describe('Stable test id (test-xxxx)'),
    limit: z.number().int().min(1).max(HISTORY_MAX_LIMIT).default(HISTORY_DEFAULT_LIMIT),
    before: z
        .string()
        .refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date')
        .optional()
        .describe('Only executions older than this ISO time (use nextBefore from the last call)'),
})

export function historyTool(client: DashboardClient): ToolDef {
    return defineTool({
        name: 'get_test_history',
        title: 'Test history',
        description:
            'Execution history of one test, newest first: status per run, when it last passed, since when it fails. Counts real executions only (passed, failed, timedOut); skipped and pending runs are not recorded here. Paging uses a 1-second timestamp cursor, so executions in the same second as a page boundary can be skipped.',
        input,
        handler: async ({testId, limit, before}) => {
            const {rows, total} = await client.history(testId, limit, before)
            const sorted = [...rows].sort(
                (a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')
            )
            const window = {passed: 0, failed: 0, timedOut: 0}
            for (const r of sorted) {
                if (r.status === 'passed') window.passed++
                else if (r.status === 'failed') window.failed++
                else if (r.status === 'timedOut') window.timedOut++
            }
            const lastPassed = sorted.find((r) => r.status === 'passed')
            let failingSince: string | undefined
            let streakReachesWindowStart = false
            if (sorted[0] && isFailing(sorted[0].status)) {
                const streak = []
                for (const r of sorted) {
                    if (!isFailing(r.status)) break
                    streak.push(r)
                }
                failingSince = streak[streak.length - 1].createdAt
                streakReachesWindowStart = streak.length === sorted.length
            }
            const executions = sorted.map((r) => ({
                executionId: r.id,
                at: r.createdAt,
                status: r.status,
                durationMs: r.duration,
                project: cut(r.project || undefined, MAX_FIELD_CHARS),
                runId: cut(r.runId, MAX_FIELD_CHARS),
                error: firstLine(plain(r.errorMessage), MAX_ERROR_LINE_CHARS),
                screenshots: r.attachments
                    ? r.attachments.filter((a) => a.type === 'screenshot').length
                    : undefined,
            }))
            const hasMore = rows.length > 0 && rows.length < total && rows.length >= limit
            return textResult(
                fitRows(executions, (kept) => ({
                    totalExecutions: total,
                    returned: kept.length,
                    window,
                    lastPassedAt: lastPassed?.createdAt,
                    failingSince,
                    failingSinceIsWindowStart: failingSince ? streakReachesWindowStart : undefined,
                    nextBefore:
                        hasMore || kept.length < executions.length
                            ? kept[kept.length - 1]?.at
                            : undefined,
                    executions: kept,
                }))
            )
        },
    })
}
