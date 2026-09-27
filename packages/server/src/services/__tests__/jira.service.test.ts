import {describe, it, expect, beforeEach, vi, Mock} from 'vitest'
import {JiraService} from '../jira.service'
import {JiraTicketInfo} from '../../types/jira.types'

const mockConfig = {
    jira: {
        baseUrl: 'https://example.atlassian.net',
        email: 'qa@example.com',
        apiToken: 'test-token',
        enabled: true,
    },
}

vi.mock('../../config/environment.config', () => ({
    get config() {
        return mockConfig
    },
}))

vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}))

function jiraIssue(
    overrides: Partial<{
        key: string
        type: string
        status: string
        category: string
        summary: string
        assignee: string | null
    }> = {}
) {
    return {
        key: overrides.key ?? 'PB-1',
        fields: {
            issuetype: {name: overrides.type ?? 'Bug'},
            status: {
                name: overrides.status ?? 'To Do',
                statusCategory: {key: overrides.category ?? 'new'},
            },
            summary: overrides.summary ?? 'Some summary',
            assignee:
                overrides.assignee === undefined
                    ? {displayName: 'Someone'}
                    : overrides.assignee === null
                      ? null
                      : {displayName: overrides.assignee},
        },
    }
}

describe('JiraService', () => {
    let jiraTicketRepository: {
        getByKeys: Mock
        upsertMany: Mock
        getLastSyncAt: Mock
        getLastSyncStatus: Mock
        setLastSyncStatus: Mock
    }
    let testRepository: {
        getAllLatestMetadata: Mock
    }
    let service: JiraService
    let fetchMock: Mock

    beforeEach(() => {
        mockConfig.jira = {
            baseUrl: 'https://example.atlassian.net',
            email: 'qa@example.com',
            apiToken: 'test-token',
            enabled: true,
        }

        jiraTicketRepository = {
            getByKeys: vi.fn().mockResolvedValue([]),
            upsertMany: vi.fn().mockResolvedValue(undefined),
            getLastSyncAt: vi.fn().mockResolvedValue(null),
            getLastSyncStatus: vi.fn().mockResolvedValue(null),
            setLastSyncStatus: vi.fn().mockResolvedValue(undefined),
        }
        testRepository = {
            getAllLatestMetadata: vi.fn().mockResolvedValue([]),
        }

        fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        service = new JiraService(jiraTicketRepository as any, testRepository as any)
    })

    describe('isEnabled / getStatus', () => {
        it('reflects config.jira.enabled', () => {
            expect(service.isEnabled()).toBe(true)
            mockConfig.jira.enabled = false
            expect(service.isEnabled()).toBe(false)
        })

        it('returns enabled flag, last sync time and last attempt outcome', async () => {
            jiraTicketRepository.getLastSyncAt.mockResolvedValue('2026-09-24T10:00:00.000Z')
            jiraTicketRepository.getLastSyncStatus.mockResolvedValue({
                ok: true,
                errorReason: null,
                attemptedAt: '2026-09-24T10:00:00.000Z',
            })

            const status = await service.getStatus()

            expect(status).toEqual({
                enabled: true,
                lastSyncAt: '2026-09-24T10:00:00.000Z',
                lastSyncOk: true,
                lastSyncError: null,
            })
        })

        it('surfaces the failure reason from the last failed attempt', async () => {
            jiraTicketRepository.getLastSyncStatus.mockResolvedValue({
                ok: false,
                errorReason: 'authentication (401)',
                attemptedAt: '2026-09-24T10:00:00.000Z',
            })

            const status = await service.getStatus()

            expect(status.lastSyncOk).toBe(false)
            expect(status.lastSyncError).toBe('authentication (401)')
        })

        it('reports null for lastSyncOk/lastSyncError when no attempt has ever run', async () => {
            const status = await service.getStatus()

            expect(status.lastSyncOk).toBeNull()
            expect(status.lastSyncError).toBeNull()
        })
    })

    describe('getTicketInfo', () => {
        it('returns [] without querying the repository when no keys are requested', async () => {
            const result = await service.getTicketInfo([])

            expect(result).toEqual([])
            expect(jiraTicketRepository.getByKeys).not.toHaveBeenCalled()
        })

        it('delegates to the repository for the requested keys', async () => {
            const cached: JiraTicketInfo[] = [
                {
                    key: 'PB-1',
                    issueType: 'Bug',
                    statusName: 'To Do',
                    statusCategory: 'new',
                    summary: 'x',
                    assignee: null,
                    fetchedAt: '2026-09-24T10:00:00.000Z',
                },
            ]
            jiraTicketRepository.getByKeys.mockResolvedValue(cached)

            const result = await service.getTicketInfo(['PB-1'])

            expect(jiraTicketRepository.getByKeys).toHaveBeenCalledWith(['PB-1'])
            expect(result).toEqual(cached)
        })

        it('returns [] and never touches the repository once the integration is disabled — even if a cache from an earlier configuration still exists', async () => {
            mockConfig.jira.enabled = false
            jiraTicketRepository.getByKeys.mockResolvedValue([
                {key: 'PB-1'} as unknown as JiraTicketInfo,
            ])

            const result = await service.getTicketInfo(['PB-1'])

            expect(result).toEqual([])
            expect(jiraTicketRepository.getByKeys).not.toHaveBeenCalled()
        })
    })

    describe('refreshAllKnownKeys', () => {
        it('is a no-op when the integration is not configured', async () => {
            mockConfig.jira.enabled = false

            const result = await service.refreshAllKnownKeys()

            expect(result).toEqual({checked: 0, updated: 0, failed: 0})
            expect(testRepository.getAllLatestMetadata).not.toHaveBeenCalled()
            expect(fetchMock).not.toHaveBeenCalled()
        })

        it('is a no-op when no ticket-key tags exist on any test, and still records a successful attempt', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@sanity', '@to-fix']})},
                {metadata: null},
            ])

            const result = await service.refreshAllKnownKeys()

            expect(result).toEqual({checked: 0, updated: 0, failed: 0})
            expect(fetchMock).not.toHaveBeenCalled()
            expect(jiraTicketRepository.setLastSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({ok: true, errorReason: null})
            )
        })

        it('POSTs to /rest/api/3/issue/bulkfetch with issueIdsOrKeys + fields, Basic auth', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1', '@to-fix']})},
                {metadata: JSON.stringify({tags: ['@PB-2']})},
            ])
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    issues: [
                        jiraIssue({key: 'PB-1', category: 'new', status: 'To Do'}),
                        jiraIssue({
                            key: 'PB-2',
                            type: 'Task',
                            category: 'done',
                            status: 'Completed (In Prod)',
                            assignee: null,
                        }),
                    ],
                }),
            })

            const result = await service.refreshAllKnownKeys()

            expect(result).toEqual({checked: 2, updated: 2, failed: 0})
            expect(fetchMock).toHaveBeenCalledTimes(1)

            const [calledUrl, calledInit] = fetchMock.mock.calls[0]
            expect(String(calledUrl)).toBe(
                'https://example.atlassian.net/rest/api/3/issue/bulkfetch'
            )
            expect(calledInit.method).toBe('POST')
            expect(JSON.parse(calledInit.body)).toEqual({
                issueIdsOrKeys: ['PB-1', 'PB-2'],
                fields: ['issuetype', 'status', 'summary', 'assignee'],
            })
            expect(calledInit.headers.Authorization).toBe(
                `Basic ${Buffer.from('qa@example.com:test-token').toString('base64')}`
            )
            expect(calledInit.headers['Content-Type']).toBe('application/json')

            expect(jiraTicketRepository.upsertMany).toHaveBeenCalledWith([
                expect.objectContaining({key: 'PB-1', statusCategory: 'new'}),
                expect.objectContaining({
                    key: 'PB-2',
                    issueType: 'Task',
                    statusCategory: 'done',
                    assignee: null,
                }),
            ])
            expect(jiraTicketRepository.setLastSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({ok: true, errorReason: null})
            )
        })

        it('batches more than 50 keys into multiple requests', async () => {
            const tags = Array.from({length: 60}, (_, i) => `@PB-${i + 1}`)
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags})},
            ])
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({issues: []}),
            })

            await service.refreshAllKnownKeys()

            expect(fetchMock).toHaveBeenCalledTimes(2)
        })

        it('a key Jira could not resolve (issueErrors) does not fail its batch-mates', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1', '@PB-2']})},
            ])
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    issues: [jiraIssue({key: 'PB-1'})],
                    issueErrors: [{id: 'PB-2', errorMessage: 'Issue does not exist'}],
                }),
            })

            const result = await service.refreshAllKnownKeys()

            expect(result).toEqual({checked: 2, updated: 1, failed: 1})
            expect(jiraTicketRepository.upsertMany).toHaveBeenCalledWith([
                expect.objectContaining({key: 'PB-1'}),
            ])
            // A partial-resolve batch is not a sync FAILURE (no exception was thrown) — it just
            // leaves PB-2 without data, same as any other never-synced key.
            expect(jiraTicketRepository.setLastSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({ok: true, errorReason: null})
            )
        })

        it('degrades gracefully on a non-OK Jira response: no throw, batch marked failed, reason recorded', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1']})},
            ])
            fetchMock.mockResolvedValue({ok: false, status: 401, statusText: 'Unauthorized'})

            const result = await service.refreshAllKnownKeys()

            expect(result).toEqual({checked: 1, updated: 0, failed: 1})
            expect(jiraTicketRepository.upsertMany).not.toHaveBeenCalled()
            expect(jiraTicketRepository.setLastSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({ok: false, errorReason: 'authentication (401)'})
            )
        })

        it.each([
            [401, 'authentication (401)'],
            [403, 'authentication (403)'],
            [429, 'rate limited (429)'],
            [503, 'Jira unavailable (503)'],
            [418, 'sync failed (418)'],
        ])('maps HTTP %i to the reason %j', async (status, reason) => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1']})},
            ])
            fetchMock.mockResolvedValue({ok: false, status, statusText: 'x'})

            await service.refreshAllKnownKeys()

            expect(jiraTicketRepository.setLastSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({ok: false, errorReason: reason})
            )
        })

        it('degrades gracefully on a network error: no throw, batch marked failed, generic reason', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1']})},
            ])
            fetchMock.mockRejectedValue(new Error('network down'))

            const result = await service.refreshAllKnownKeys()

            expect(result).toEqual({checked: 1, updated: 0, failed: 1})
            expect(jiraTicketRepository.setLastSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({ok: false, errorReason: 'network error'})
            )
        })

        it('falls back to "indeterminate" for an unrecognised status category', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1']})},
            ])
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    issues: [jiraIssue({key: 'PB-1', category: 'some-unknown-value'})],
                }),
            })

            await service.refreshAllKnownKeys()

            expect(jiraTicketRepository.upsertMany).toHaveBeenCalledWith([
                expect.objectContaining({key: 'PB-1', statusCategory: 'indeterminate'}),
            ])
        })

        it('stamps each ticket with an explicit ISO (Z) fetchedAt, never relying on SQL-side CURRENT_TIMESTAMP', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1']})},
            ])
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({issues: [jiraIssue({key: 'PB-1'})]}),
            })

            await service.refreshAllKnownKeys()

            const [tickets] = jiraTicketRepository.upsertMany.mock.calls[0]
            expect(tickets[0].fetchedAt).toMatch(/Z$/)
            expect(new Date(tickets[0].fetchedAt).toString()).not.toBe('Invalid Date')
        })

        it('a concurrent call while a sync is in flight reuses the same result instead of starting a second sync', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1']})},
            ])
            let resolveFetch!: (value: unknown) => void
            fetchMock.mockReturnValue(
                new Promise((resolve) => {
                    resolveFetch = resolve
                })
            )

            const first = service.refreshAllKnownKeys()
            const second = service.refreshAllKnownKeys()

            resolveFetch({
                ok: true,
                status: 200,
                json: async () => ({issues: [jiraIssue({key: 'PB-1'})]}),
            })
            const [firstResult, secondResult] = await Promise.all([first, second])

            expect(firstResult).toEqual(secondResult)
            expect(testRepository.getAllLatestMetadata).toHaveBeenCalledTimes(1)
            expect(fetchMock).toHaveBeenCalledTimes(1)
        })

        it('a later call, after the in-flight sync finished, starts a fresh sync', async () => {
            testRepository.getAllLatestMetadata.mockResolvedValue([
                {metadata: JSON.stringify({tags: ['@PB-1']})},
            ])
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({issues: [jiraIssue({key: 'PB-1'})]}),
            })

            await service.refreshAllKnownKeys()
            await service.refreshAllKnownKeys()

            expect(testRepository.getAllLatestMetadata).toHaveBeenCalledTimes(2)
            expect(fetchMock).toHaveBeenCalledTimes(2)
        })
    })
})
