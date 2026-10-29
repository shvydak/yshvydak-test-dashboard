import type {CallToolResult} from '@modelcontextprotocol/server'
import {z} from 'zod'
import {DashboardError} from '../auth'
import type {DashboardClient} from '../client'
import {
    IMAGE_ABSOLUTE_MAX_BYTES,
    IMAGE_DEFAULT_MAX_BYTES,
    MAX_FIELD_CHARS,
    MAX_NOT_RETURNED,
    SCREENSHOTS_DEFAULT,
    SCREENSHOTS_MAX,
} from '../constants'
import {HttpGuardError, SizeCapError} from '../http'
import {cut, json} from '../trim'
import {defineTool, type ToolDef} from './common'

const input = z.object({
    testId: z.string().optional().describe('Latest execution of this test (test-xxxx)'),
    executionId: z.string().optional().describe('A specific execution (UUID)'),
    max: z.number().int().min(1).max(SCREENSHOTS_MAX).default(SCREENSHOTS_DEFAULT),
    maxBytes: z
        .number()
        .int()
        .min(10_000)
        .max(IMAGE_ABSOLUTE_MAX_BYTES)
        .default(IMAGE_DEFAULT_MAX_BYTES)
        .describe('Per-image size cap in bytes'),
})

const IMAGE_MIME = new Set(['image/png', 'image/jpeg'])
const mimeOf = (name: string, declared?: string) =>
    declared ??
    (/\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : undefined)

export function screenshotsTool(client: DashboardClient): ToolDef {
    return defineTool({
        name: 'get_screenshots',
        title: 'Get screenshots',
        description:
            'Screenshots of one execution as images (png/jpeg only; videos, traces and logs are never downloaded). Default 1 image, at most 3 per call. Give testId (latest execution) or executionId.',
        input,
        handler: async ({testId, executionId, max, maxBytes}): Promise<CallToolResult> => {
            if (!testId === !executionId) {
                throw new DashboardError('Give exactly one of testId or executionId')
            }
            const row = testId
                ? await client.testByTestId(testId)
                : await client.testByExecutionId(executionId!)

            const shots = (row.attachments ?? []).filter((a) => a.type === 'screenshot')
            const images: CallToolResult['content'] = []
            const returned: string[] = []
            const skipped: Array<{fileName: string; sizeKB: number; reason: string}> = []

            for (const a of shots) {
                const skip = (reason: string) =>
                    skipped.push({
                        fileName: cut(a.fileName, MAX_FIELD_CHARS)!,
                        sizeKB: Math.round(a.fileSize / 1024),
                        reason,
                    })
                const mime = mimeOf(a.fileName, a.mimeType)
                const path = client.attachmentPath(a)
                if (images.length >= max) skip(`over the per-call limit of ${max}`)
                else if (!mime || !IMAGE_MIME.has(mime)) skip('not png/jpeg')
                else if (!path) skip('not downloadable (unrecognised attachment URL)')
                else if (a.fileSize > maxBytes) skip('over size cap')
                else {
                    try {
                        const res = await client.attachmentBytes(path, maxBytes)
                        images.push({
                            type: 'image',
                            data: res.body.toString('base64'),
                            mimeType: mime,
                        })
                        returned.push(a.fileName)
                    } catch (err) {
                        if (err instanceof SizeCapError) skip('over size cap')
                        else if (err instanceof DashboardError)
                            skip(`HTTP ${err.status ?? 'error'}`)
                        else if (err instanceof HttpGuardError) skip('not downloadable')
                        else throw err
                    }
                }
            }

            const summary = {
                testId: row.testId,
                executionId: row.id,
                status: row.status,
                screenshotsOnExecution: shots.length,
                returned,
                notReturned: skipped.slice(0, MAX_NOT_RETURNED),
                notReturnedCount: skipped.length,
                truncated: skipped.length > MAX_NOT_RETURNED || undefined,
                attachmentsClearedAt: cut(row.attachmentsClearedAt, MAX_FIELD_CHARS),
            }
            return {content: [{type: 'text', text: json(summary)}, ...images]}
        },
    })
}
