import {describe, it, expect, vi, beforeEach} from 'vitest'
import {useTestsStore} from '../testsStore'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
    authDelete: vi.fn(),
}))

import {authPost, authDelete} from '@features/authentication/utils/authFetch'

const refused = {
    ok: false,
    status: 409,
    json: () => Promise.resolve({message: 'Tests are already running', error: 'busy'}),
}

describe('testsStore - every action failure uses actionError, never the page-wide error', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
        vi.mocked(authPost).mockResolvedValue(refused as any)
        vi.mocked(authDelete).mockResolvedValue(refused as any)
        useTestsStore.setState({
            error: null,
            actionError: null,
            isDiscovering: false,
            isRunningAllTests: false,
            runningTests: new Set(),
            runningGroups: new Set(),
        })
    })

    it.each([
        ['rerunTest', () => useTestsStore.getState().rerunTest('t1')],
        ['runAllTests (discovery step)', () => useTestsStore.getState().runAllTests('P')],
        [
            'runAllTests (run step, auto-discover off)',
            () => {
                localStorage.setItem('autoDiscoverBeforeRun', 'false')
                return useTestsStore.getState().runAllTests('P')
            },
        ],
        [
            'runTestsGroup',
            () => useTestsStore.getState().runTestsGroup('a.spec.ts', undefined, 'P'),
        ],
        ['discoverTests', () => useTestsStore.getState().discoverTests('P')],
        [
            'deleteTest',
            () =>
                useTestsStore
                    .getState()
                    .deleteTest('t1')
                    .catch(() => {}),
        ],
        [
            'deleteExecution',
            () =>
                useTestsStore
                    .getState()
                    .deleteExecution('t1', 'e1')
                    .catch(() => {}),
        ],
    ])('%s', async (_name, run) => {
        await run()

        expect(useTestsStore.getState().actionError).toBeTruthy()
        expect(useTestsStore.getState().error).toBeNull()
    })
})
