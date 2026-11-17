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

describe('testsStore - an action failure shows the server reason, not the bare status', () => {
    const reply = (status: number, body: unknown) =>
        ({ok: false, status, json: () => Promise.resolve(body)}) as any

    const actions: Array<[string, () => Promise<unknown>]> = [
        ['rerunTest', () => useTestsStore.getState().rerunTest('t1')],
        [
            'runTestsGroup',
            () => useTestsStore.getState().runTestsGroup('a.spec.ts', undefined, 'P'),
        ],
        [
            'runAllTests',
            () => {
                localStorage.setItem('autoDiscoverBeforeRun', 'false')
                return useTestsStore.getState().runAllTests('P')
            },
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
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
        useTestsStore.setState({
            error: null,
            actionError: null,
            stopError: null,
            isDiscovering: false,
            isRunningAllTests: false,
            runningTests: new Set(),
            runningGroups: new Set(),
        })
    })

    it.each(actions)('%s: a 400 shows the server message', async (_name, run) => {
        const refusedBody = {
            success: false,
            error: 'Bad request',
            message: 'maxWorkers must be an integer from 1 to 16',
        }
        vi.mocked(authPost).mockResolvedValue(reply(400, refusedBody))
        vi.mocked(authDelete).mockResolvedValue(reply(400, refusedBody))

        await run()

        expect(useTestsStore.getState().actionError).toBe(
            'maxWorkers must be an integer from 1 to 16'
        )
    })

    it('a 500 shows the real cause from `error`, not the generic `message` label', async () => {
        vi.mocked(authPost).mockResolvedValue(
            reply(500, {error: 'spec.ts throws on import', message: 'Test discovery failed'})
        )

        await useTestsStore.getState().discoverTests('P')

        expect(useTestsStore.getState().actionError).toBe('spec.ts throws on import')
    })

    it('a 500 with the generic `error` label shows the `message` cause', async () => {
        vi.mocked(authPost).mockResolvedValue(
            reply(500, {error: 'Internal server error', message: 'SQLITE_BUSY: database is locked'})
        )

        await useTestsStore.getState().rerunTest('t1')

        expect(useTestsStore.getState().actionError).toBe('SQLITE_BUSY: database is locked')
    })

    it('a reply that is not JSON falls back to the status', async () => {
        vi.mocked(authPost).mockResolvedValue({
            ok: false,
            status: 502,
            json: () => Promise.reject(new SyntaxError('not json')),
        } as any)

        await useTestsStore.getState().rerunTest('t1')

        expect(useTestsStore.getState().actionError).toBe('HTTP error! status: 502')
    })

    it('Stop: a 400 shows the server message in stopError', async () => {
        vi.mocked(authPost).mockResolvedValue(reply(400, {message: 'Invalid run id'}))

        await useTestsStore.getState().stopRun('r1')

        expect(useTestsStore.getState().stopError).toBe('Invalid run id')
    })

    it('Stop: a 409 keeps its own wording', async () => {
        vi.mocked(authPost).mockResolvedValue(reply(409, {message: 'RUN_NOT_ACTIVE'}))
        await useTestsStore.getState().stopRun('r1')
        expect(useTestsStore.getState().stopError).toBe('That run already ended.')
    })
})
