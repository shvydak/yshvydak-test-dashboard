import {describe, it, expect, vi, beforeEach} from 'vitest'
import {testSearchService} from '../testSearch.service'

const mockAuthGet = vi.fn()
vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: (url: string) => mockAuthGet(url),
}))

describe('testSearchService.search', () => {
    beforeEach(() => mockAuthGet.mockReset())

    it('sends q and limit, encoded, and returns data', async () => {
        mockAuthGet.mockResolvedValue({ok: true, json: async () => ({data: [{testId: 'a'}]})})
        expect(await testSearchService.search('a&b c', 5)).toEqual([{testId: 'a'}])
        expect(mockAuthGet).toHaveBeenCalledWith(
            expect.stringMatching(/\/tests\/search\?q=a%26b\+c&limit=5$/)
        )
    })

    it('throws on a failed response', async () => {
        mockAuthGet.mockResolvedValue({ok: false, status: 500})
        await expect(testSearchService.search('abc')).rejects.toThrow('Search failed')
    })
})
