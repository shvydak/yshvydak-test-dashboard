import {describe, it, expect, vi, beforeEach} from 'vitest'
import {useTestsStore} from '../testsStore'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
    authDelete: vi.fn(),
}))

import {authPost} from '@features/authentication/utils/authFetch'

const mockAuthPost = authPost as ReturnType<typeof vi.fn>

describe('testsStore CI busy state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useTestsStore.setState({
            ciRunQueued: false,
            ciPipelineRunning: false,
            isRunningAllTests: false,
            runningTests: new Set(),
            runningGroups: new Set(),
            error: null,
            actionError: null,
        })
    })

    it('is idle with no CI flag and no reason', () => {
        const state = useTestsStore.getState()

        expect(state.getIsAnyTestRunning()).toBe(false)
        expect(state.getCIBusyReason()).toBeNull()
    })

    it('a running CI pipeline counts as a running test and explains why', () => {
        useTestsStore.getState().setCIPipelineRunning(true)

        expect(useTestsStore.getState().getIsAnyTestRunning()).toBe(true)
        expect(useTestsStore.getState().getCIBusyReason()).toBe('A CI pipeline is running')
    })

    it('a queued CI run counts as a running test and explains why', () => {
        useTestsStore.getState().setCIRunQueued(true)

        expect(useTestsStore.getState().getIsAnyTestRunning()).toBe(true)
        expect(useTestsStore.getState().getCIBusyReason()).toBe('A CI run is queued')
    })

    it('the pipeline reason wins when both flags are set', () => {
        useTestsStore.setState({ciPipelineRunning: true, ciRunQueued: true})

        expect(useTestsStore.getState().getCIBusyReason()).toBe('A CI pipeline is running')
    })

    it('a 409 on rerun surfaces the server message instead of the bare status', async () => {
        mockAuthPost.mockResolvedValue({
            ok: false,
            status: 409,
            json: () => Promise.resolve({message: 'A CI pipeline is running'}),
        })

        await useTestsStore.getState().rerunTest('test-1')

        expect(useTestsStore.getState().actionError).toBe('A CI pipeline is running')
        // a refused action must not turn into the full-page list error
        expect(useTestsStore.getState().error).toBeNull()
    })

    it('a non-409 failure keeps the status message', async () => {
        mockAuthPost.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({message: 'ignored'}),
        })

        await useTestsStore.getState().rerunTest('test-1')

        expect(useTestsStore.getState().actionError).toContain('HTTP error! status: 500')
    })
})
