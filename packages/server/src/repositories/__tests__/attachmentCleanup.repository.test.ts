import {describe, it, expect, beforeEach, vi} from 'vitest'
import {AttachmentCleanupRepository} from '../attachmentCleanup.repository'

const mockExecute = vi.fn()

describe('AttachmentCleanupRepository', () => {
    let repository: AttachmentCleanupRepository

    beforeEach(() => {
        vi.clearAllMocks()
        repository = new AttachmentCleanupRepository({execute: mockExecute} as any)
    })

    describe('markCleared', () => {
        it('should upsert all executions in a single batched multi-row statement', async () => {
            await repository.markCleared([
                {testResultId: 'a', freedBytes: 100},
                {testResultId: 'b', freedBytes: 250},
            ])

            // Batched: one round-trip for both rows.
            expect(mockExecute).toHaveBeenCalledTimes(1)
            const [sql, params] = mockExecute.mock.calls[0]
            expect(sql).toContain('INSERT INTO attachment_cleanups')
            expect(sql).toContain('ON CONFLICT(test_result_id) DO UPDATE')
            // Two value tuples, 3 bound params each (id, cleared_at, freed_bytes).
            expect(sql).toContain('(?, ?, ?), (?, ?, ?)')
            expect(params).toHaveLength(6)
            expect(params[0]).toBe('a')
            expect(params[2]).toBe(100)
            expect(params[3]).toBe('b')
            expect(params[5]).toBe(250)
        })

        it('should split into multiple statements beyond the batch size', async () => {
            const entries = Array.from({length: 301}, (_, i) => ({
                testResultId: `id-${i}`,
                freedBytes: i,
            }))

            await repository.markCleared(entries)

            // 301 rows → 300 + 1 across two batches.
            expect(mockExecute).toHaveBeenCalledTimes(2)
        })

        it('should be a no-op for an empty list', async () => {
            await repository.markCleared([])
            expect(mockExecute).not.toHaveBeenCalled()
        })
    })
})
