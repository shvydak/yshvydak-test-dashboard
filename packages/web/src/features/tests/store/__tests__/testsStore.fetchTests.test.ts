import {describe, it, expect, vi, beforeEach} from 'vitest'
import {useTestsStore} from '../testsStore'
import {queryClient} from '@config/queryClient'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
    authDelete: vi.fn(),
}))

import {authGet} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>

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

    it('does not invalidate caches when the fetch fails', async () => {
        mockAuthGet.mockResolvedValue(makeResponse(null, false))
        const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await useTestsStore.getState().fetchTests()

        expect(useTestsStore.getState().error).toBeTruthy()
        expect(invalidateQueriesSpy).not.toHaveBeenCalled()
    })
})
