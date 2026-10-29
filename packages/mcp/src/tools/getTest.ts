import {z} from 'zod'
import {DashboardError} from '../auth'
import type {DashboardClient} from '../client'
import {MAX_ATTACHMENTS, MAX_FIELD_CHARS, MAX_PAYLOAD_CHARS, MAX_TAGS} from '../constants'
import {consoleDetail, cut, errorDetail, fileWithLine, fitPayload, json, stepsDetail} from '../trim'
import {defineTool, textResult, type ToolDef} from './common'

const input = z.object({
    testId: z.string().optional().describe('Stable test id (test-xxxx): the latest execution'),
    executionId: z.string().optional().describe('One execution (UUID), e.g. from get_test_history'),
    detail: z
        .enum(['normal', 'full'])
        .default('normal')
        .describe('"full" triples the error/step/console caps'),
})

export function getTestTool(client: DashboardClient): ToolDef {
    return defineTool({
        name: 'get_test',
        title: 'Get test',
        description:
            'One test execution in detail: error message and stack, failed steps, console, tags, note and attachment list (no bytes; use get_screenshots for images). Give testId (latest execution) or executionId.',
        input,
        handler: async ({testId, executionId, detail}) => {
            if (!testId === !executionId) {
                throw new DashboardError('Give exactly one of testId or executionId')
            }
            const row = testId
                ? await client.testByTestId(testId)
                : await client.testByExecutionId(executionId!)
            const build = (scale: number) => ({
                testId: row.testId,
                executionId: row.id,
                runId: cut(row.runId, MAX_FIELD_CHARS),
                name: cut(row.name, 500),
                file: cut(fileWithLine(row), 500),
                project: cut(row.project || undefined, MAX_FIELD_CHARS),
                status: row.status,
                durationMs: row.duration,
                at: row.createdAt ?? row.timestamp,
                notInCode: row.notInCode || undefined,
                tags: (row.metadata?.tags ?? [])
                    .slice(0, MAX_TAGS)
                    .map((t) => cut(t, MAX_FIELD_CHARS)),
                describe: row.metadata?.describe?.slice(0, 20).map((d) => cut(d, 200)),
                annotations: row.metadata?.annotations,
                note: row.note?.content,
                error: errorDetail(row, scale),
                failedAndLastSteps: stepsDetail(row, scale),
                console: consoleDetail(row, scale),
                attachmentsTotal:
                    (row.attachments ?? []).length > MAX_ATTACHMENTS
                        ? row.attachments!.length
                        : undefined,
                attachments: (row.attachments ?? []).slice(0, MAX_ATTACHMENTS).map((a) => ({
                    id: a.id,
                    type: a.type,
                    fileName: cut(a.fileName, MAX_FIELD_CHARS),
                    sizeKB: Math.round(a.fileSize / 1024),
                    mimeType: a.mimeType,
                })),
                attachmentsClearedAt: cut(row.attachmentsClearedAt, MAX_FIELD_CHARS),
            })

            // "full" must never return less than "normal": step down to a smaller scale before
            // any section is dropped
            const scales = detail === 'full' ? [3, 2, 1] : [1]
            for (const scale of scales) {
                const out = build(scale)
                if (json(out).length <= MAX_PAYLOAD_CHARS) {
                    const reduced = detail === 'full' && scale < 3
                    return textResult(reduced ? {...out, fullDetailReduced: true} : out)
                }
            }
            const fitted = fitPayload(build(1), [
                'console',
                'failedAndLastSteps',
                'error.errors',
                'error.stack',
                'annotations',
                'note',
                'attachments',
                'error.message',
            ])
            return textResult(detail === 'full' ? {...fitted, fullDetailReduced: true} : fitted)
        },
    })
}
