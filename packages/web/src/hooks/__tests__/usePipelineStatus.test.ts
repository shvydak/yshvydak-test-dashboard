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
})
