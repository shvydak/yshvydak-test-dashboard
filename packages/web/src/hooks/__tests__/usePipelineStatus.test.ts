import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {act, renderHook, waitFor} from '@testing-library/react'
import {usePipelineStatus} from '../usePipelineStatus'
import {LIVE_COUNTS_REFRESH_DELAY_MS} from '@features/tests/store/testsStore'

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

    describe('live failure counts', () => {
        const stopped = (stillFailing: number) => ({
            pipelineRunId: 'p1',
            status: 'stopped_early',
            startedAt: '2026-01-01T00:00:00.000Z',
            steps: [
                {
                    project: 'API',
                    displayName: 'API',
                    stopOnFailure: true,
                    status: 'failed',
                    runId: 'r1',
                    failed: 3,
                    failedTotal: 3,
                    stillFailing,
                },
                {project: 'WEB', displayName: 'WEB', stopOnFailure: false, status: 'skipped'},
            ],
        })

        const loaded = async (state: unknown) => {
            mockAuthGet.mockResolvedValue(makeResponse({data: state}))
            const hook = renderHook(() => usePipelineStatus())
            await waitFor(() => expect(hook.result.current.pipeline).not.toBeNull())
            mockAuthGet.mockClear()
            return hook
        }

        const setHidden = (hidden: boolean) =>
            Object.defineProperty(document, 'hidden', {configurable: true, value: hidden})

        afterEach(() => {
            vi.useRealTimers()
            setHidden(false)
        })

        it('re-reads the counts once per window however many results arrive', async () => {
            const {result} = await loaded(stopped(3))
            mockAuthGet.mockResolvedValue(makeResponse({data: stopped(1)}))
            vi.useFakeTimers()

            act(() => {
                result.current.refreshFailures()
                result.current.refreshFailures()
                result.current.refreshFailures()
            })
            expect(mockAuthGet).not.toHaveBeenCalled()
            await act(async () => {
                await vi.advanceTimersByTimeAsync(LIVE_COUNTS_REFRESH_DELAY_MS)
            })
            vi.useRealTimers()

            expect(mockAuthGet).toHaveBeenCalledTimes(1)
            await waitFor(() => expect(result.current.pipeline?.steps[0].stillFailing).toBe(1))
        })

        it('does not fetch when there is no stopped pipeline with a failed step', async () => {
            const running = {...stopped(3), status: 'running'}
            const {result} = await loaded(running)
            vi.useFakeTimers()

            act(() => {
                result.current.refreshFailures()
            })
            await act(async () => {
                await vi.advanceTimersByTimeAsync(LIVE_COUNTS_REFRESH_DELAY_MS * 2)
            })

            expect(mockAuthGet).not.toHaveBeenCalled()
        })

        it('a hidden tab skips the fetch and catches up once when visible again', async () => {
            const {result} = await loaded(stopped(3))
            vi.useFakeTimers()
            setHidden(true)

            act(() => {
                result.current.refreshFailures()
            })
            await act(async () => {
                await vi.advanceTimersByTimeAsync(LIVE_COUNTS_REFRESH_DELAY_MS * 2)
            })
            expect(mockAuthGet).not.toHaveBeenCalled()

            setHidden(false)
            await act(async () => {
                document.dispatchEvent(new Event('visibilitychange'))
            })

            expect(mockAuthGet).toHaveBeenCalledTimes(1)
        })

        it('re-reads the status when a pipeline stops early (the event carries no counts)', async () => {
            const {result} = await loaded({...stopped(3), status: 'running'})
            mockAuthGet.mockResolvedValue(makeResponse({data: stopped(3)}))

            act(() => {
                result.current.applyPipelineEvent('pipeline:completed', {
                    pipelineRunId: 'p1',
                    status: 'stopped_early',
                    steps: [
                        {project: 'API', displayName: 'API', stopOnFailure: true, status: 'failed'},
                    ],
                })
            })

            expect(mockAuthGet).toHaveBeenCalledTimes(1)
            await waitFor(() => expect(result.current.pipeline?.steps[0].stillFailing).toBe(3))
        })

        it('a refetch started before a pipeline event is re-read, not applied over the event', async () => {
            const {result} = await loaded(stopped(3))
            const running = {
                pipelineRunId: 'p2',
                status: 'running',
                startedAt: '2026-01-02T00:00:00.000Z',
                steps: [
                    {project: 'API', displayName: 'API', stopOnFailure: true, status: 'running'},
                ],
            }
            let releaseOld: (r: Response) => void = () => {}
            mockAuthGet.mockReturnValueOnce(new Promise<Response>((r) => (releaseOld = r)))
            mockAuthGet.mockResolvedValue(makeResponse({data: running}))

            act(() => {
                result.current.resync()
            })
            act(() => {
                result.current.applyPipelineEvent('pipeline:started', {
                    pipelineRunId: 'p2',
                    steps: running.steps,
                })
            })
            await act(async () => {
                releaseOld(makeResponse({data: stopped(3)}))
            })

            await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(2))
            await waitFor(() => expect(result.current.pipeline?.pipelineRunId).toBe('p2'))
            expect(result.current.pipeline?.status).toBe('running')
        })

        const apiStep = (status: string) => ({
            project: 'API',
            displayName: 'API',
            stopOnFailure: true,
            status,
        })
        const live = (status: string, stepStatus: string) => ({
            pipelineRunId: 'p1',
            status,
            startedAt: '2026-01-01T00:00:00.000Z',
            steps: [apiStep(stepStatus)],
        })

        it.each([
            [
                'pipeline:step-started',
                {pipelineRunId: 'p1', project: 'API', runId: 'r1'},
                live('running', 'running'),
            ],
            [
                'pipeline:step-completed',
                {pipelineRunId: 'p1', step: apiStep('passed')},
                live('running', 'passed'),
            ],
            [
                'pipeline:completed',
                {pipelineRunId: 'p1', status: 'completed', steps: [apiStep('passed')]},
                live('completed', 'passed'),
            ],
        ])(
            'a refetch started before %s is re-read, not applied over it',
            async (type, eventData, afterEvent) => {
                const {result} = await loaded(live('running', 'pending'))
                let releaseOld: (r: Response) => void = () => {}
                mockAuthGet.mockReturnValueOnce(new Promise<Response>((r) => (releaseOld = r)))
                mockAuthGet.mockResolvedValue(makeResponse({data: afterEvent}))

                act(() => {
                    result.current.resync()
                })
                act(() => {
                    result.current.applyPipelineEvent(type, eventData)
                })
                await act(async () => {
                    releaseOld(makeResponse({data: live('running', 'pending')}))
                })

                await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(2))
                await waitFor(() => expect(result.current.pipeline).toMatchObject(afterEvent))
            }
        )

        it('ignores a slower, older reply', async () => {
            const {result} = await loaded(stopped(3))
            let releaseSlow: (r: Response) => void = () => {}
            mockAuthGet.mockReturnValueOnce(new Promise<Response>((r) => (releaseSlow = r)))
            mockAuthGet.mockResolvedValueOnce(makeResponse({data: stopped(1)}))

            act(() => {
                result.current.resync()
                result.current.resync()
            })
            await waitFor(() => expect(result.current.pipeline?.steps[0].stillFailing).toBe(1))
            await act(async () => {
                releaseSlow(makeResponse({data: stopped(3)}))
            })

            expect(result.current.pipeline?.steps[0].stillFailing).toBe(1)
        })
    })
})

describe('usePipelineStatus — the stopped banner (lastStop, from the server)', () => {
    const steps = [
        {
            project: 'API',
            displayName: 'API',
            stopOnFailure: false,
            status: 'running' as const,
            runId: 'r1',
        },
        {project: 'WEB', displayName: 'WEB', stopOnFailure: false, status: 'queued' as const},
    ]
    const stop = {
        stoppedAt: '2026-11-17T10:00:00.000Z',
        reason: 'manual' as const,
        kind: 'run-all' as const,
        name: 'API',
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockAuthGet.mockResolvedValue(makeResponse({}, false))
    })

    it('pipeline:started keeps the pipeline name (the Stop dialog names it)', () => {
        const {result} = renderHook(() => usePipelineStatus())

        act(() => {
            result.current.applyPipelineEvent('pipeline:started', {
                pipelineRunId: 'p1',
                pipeline: 'develop',
                steps,
            })
        })

        expect(result.current.pipeline?.pipeline).toBe('develop')
    })

    it('a tab that opens later reads the last stop from the server', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], lastStop: stop}))

        const {result} = renderHook(() => usePipelineStatus())

        await waitFor(() => expect(result.current.lastStop).toEqual(stop))
    })

    it('run:cancelled of a stop that kept its results re-reads the server (a standalone Run All too)', async () => {
        const {result} = renderHook(() => usePipelineStatus())
        await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(1))
        mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], lastStop: stop}))

        act(() => {
            result.current.applyPipelineEvent('run:cancelled', {
                runIds: ['r9'],
                reason: 'manual',
                resultsKept: true,
            })
        })

        await waitFor(() => expect(result.current.lastStop).toEqual(stop))
        expect(mockAuthGet).toHaveBeenCalledTimes(2)
    })

    it('the flow from the review: an older stop is shown, a Run All is stopped in the same tab, and the new stop replaces it', async () => {
        const older = {
            ...stop,
            kind: 'pipeline' as const,
            name: 'develop',
            stoppedAt: '2026-11-17T08:00:00.000Z',
        }
        mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], lastStop: older}))
        const {result} = renderHook(() => usePipelineStatus())
        await waitFor(() => expect(result.current.lastStop).toEqual(older))
        mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], lastStop: stop}))

        act(() => {
            result.current.applyPipelineEvent('run:cancelled', {
                runIds: ['r9'],
                reason: 'manual',
                resultsKept: true,
            })
        })

        await waitFor(() => expect(result.current.lastStop).toEqual(stop))
    })

    it('run:cancelled of a discarded run (replaced) does not re-read', async () => {
        const {result} = renderHook(() => usePipelineStatus())
        await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(1))

        act(() => {
            result.current.applyPipelineEvent('run:cancelled', {
                runIds: ['r9'],
                reason: 'replaced',
                resultsKept: false,
            })
        })

        expect(mockAuthGet).toHaveBeenCalledTimes(1)
    })

    it('a finished run re-reads while a stop notice is shown; the server then ends it for everyone', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], lastStop: stop}))
        const {result} = renderHook(() => usePipelineStatus())
        await waitFor(() => expect(result.current.lastStop).toEqual(stop))
        mockAuthGet.mockClear()
        mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], lastStop: null}))

        act(() => {
            result.current.applyPipelineEvent('run:completed', {runId: 'r10', type: 'rerun'})
        })

        await waitFor(() => expect(result.current.lastStop).toBeNull())
        expect(mockAuthGet).toHaveBeenCalledTimes(1)
    })

    it('a finished run does not re-read when no stop notice is shown', async () => {
        const {result} = renderHook(() => usePipelineStatus())
        await waitFor(() => expect(mockAuthGet).toHaveBeenCalledTimes(1))

        act(() => {
            result.current.applyPipelineEvent('run:completed', {runId: 'r10'})
        })

        expect(mockAuthGet).toHaveBeenCalledTimes(1)
    })

    it('the next CI pipeline starting clears the notice at once', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], lastStop: stop}))
        const {result} = renderHook(() => usePipelineStatus())
        await waitFor(() => expect(result.current.lastStop).toEqual(stop))

        act(() => {
            result.current.applyPipelineEvent('pipeline:started', {
                pipelineRunId: 'p2',
                pipeline: 'develop',
                steps,
            })
        })

        expect(result.current.lastStop).toBeNull()
    })

    it('a 404 (nothing to report) clears it', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({data: null, queue: [], lastStop: stop}))
        const {result} = renderHook(() => usePipelineStatus())
        await waitFor(() => expect(result.current.lastStop).toEqual(stop))
        mockAuthGet.mockResolvedValue({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
        } as Response)

        act(() => result.current.resync())

        await waitFor(() => expect(result.current.lastStop).toBeNull())
    })
})
