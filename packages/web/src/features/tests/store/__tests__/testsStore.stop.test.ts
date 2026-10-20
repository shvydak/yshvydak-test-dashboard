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

describe('testsStore Stop', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockAuthGet.mockResolvedValue(ok())
        useTestsStore.setState({
            ciRunQueued: false,
            ciPipelineRunning: false,
            ciStopping: false,
            isRunningAllTests: false,
            isDiscovering: false,
            currentRunAllId: null,
            runningTests: new Set(),
            runningGroups: new Set(),
            activeProgress: null,
            error: null,
            stopError: null,
        })
    })

    describe('getIsStoppable', () => {
        it('is false when idle, when a CI run is only queued, and during a bare discovery', () => {
            expect(useTestsStore.getState().getIsStoppable()).toBe(false)

            useTestsStore.setState({ciRunQueued: true})
            expect(useTestsStore.getState().getIsStoppable()).toBe(false)

            useTestsStore.setState({ciRunQueued: false, isDiscovering: true})
            expect(useTestsStore.getState().getIsStoppable()).toBe(false)
        })

        it.each([
            ['a CI pipeline', {ciPipelineRunning: true}],
            ['a Run All', {isRunningAllTests: true}],
            ['a group run', {runningGroups: new Set(['a.spec.ts'])}],
            ['a rerun', {runningTests: new Set(['t1'])}],
        ])('is true while %s runs', (_name, state) => {
            useTestsStore.setState(state)

            expect(useTestsStore.getState().getIsStoppable()).toBe(true)
        })
    })

    describe('busy while stopping', () => {
        it('a stop in progress counts as a running test even when every run flag already cleared', () => {
            expect(useTestsStore.getState().getIsAnyTestRunning()).toBe(false)

            useTestsStore.setState({ciStopping: true})

            expect(useTestsStore.getState().getIsAnyTestRunning()).toBe(true)
        })
    })

    describe('stopRun', () => {
        it('posts reason manual to /pipeline/stop and refreshes the list', async () => {
            mockAuthPost.mockResolvedValue(ok({success: true, data: {stopped: true}}))

            await useTestsStore.getState().stopRun()

            expect(mockAuthPost).toHaveBeenCalledWith(expect.stringMatching(/\/pipeline\/stop$/), {
                reason: 'manual',
            })
            expect(mockAuthGet).toHaveBeenCalledWith(expect.stringMatching(/\/tests\?/))
            expect(useTestsStore.getState().error).toBeNull()
        })

        it('is "stopping" while the request is in flight and released afterwards', async () => {
            let finish!: (value: unknown) => void
            mockAuthPost.mockReturnValue(new Promise((resolve) => (finish = resolve)))

            const stopping = useTestsStore.getState().stopRun()
            expect(useTestsStore.getState().ciStopping).toBe(true)

            finish(ok({success: true, data: {stopped: true}}))
            await stopping
            expect(useTestsStore.getState().ciStopping).toBe(false)
        })

        it('shows the failure and releases the button when the server refuses', async () => {
            mockAuthPost.mockResolvedValue({
                ok: false,
                status: 403,
                json: () => Promise.resolve({}),
            })

            await useTestsStore.getState().stopRun()

            expect(useTestsStore.getState().stopError).toMatch(/ENABLE_AUTH/)
            expect(useTestsStore.getState().stopError).not.toMatch(/HTTP error/)
            // never the page-wide error: it replaces the tests list and the Stop button while the run goes on
            expect(useTestsStore.getState().error).toBeNull()
            expect(useTestsStore.getState().ciStopping).toBe(false)
        })

        it('keeps the bare status for other failures', async () => {
            mockAuthPost.mockResolvedValue({
                ok: false,
                status: 500,
                json: () => Promise.resolve({}),
            })

            await useTestsStore.getState().stopRun()

            expect(useTestsStore.getState().stopError).toBe('HTTP error! status: 500')
        })

        it('survives a network error', async () => {
            mockAuthPost.mockRejectedValue(new Error('network down'))

            await useTestsStore.getState().stopRun()

            expect(useTestsStore.getState().stopError).toBe('network down')
            expect(useTestsStore.getState().error).toBeNull()
            expect(useTestsStore.getState().ciStopping).toBe(false)
        })
    })

    describe('resetRunState (run:cancelled)', () => {
        it('clears every local "running" flag and the progress, whatever they said', () => {
            useTestsStore.setState({
                ciStopping: true,
                isRunningAllTests: true,
                currentRunAllId: 'r1',
                runningTests: new Set(['t1']),
                runningGroups: new Set(['a.spec.ts']),
                activeProgress: {processId: 'r1'} as any,
            })

            useTestsStore.getState().resetRunState()

            const state = useTestsStore.getState()
            expect(state.ciStopping).toBe(false)
            expect(state.isRunningAllTests).toBe(false)
            expect(state.currentRunAllId).toBeNull()
            expect(state.runningTests.size).toBe(0)
            expect(state.runningGroups.size).toBe(0)
            expect(state.activeProgress).toBeNull()
        })

        it('leaves the CI pipeline / queue flags to the pipeline events', () => {
            useTestsStore.setState({ciPipelineRunning: true, ciRunQueued: true})

            useTestsStore.getState().resetRunState()

            expect(useTestsStore.getState().ciPipelineRunning).toBe(true)
            expect(useTestsStore.getState().ciRunQueued).toBe(true)
        })
    })

    describe('testsStore Stop error is separate from the page error', () => {
        beforeEach(() => {
            vi.clearAllMocks()
            mockAuthGet.mockResolvedValue(ok())
            useTestsStore.setState({error: null, stopError: null, ciStopping: false})
        })

        it('a failed stop leaves the list error untouched, even when one is already shown', async () => {
            useTestsStore.setState({error: 'Failed to fetch tests'})
            mockAuthPost.mockResolvedValue({
                ok: false,
                status: 500,
                json: () => Promise.resolve({}),
            })

            await useTestsStore.getState().stopRun()

            expect(useTestsStore.getState().error).toBe('Failed to fetch tests')
            expect(useTestsStore.getState().stopError).toBe('HTTP error! status: 500')
        })

        it('the next stop clears the old message first', async () => {
            useTestsStore.setState({stopError: 'old failure'})
            let finish!: (value: unknown) => void
            mockAuthPost.mockReturnValue(new Promise((resolve) => (finish = resolve)))

            const stopping = useTestsStore.getState().stopRun()
            expect(useTestsStore.getState().stopError).toBeNull()

            finish(ok({success: true, data: {stopped: true}}))
            await stopping
            expect(useTestsStore.getState().stopError).toBeNull()
        })

        it('clearStopError and run:cancelled (resetRunState) clear it', () => {
            useTestsStore.setState({stopError: 'x'})
            useTestsStore.getState().clearStopError()
            expect(useTestsStore.getState().stopError).toBeNull()

            useTestsStore.setState({stopError: 'y'})
            useTestsStore.getState().resetRunState()
            expect(useTestsStore.getState().stopError).toBeNull()
        })
    })
})
