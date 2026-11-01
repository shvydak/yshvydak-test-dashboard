import {describe, it, expect, vi, beforeEach} from 'vitest'
import {useTestsStore} from '../testsStore'
import {queryClient} from '@config/queryClient'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
    authDelete: vi.fn(),
}))

import {authGet, authDelete} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>
const mockAuthDelete = authDelete as ReturnType<typeof vi.fn>

function makeResponse(body: unknown, ok = true) {
    return {
        ok,
        status: ok ? 200 : 500,
        json: () => Promise.resolve(body),
    } as unknown as Response
}

describe('testsStore.fetchTests — status-count cache invalidation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useTestsStore.setState({tests: [], error: null, listProject: null})
    })

    it('invalidates project-status-summary and test-status-counts after a successful fetch', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({success: true, data: []}))
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await useTestsStore.getState().fetchTests()

        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
            queryKey: ['project-status-summary'],
        })
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: ['test-status-counts']})
    })

    it('invalidates every status-filtered list (any filter/project) after a successful fetch', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({success: true, data: []}))
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await useTestsStore.getState().fetchTests()

        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
            queryKey: ['filtered-tests-by-status'],
        })
    })

    it('a status-filtered list is refetched after deleting a test', async () => {
        mockAuthDelete.mockResolvedValue(makeResponse({success: true}))
        mockAuthGet.mockResolvedValue(makeResponse({success: true, data: []}))
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await useTestsStore.getState().deleteTest('t1')

        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
            queryKey: ['filtered-tests-by-status'],
        })
    })

    it('does not invalidate caches when the fetch fails', async () => {
        mockAuthGet.mockResolvedValue(makeResponse(null, false))
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await useTestsStore.getState().fetchTests()

        expect(useTestsStore.getState().error).toBeTruthy()
        expect(invalidateQueriesSpy).not.toHaveBeenCalled()
    })

    it('keeps error through a retry and clears it only on a successful fetch', async () => {
        useTestsStore.setState({error: 'HTTP error! status: 503'})
        let release: (r: Response) => void = () => {}
        mockAuthGet.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)))

        const pending = useTestsStore.getState().fetchTests()
        expect(useTestsStore.getState().error).toBe('HTTP error! status: 503')

        release(makeResponse({success: true, data: []}))
        await pending

        expect(useTestsStore.getState().error).toBeNull()
    })

    it('records which project the loaded rows belong to', async () => {
        mockAuthGet.mockResolvedValue(makeResponse({success: true, data: []}))
        useTestsStore.setState({listProject: 'P', testsProject: null})

        await useTestsStore.getState().fetchTests()

        expect(useTestsStore.getState().testsProject).toBe('P')
    })

    it('a failed fetchRuns does not raise the list error', async () => {
        mockAuthGet.mockResolvedValue(makeResponse(null, false))

        await useTestsStore.getState().fetchRuns()

        expect(useTestsStore.getState().error).toBeNull()
    })

    it('ignores a late reply for the tab the user already left (no error wipe, no old rows)', async () => {
        const rowsA = [{id: 'a1', testId: 'ta'}]
        let releaseA: (r: Response) => void = () => {}
        mockAuthGet.mockReturnValueOnce(new Promise<Response>((resolve) => (releaseA = resolve)))
        useTestsStore.setState({listProject: 'A', testsProject: null, tests: [], error: null})

        const pendingA = useTestsStore.getState().fetchTests()
        useTestsStore.getState().setListProject('B')
        mockAuthGet.mockResolvedValueOnce(makeResponse(null, false))
        await useTestsStore.getState().fetchTests()
        expect(useTestsStore.getState().error).toBeTruthy()

        releaseA(makeResponse({success: true, data: rowsA}))
        await pendingA

        expect(useTestsStore.getState().error).toBeTruthy()
        expect(useTestsStore.getState().tests).toEqual([])
        expect(useTestsStore.getState().testsProject).toBeNull()
    })

    it('ignores a late failure for the tab the user already left', async () => {
        let rejectA: (e: Error) => void = () => {}
        mockAuthGet.mockReturnValueOnce(new Promise<Response>((_r, reject) => (rejectA = reject)))
        useTestsStore.setState({listProject: 'A', testsProject: null, tests: [], error: null})

        const pendingA = useTestsStore.getState().fetchTests()
        useTestsStore.getState().setListProject('B')
        mockAuthGet.mockResolvedValueOnce(makeResponse({success: true, data: []}))
        await useTestsStore.getState().fetchTests()

        rejectA(new Error('late failure'))
        await pendingA

        expect(useTestsStore.getState().error).toBeNull()
    })

    it("a view switch drops the previous view's error text; staying on the view keeps it", () => {
        useTestsStore.setState({listProject: 'A', error: 'old tab failed'})

        useTestsStore.getState().setListProject('A')
        expect(useTestsStore.getState().error).toBe('old tab failed')

        useTestsStore.getState().setListProject('B')
        expect(useTestsStore.getState().error).toBeNull()
        expect(useTestsStore.getState().listProject).toBe('B')
    })
})
