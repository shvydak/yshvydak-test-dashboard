import {describe, it, expect, vi, beforeEach} from 'vitest'
import {testLinkService} from '../testLink.service'

const mockAuthGet = vi.fn()
vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: (url: string) => mockAuthGet(url),
}))

const reply = (status: number, body: unknown = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
})

describe('testLinkService.getLatestByTestId', () => {
    beforeEach(() => mockAuthGet.mockReset())

    it('returns the row from the response', async () => {
        mockAuthGet.mockResolvedValue(reply(200, {data: {testId: 'abc'}}))
        expect(await testLinkService.getLatestByTestId('abc')).toEqual({testId: 'abc'})
        expect(mockAuthGet).toHaveBeenCalledWith(expect.stringMatching(/\/tests\/by-test-id\/abc$/))
    })

    it('encodes the id in the path', async () => {
        mockAuthGet.mockResolvedValue(reply(404))
        await testLinkService.getLatestByTestId('a/b c')
        expect(mockAuthGet).toHaveBeenCalledWith(expect.stringContaining('/by-test-id/a%2Fb%20c'))
    })

    it.each([404, 400])('returns null for %i', async (status) => {
        mockAuthGet.mockResolvedValue(reply(status))
        expect(await testLinkService.getLatestByTestId('x')).toBeNull()
    })

    it('throws on a server error', async () => {
        mockAuthGet.mockResolvedValue(reply(500))
        await expect(testLinkService.getLatestByTestId('x')).rejects.toThrow()
    })
})
