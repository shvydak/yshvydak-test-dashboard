import {describe, it, expect, beforeEach, vi} from 'vitest'
import {TestRepository} from '../test.repository'

// Mock DatabaseManager
const mockExecute = vi.fn()
const mockQueryAll = vi.fn()
const mockCompact = vi.fn()

vi.mock('../../database/database.manager', () => {
    return {
        DatabaseManager: {
            getInstance: () => ({
                execute: mockExecute,
                queryAll: mockQueryAll,
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
