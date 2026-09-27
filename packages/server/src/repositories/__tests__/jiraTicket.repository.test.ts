import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {JiraTicketRepository} from '../jiraTicket.repository'
import {DatabaseManager} from '../../database/database.manager'
import {JiraTicketInfo} from '../../types/jira.types'

describe('JiraTicketRepository', () => {
    let repository: JiraTicketRepository
    let dbManager: DatabaseManager

    const ticket = (overrides: Partial<JiraTicketInfo> = {}): JiraTicketInfo => ({
        key: 'PB-4531',
        issueType: 'Bug',
        statusName: 'To Do',
        statusCategory: 'new',
        summary: 'Was able to add the same item twice',
        assignee: 'Tamir Scherzer',
        fetchedAt: '2026-09-24T10:00:00.000Z',
        ...overrides,
    })

    beforeEach(async () => {
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()
        repository = new JiraTicketRepository(dbManager)
    })

    afterEach(async () => {
        await dbManager.close()
    })

    describe('getByKeys()', () => {
        it('returns [] for an empty key list without querying', async () => {
            const result = await repository.getByKeys([])
            expect(result).toEqual([])
        })

        it('returns [] for keys that were never cached', async () => {
            const result = await repository.getByKeys(['PB-999'])
            expect(result).toEqual([])
        })

        it('returns only the requested, cached keys', async () => {
            await repository.upsertMany([ticket({key: 'PB-1'}), ticket({key: 'PB-2'})])

            const result = await repository.getByKeys(['PB-1', 'PB-999'])

            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({key: 'PB-1', issueType: 'Bug', statusCategory: 'new'})
        })
    })

    describe('upsertMany()', () => {
        it('inserts a new ticket', async () => {
            await repository.upsertMany([ticket()])

            const [result] = await repository.getByKeys(['PB-4531'])

            expect(result).toMatchObject({
                key: 'PB-4531',
                issueType: 'Bug',
                statusName: 'To Do',
                statusCategory: 'new',
                summary: 'Was able to add the same item twice',
                assignee: 'Tamir Scherzer',
            })
        })

        it('replaces an existing ticket on re-sync (status changed) rather than duplicating it', async () => {
            await repository.upsertMany([ticket({statusName: 'To Do', statusCategory: 'new'})])
            await repository.upsertMany([
                ticket({statusName: 'Done', statusCategory: 'done', assignee: null}),
            ])

            const [result] = await repository.getByKeys(['PB-4531'])

            expect(result.statusName).toBe('Done')
            expect(result.statusCategory).toBe('done')
            expect(result.assignee).toBeNull()
        })

        it('is a no-op for an empty list', async () => {
            await expect(repository.upsertMany([])).resolves.not.toThrow()
        })

        it('stores fetched_at exactly as given (ISO, with Z) — never a naive SQL-side CURRENT_TIMESTAMP', async () => {
            // A naive "YYYY-MM-DD HH:MM:SS" (no Z) is what CURRENT_TIMESTAMP produces and is
            // exactly the bug this guards: the frontend parses that as LOCAL time, not UTC.
            await repository.upsertMany([ticket({fetchedAt: '2020-01-01T00:00:00.000Z'})])

            const [result] = await repository.getByKeys(['PB-4531'])

            expect(result.fetchedAt).toBe('2020-01-01T00:00:00.000Z')
        })
    })

    describe('getLastSyncAt()', () => {
        it('returns null when nothing has been cached yet', async () => {
            const result = await repository.getLastSyncAt()
            expect(result).toBeNull()
        })

        it('returns the exact ISO (with Z) timestamp that was written', async () => {
            await repository.upsertMany([ticket({fetchedAt: '2026-09-24T10:00:00.000Z'})])

            const result = await repository.getLastSyncAt()

            expect(result).toBe('2026-09-24T10:00:00.000Z')
        })
    })

    describe('getLastSyncStatus() / setLastSyncStatus()', () => {
        it('returns null before any attempt has been recorded', async () => {
            expect(await repository.getLastSyncStatus()).toBeNull()
        })

        it('round-trips a successful attempt', async () => {
            await repository.setLastSyncStatus({
                ok: true,
                errorReason: null,
                attemptedAt: '2026-09-24T10:00:00.000Z',
            })

            expect(await repository.getLastSyncStatus()).toEqual({
                ok: true,
                errorReason: null,
                attemptedAt: '2026-09-24T10:00:00.000Z',
            })
        })

        it('round-trips a failed attempt with its human-readable reason', async () => {
            await repository.setLastSyncStatus({
                ok: false,
                errorReason: 'authentication (401)',
                attemptedAt: '2026-09-24T10:00:00.000Z',
            })

            expect(await repository.getLastSyncStatus()).toEqual({
                ok: false,
                errorReason: 'authentication (401)',
                attemptedAt: '2026-09-24T10:00:00.000Z',
            })
        })

        it('overwrites rather than accumulates — single row', async () => {
            await repository.setLastSyncStatus({
                ok: false,
                errorReason: 'network error',
                attemptedAt: '2026-09-24T09:00:00.000Z',
            })
            await repository.setLastSyncStatus({
                ok: true,
                errorReason: null,
                attemptedAt: '2026-09-24T10:00:00.000Z',
            })

            expect(await repository.getLastSyncStatus()).toEqual({
                ok: true,
                errorReason: null,
                attemptedAt: '2026-09-24T10:00:00.000Z',
            })
        })
    })
})
