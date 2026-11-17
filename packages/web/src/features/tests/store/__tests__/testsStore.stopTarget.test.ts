import {describe, it, expect, vi, beforeEach} from 'vitest'
import {useTestsStore} from '../testsStore'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
    authDelete: vi.fn(),
}))

import {authGet, authPost} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>
const mockAuthPost = authPost as ReturnType<typeof vi.fn>

const ok = (body: unknown = {success: true, data: []}) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
})

const snapshot = (runs: any[], extra: Record<string, unknown> = {}) => ({
    isRunningAll: runs.some((r) => r.type === 'run-all'),
    testIds: runs.filter((r) => r.type === 'rerun').map((r) => r.originalTestId),
    filePaths: runs.filter((r) => r.type === 'run-group').map((r) => r.filePath),
    runs,
    ...extra,
})

describe('testsStore per-run Stop', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useRealTimers()
        mockAuthGet.mockResolvedValue(ok())
        mockAuthPost.mockResolvedValue(ok({success: true, data: {stopped: true}}))
        useTestsStore.getState().resetRunState()
        useTestsStore.setState({
            tests: [],
            ciRunQueued: false,
            ciPipelineRunning: false,
            ciPipelineRunId: null,
            ciPipelineName: null,
            activeRuns: [],
            ciStopping: false,
            stopError: null,
            error: null,
        })
    })

    describe('what Stop sends', () => {
        it('a running pipeline: POST /runs/<pipelineRunId>/stop', async () => {
            useTestsStore.getState().setCIPipelineRun({id: 'pipe-1', name: 'develop'})
            useTestsStore.setState({ciPipelineRunning: true})

            await useTestsStore.getState().stopRun()

            expect(mockAuthPost).toHaveBeenCalledWith(
                expect.stringMatching(/\/runs\/pipe-1\/stop$/),
                {}
            )
        })

        it('the pipeline id wins over the step run the snapshot lists', async () => {
            useTestsStore.getState().setCIPipelineRun({id: 'pipe-1', name: 'develop'})
            useTestsStore
                .getState()
                .applyRunSnapshot(snapshot([{id: 'step-run', type: 'run-all', project: 'API'}]))

            await useTestsStore.getState().stopRun()

            expect(mockAuthPost).toHaveBeenCalledWith(
                expect.stringMatching(/\/runs\/pipe-1\/stop$/),
                {}
            )
        })

        it('one standalone run in the snapshot: its run id', async () => {
            useTestsStore
                .getState()
                .applyRunSnapshot(snapshot([{id: 'run-7', type: 'run-all', project: 'API'}]))

            await useTestsStore.getState().stopRun()

            expect(mockAuthPost).toHaveBeenCalledWith(
                expect.stringMatching(/\/runs\/run-7\/stop$/),
                {}
            )
        })

        it('no id known (a run still starting): the global stop', async () => {
            useTestsStore.setState({isRunningAllTests: true})

            await useTestsStore.getState().stopRun()

            expect(mockAuthPost).toHaveBeenCalledWith(expect.stringMatching(/\/pipeline\/stop$/), {
                reason: 'manual',
            })
        })

        it('an explicit id (what the dialog named) is sent as is; null forces the global stop', async () => {
            useTestsStore.getState().setCIPipelineRun({id: 'pipe-1', name: 'develop'})

            await useTestsStore.getState().stopRun('run-named')
            expect(mockAuthPost).toHaveBeenLastCalledWith(
                expect.stringMatching(/\/runs\/run-named\/stop$/),
                {}
            )

            await useTestsStore.getState().stopRun(null)
            expect(mockAuthPost).toHaveBeenLastCalledWith(
                expect.stringMatching(/\/pipeline\/stop$/),
                {reason: 'manual'}
            )
        })

        it('409 means the run already ended: a short message, the button is released', async () => {
            mockAuthPost.mockResolvedValue({
                ok: false,
                status: 409,
                json: () => Promise.resolve({code: 'RUN_NOT_ACTIVE'}),
            })

            await useTestsStore.getState().stopRun('gone')

            expect(useTestsStore.getState().stopError).toBe('That run already ended.')
            expect(useTestsStore.getState().ciStopping).toBe(false)
            expect(useTestsStore.getState().error).toBeNull()
        })
    })

    describe('getStopTarget (names what the click stops)', () => {
        it('a pipeline, with its name', () => {
            useTestsStore.getState().setCIPipelineRun({id: 'p1', name: 'develop'})

            expect(useTestsStore.getState().getStopTarget()).toEqual({
                id: 'p1',
                kind: 'pipeline',
                name: 'develop',
            })
        })

        it('Run All names its project; a group run names the spec file; a rerun names the test', () => {
            useTestsStore.setState({
                tests: [{id: 'exec-1', name: 'user can log in'}] as any,
            })

            useTestsStore
                .getState()
                .applyRunSnapshot(snapshot([{id: 'r1', type: 'run-all', project: 'Smoke'}]))
            expect(useTestsStore.getState().getStopTarget()).toEqual({
                id: 'r1',
                kind: 'run-all',
                name: 'Smoke',
            })

            useTestsStore
                .getState()
                .applyRunSnapshot(
                    snapshot([{id: 'r2', type: 'run-group', filePath: 'tests/web/login.spec.ts'}])
                )
            expect(useTestsStore.getState().getStopTarget()).toEqual({
                id: 'r2',
                kind: 'run-group',
                name: 'login.spec.ts',
            })

            useTestsStore
                .getState()
                .applyRunSnapshot(snapshot([{id: 'r3', type: 'rerun', originalTestId: 'exec-1'}]))
            expect(useTestsStore.getState().getStopTarget()).toEqual({
                id: 'r3',
                kind: 'rerun',
                name: 'user can log in',
            })
        })

        it('flags without a snapshot run: kind from the flag, id null', () => {
            useTestsStore.setState({isRunningAllTests: true})
            expect(useTestsStore.getState().getStopTarget()).toEqual({id: null, kind: 'run-all'})
        })
    })

    describe('activeRuns', () => {
        it('are filled from the snapshot and cleared by resetRunState (run:cancelled)', () => {
            useTestsStore
                .getState()
                .applyRunSnapshot(snapshot([{id: 'r1', type: 'run-all', project: 'API'}]))
            expect(useTestsStore.getState().activeRuns.map((r) => r.id)).toEqual(['r1'])

            useTestsStore.getState().resetRunState()

            expect(useTestsStore.getState().activeRuns).toEqual([])
        })

        it('an empty snapshot clears them', () => {
            useTestsStore
                .getState()
                .applyRunSnapshot(snapshot([{id: 'r1', type: 'run-all', project: 'API'}]))

            useTestsStore.getState().applyRunSnapshot(snapshot([]))

            expect(useTestsStore.getState().activeRuns).toEqual([])
        })
    })
})
