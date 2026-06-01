import {describe, it, expect, beforeEach, vi} from 'vitest'
import {TestRepository} from '../test.repository'

// Mock DatabaseManager
const mockExecute = vi.fn()
const mockQueryAll = vi.fn()
const mockQueryOne = vi.fn()
const mockCompact = vi.fn()

vi.mock('../../database/database.manager', () => {
    return {
        DatabaseManager: {
            getInstance: () => ({
                execute: mockExecute,
                queryAll: mockQueryAll,
                queryOne: mockQueryOne,
                compactDatabase: mockCompact,
            }),
        },
    }
})

describe('TestRepository Retention', () => {
    let repository: TestRepository
    let dbManager: any

    beforeEach(() => {
        vi.clearAllMocks()
        dbManager = {
            execute: mockExecute,
            queryAll: mockQueryAll,
            queryOne: mockQueryOne,
            compactDatabase: mockCompact,
        }

        repository = new TestRepository(dbManager)
    })

    describe('getIdsOlderThan', () => {
        it('should return IDs older than date', async () => {
            const date = new Date('2023-01-01')
            mockQueryAll.mockResolvedValueOnce([{id: '1'}, {id: '2'}])

            const ids = await repository.getIdsOlderThan(date)

            expect(ids).toEqual(['1', '2'])
            expect(mockQueryAll).toHaveBeenCalledWith(expect.stringContaining('created_at < ?'), [
                date.toISOString(),
            ])
        })
    })

    describe('getIdsPrunedByCount', () => {
        it('should return IDs to prune based on count per test', async () => {
            mockQueryAll.mockResolvedValueOnce([{id: 'old1'}, {id: 'old2'}])

            const ids = await repository.getIdsPrunedByCount(5)

            expect(ids).toEqual(['old1', 'old2'])
            expect(mockQueryAll).toHaveBeenCalledWith(
                expect.stringContaining('ROW_NUMBER() OVER'),
                [5]
            )
        })
    })

    describe('getStrippableIdsOlderThan', () => {
        it('should select rows older than date, never the latest run (rn > 1), only with attachments', async () => {
            const date = new Date('2026-01-01')
            mockQueryAll.mockResolvedValueOnce([{id: 'old-2'}, {id: 'old-3'}])

            const ids = await repository.getStrippableIdsOlderThan(date)

            expect(ids).toEqual(['old-2', 'old-3'])
            const [sql, params] = mockQueryAll.mock.calls[0]
            // never strips the most recent execution per test
            expect(sql).toContain('tr.rn > 1')
            // only targets executions that still have attachments
            expect(sql).toContain('EXISTS')
            expect(sql).toContain('FROM attachments')
            expect(params).toEqual([date.toISOString()])
        })
    })

    describe('getStrippableIdsByCount', () => {
        it('should select rows beyond the latest N per test that still have attachments', async () => {
            mockQueryAll.mockResolvedValueOnce([{id: 'a'}])

            const ids = await repository.getStrippableIdsByCount(20)

            expect(ids).toEqual(['a'])
            const [sql, params] = mockQueryAll.mock.calls[0]
            expect(sql).toContain('ROW_NUMBER() OVER')
            expect(sql).toContain('EXISTS')
            expect(params).toEqual([20])
        })
    })

    describe('getAttachmentsSizeForIds', () => {
        it('should return total and per-id sizes from the DB', async () => {
            mockQueryAll.mockResolvedValueOnce([
                {id: 'a', size: 100},
                {id: 'b', size: 250},
            ])

            const result = await repository.getAttachmentsSizeForIds(['a', 'b'])

            expect(result.total).toBe(350)
            expect(result.perId).toEqual({a: 100, b: 250})
            const [sql] = mockQueryAll.mock.calls[0]
            expect(sql).toContain('SUM(file_size)')
            expect(sql).toContain('GROUP BY test_result_id')
        })

        it('should short-circuit on empty input without querying', async () => {
            const result = await repository.getAttachmentsSizeForIds([])
            expect(result).toEqual({total: 0, perId: {}})
            expect(mockQueryAll).not.toHaveBeenCalled()
        })
    })

    describe('getTestExecutionCount', () => {
        it('should return the count excluding pending/skipped placeholders', async () => {
            mockQueryOne.mockResolvedValueOnce({count: 7})

            const count = await repository.getTestExecutionCount('hash-1')

            expect(count).toBe(7)
            const [sql, params] = mockQueryOne.mock.calls[0]
            expect(sql).toContain("status NOT IN ('pending', 'skipped')")
            expect(params).toEqual(['hash-1'])
        })

        it('should return 0 when no row is returned', async () => {
            mockQueryOne.mockResolvedValueOnce(null)
            const count = await repository.getTestExecutionCount('hash-1')
            expect(count).toBe(0)
        })
    })

    describe('getTestResultsByTestId (keyset cursor)', () => {
        it('should add a created_at cursor clause when `before` is provided', async () => {
            mockQueryAll.mockResolvedValueOnce([])

            await repository.getTestResultsByTestId('hash-1', 50, '2026-05-01T00:00:00.000Z')

            const [sql, params] = mockQueryAll.mock.calls[0]
            expect(sql).toContain('created_at < ?')
            expect(params).toEqual(['hash-1', '2026-05-01T00:00:00.000Z', 50])
        })

        it('should omit the cursor clause when `before` is absent', async () => {
            mockQueryAll.mockResolvedValueOnce([])

            await repository.getTestResultsByTestId('hash-1', 50)

            const [sql, params] = mockQueryAll.mock.calls[0]
            expect(sql).not.toContain('created_at < ?')
            expect(params).toEqual(['hash-1', 50])
        })
    })

    describe('deleteByIds', () => {
        it('should delete IDs in batches', async () => {
            const ids = Array.from({length: 1000}, (_, i) => `id-${i}`)
            mockExecute.mockResolvedValue({changes: 500}) // Mock return for each batch

            const deletedCount = await repository.deleteByIds(ids)

            // Should be called twice (900 + 100)
            expect(mockExecute).toHaveBeenCalledTimes(2)
            expect(mockCompact).toHaveBeenCalledTimes(1)
            expect(deletedCount).toBe(1000) // 500 + 500
        })

        it('should handle empty list', async () => {
            const count = await repository.deleteByIds([])
            expect(count).toBe(0)
            expect(mockExecute).not.toHaveBeenCalled()
        })
    })
})
