import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {act, renderHook, waitFor} from '@testing-library/react'
import {usePipelineStatus} from '../usePipelineStatus'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
}))

vi.mock('@config/environment.config', () => ({
    config: {
        api: {
            baseUrl: 'http://localhost:3000/api',
        },
    },
}))

import {authGet} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>

function makeResponse(body: unknown, ok = true) {
    return {
        ok,
        json: () => Promise.resolve(body),
    } as unknown as Response
}

describe('usePipelineStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockAuthGet.mockResolvedValue(makeResponse({}, false))
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('starts with no pipeline state when nothing is in flight', async () => {
        const {result} = renderHook(() => usePipelineStatus())

        await waitFor(() => expect(mockAuthGet).toHaveBeenCalled())
        expect(result.current.pipeline).toBeNull()
    })

    it('rehydrates from GET /pipeline/status/current on mount', async () => {
        const pipelineState = {
            pipelineRunId: 'p1',
            status: 'running',
            steps: [
                {
                    project: 'API_Tests',
                    displayName: 'API Tests',
                    stopOnFailure: true,
                    status: 'running',
                },
            ],
            startedAt: '2026-01-01T00:00:00.000Z',
        }
        mockAuthGet.mockResolvedValue(makeResponse({data: pipelineState}))

        const {result} = renderHook(() => usePipelineStatus())

        await waitFor(() => expect(result.current.pipeline).toEqual(pipelineState))
    })

    it('does not fetch when not authenticated', () => {
        renderHook(() => usePipelineStatus(false))
        expect(mockAuthGet).not.toHaveBeenCalled()
    })

    describe('applyPipelineEvent', () => {
        it('sets pipeline state on pipeline:started', () => {
            const {result} = renderHook(() => usePipelineStatus())

            act(() => {
                result.current.applyPipelineEvent('pipeline:started', {
                    pipelineRunId: 'p2',
                    steps: [
                        {
                            project: 'API_Tests',
                            displayName: 'API Tests',
                            stopOnFailure: true,
                            status: 'queued',
                        },
                    ],
                })
            })

            expect(result.current.pipeline?.pipelineRunId).toBe('p2')
            expect(result.current.pipeline?.status).toBe('running')
            expect(result.current.pipeline?.steps).toHaveLength(1)
        })

        it('updates a single step to running on pipeline:step-started', () => {
            const {result} = renderHook(() => usePipelineStatus())

            act(() => {
                result.current.applyPipelineEvent('pipeline:started', {
                    pipelineRunId: 'p3',
                    steps: [
                        {
                            project: 'API_Tests',
                            displayName: 'API Tests',
                            stopOnFailure: true,
                            status: 'queued',
                        },
                        {
                            project: 'All_Tests',
                            displayName: 'WEB Tests (CI)',
                            stopOnFailure: false,
                            status: 'queued',
                        },
                    ],
                })
            })

            act(() => {
                result.current.applyPipelineEvent('pipeline:step-started', {
                    pipelineRunId: 'p3',
                    project: 'API_Tests',
                    runId: 'run-1',
                })
            })

            const apiStep = result.current.pipeline?.steps.find((s) => s.project === 'API_Tests')
            const allStep = result.current.pipeline?.steps.find((s) => s.project === 'All_Tests')
            expect(apiStep?.status).toBe('running')
            expect(apiStep?.runId).toBe('run-1')
            expect(allStep?.status).toBe('queued')
        })

        it('replaces the step with the completed summary on pipeline:step-completed', () => {
            const {result} = renderHook(() => usePipelineStatus())

            act(() => {
                result.current.applyPipelineEvent('pipeline:started', {
                    pipelineRunId: 'p4',
                    steps: [
                        {
                            project: 'API_Tests',
                            displayName: 'API Tests',
                            stopOnFailure: true,
                            status: 'running',
                        },
                    ],
                })
            })

            act(() => {
                result.current.applyPipelineEvent('pipeline:step-completed', {
                    pipelineRunId: 'p4',
                    step: {
                        project: 'API_Tests',
                        displayName: 'API Tests',
                        stopOnFailure: true,
                        status: 'failed',
                        passed: 5,
                        failed: 3,
                    },
                })
            })

            const apiStep = result.current.pipeline?.steps.find((s) => s.project === 'API_Tests')
            expect(apiStep?.status).toBe('failed')
            expect(apiStep?.failed).toBe(3)
        })

        it('updates overall status on pipeline:completed', () => {
            const {result} = renderHook(() => usePipelineStatus())

            act(() => {
                result.current.applyPipelineEvent('pipeline:started', {
                    pipelineRunId: 'p5',
                    steps: [
                        {
                            project: 'API_Tests',
                            displayName: 'API Tests',
                            stopOnFailure: true,
                            status: 'failed',
                        },
                    ],
                })
            })

            act(() => {
                result.current.applyPipelineEvent('pipeline:completed', {
                    pipelineRunId: 'p5',
                    status: 'stopped_early',
                    steps: [
                        {
                            project: 'API_Tests',
                            displayName: 'API Tests',
                            stopOnFailure: true,
                            status: 'failed',
                            passed: 5,
                            failed: 3,
                        },
                    ],
                })
            })

            expect(result.current.pipeline?.status).toBe('stopped_early')
        })

        it('ignores events for a pipelineRunId that does not match the current one', () => {
            const {result} = renderHook(() => usePipelineStatus())

            act(() => {
                result.current.applyPipelineEvent('pipeline:started', {
                    pipelineRunId: 'current',
                    steps: [
                        {
                            project: 'API_Tests',
                            displayName: 'API Tests',
                            stopOnFailure: true,
                            status: 'queued',
                        },
                    ],
                })
            })

            act(() => {
                result.current.applyPipelineEvent('pipeline:step-started', {
                    pipelineRunId: 'stale',
                    project: 'API_Tests',
                    runId: 'run-x',
                })
            })

            const apiStep = result.current.pipeline?.steps.find((s) => s.project === 'API_Tests')
            expect(apiStep?.status).toBe('queued')
        })
    })

    describe('CI queue', () => {
        const queued = [{pipeline: 'production', queuedAt: '2026-01-01T00:00:00.000Z'}]

        it('starts with an empty queue', async () => {
            const {result} = renderHook(() => usePipelineStatus())

            await waitFor(() => expect(mockAuthGet).toHaveBeenCalled())
            expect(result.current.queue).toEqual([])
        })

        it('rehydrates the queue from GET /pipeline/status/current, even with no pipeline', async () => {
            mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: queued}))

            const {result} = renderHook(() => usePipelineStatus())

            await waitFor(() => expect(result.current.queue).toEqual(queued))
            expect(result.current.pipeline).toBeNull()
        })

        it('follows pipeline:queue-changed events, including emptying', () => {
            const {result} = renderHook(() => usePipelineStatus())

            act(() => {
                result.current.applyPipelineEvent('pipeline:queue-changed', {queue: queued})
            })
            expect(result.current.queue).toEqual(queued)

            act(() => {
                result.current.applyPipelineEvent('pipeline:queue-changed', {queue: []})
            })
            expect(result.current.queue).toEqual([])
        })

        it('treats a malformed queue event as empty', () => {
            const {result} = renderHook(() => usePipelineStatus())

            act(() => {
                result.current.applyPipelineEvent('pipeline:queue-changed', {queue: queued})
                result.current.applyPipelineEvent('pipeline:queue-changed', {})
            })

            expect(result.current.queue).toEqual([])
        })
    })

    describe('resync after a WebSocket reconnect', () => {
        const startRunning = (result: {current: ReturnType<typeof usePipelineStatus>}) => {
            act(() => {
                result.current.applyPipelineEvent('pipeline:started', {
                    pipelineRunId: 'p1',
                    steps: [
                        {
                            project: 'API_Tests',
                            displayName: 'API Tests',
                            stopOnFailure: true,
                            status: 'queued',
                        },
                    ],
                })
                result.current.applyPipelineEvent('pipeline:queue-changed', {
                    queue: [{pipeline: 'production', queuedAt: '2026-01-01T00:00:00.000Z'}],
                })
            })
            expect(result.current.pipeline?.status).toBe('running')
            expect(result.current.queue).toHaveLength(1)
        }

        it('replaces a stale running pipeline and queue with the server state', async () => {
            const {result} = renderHook(() => usePipelineStatus())
            await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(1))
            startRunning(result)

            // pipeline:completed and the queue-emptied event were missed while offline
            mockAuthGet.mockResolvedValue(
                makeResponse({
                    data: {
                        pipelineRunId: 'p1',
                        status: 'completed',
                        steps: [],
                        startedAt: '2026-01-01T00:00:00.000Z',
                    },
                    queue: [],
                })
            )
            await act(async () => {
                result.current.resync()
            })

            await waitFor(() => expect(result.current.pipeline?.status).toBe('completed'))
            expect(result.current.queue).toEqual([])
        })

        it('clears a stale running pipeline when the server has none (404, e.g. after a restart)', async () => {
            const {result} = renderHook(() => usePipelineStatus())
            await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(1))
            startRunning(result)

            mockAuthGet.mockResolvedValue({ok: false, status: 404} as unknown as Response)
            await act(async () => {
                result.current.resync()
            })

            await waitFor(() => expect(result.current.pipeline).toBeNull())
            expect(result.current.queue).toEqual([])
        })

        it('keeps the current state when the resync request itself fails', async () => {
            const {result} = renderHook(() => usePipelineStatus())
            await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(1))
            startRunning(result)

            mockAuthGet.mockRejectedValue(new Error('offline'))
            await act(async () => {
                result.current.resync()
            })

            expect(result.current.pipeline?.status).toBe('running')
            expect(result.current.queue).toHaveLength(1)
        })

        it('does nothing when not authenticated', async () => {
            const {result} = renderHook(() => usePipelineStatus(false))

            await act(async () => {
                result.current.resync()
            })

            expect(mockAuthGet).not.toHaveBeenCalled()
        })
    })

    describe('stopping and cancelled runs', () => {
        it('is not stopping by default', () => {
            const {result} = renderHook(() => usePipelineStatus())

            expect(result.current.stopping).toBe(false)
        })

        it('shows stopping on run:stopping and clears it on run:cancelled', () => {
            const {result} = renderHook(() => usePipelineStatus())

            act(() => {
                result.current.applyPipelineEvent('run:stopping', {reason: 'manual'})
            })
            expect(result.current.stopping).toBe(true)

            act(() => {
                result.current.applyPipelineEvent('run:cancelled', {
                    runIds: ['r1'],
                    reason: 'manual',
                })
            })
            expect(result.current.stopping).toBe(false)
        })

        it('takes the cancelled status from pipeline:completed', () => {
            const {result} = renderHook(() => usePipelineStatus())
            act(() => {
                result.current.applyPipelineEvent('pipeline:started', {
                    pipelineRunId: 'p9',
                    steps: [
                        {
                            project: 'API',
                            displayName: 'API',
                            stopOnFailure: false,
                            status: 'running',
                        },
                    ],
                })
            })

            act(() => {
                result.current.applyPipelineEvent('pipeline:completed', {
                    pipelineRunId: 'p9',
                    status: 'cancelled',
                    steps: [
                        {
                            project: 'API',
                            displayName: 'API',
                            stopOnFailure: false,
                            status: 'skipped',
                        },
                    ],
                })
            })

            expect(result.current.pipeline?.status).toBe('cancelled')
            expect(result.current.pipeline?.steps[0].status).toBe('skipped')
        })

        it('rehydrates stopping from the server after a reload mid-stop', async () => {
            mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], stopping: true}))

            const {result} = renderHook(() => usePipelineStatus())

            await waitFor(() => expect(result.current.stopping).toBe(true))
        })

        it('a resync that finds nothing resets a stale stopping flag', async () => {
            const {result} = renderHook(() => usePipelineStatus())
            act(() => {
                result.current.applyPipelineEvent('run:stopping', {reason: 'manual'})
            })
            mockAuthGet.mockResolvedValue({ok: false, status: 404} as Response)

            act(() => {
                result.current.resync()
            })

            await waitFor(() => expect(result.current.stopping).toBe(false))
        })
    })
})
