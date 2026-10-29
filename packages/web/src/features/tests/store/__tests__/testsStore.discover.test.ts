import {describe, it, expect, vi, beforeEach} from 'vitest'
import {useTestsStore} from '../testsStore'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPost: vi.fn(),
    authDelete: vi.fn(),
}))

import {authGet, authPost} from '@features/authentication/utils/authFetch'

const ok = (body: unknown = {success: true, data: []}) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
})

describe('testsStore discoverTests mode', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(authGet).mockResolvedValue(ok() as any)
        vi.mocked(authPost).mockResolvedValue(ok() as any)
        useTestsStore.setState({isDiscovering: false, error: null})
    })

    it('sends the incremental mode it is given', async () => {
        await useTestsStore.getState().discoverTests('UI_Tests', 'incremental')

        expect(authPost).toHaveBeenCalledWith(expect.stringMatching(/\/tests\/discovery$/), {
            project: 'UI_Tests',
            mode: 'incremental',
        })
    })

    it('defaults to reset', async () => {
        await useTestsStore.getState().discoverTests('UI_Tests')

        expect(authPost).toHaveBeenCalledWith(expect.stringMatching(/\/tests\/discovery$/), {
            project: 'UI_Tests',
            mode: 'reset',
        })
    })
})

describe('testsStore discovery requests', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(authGet).mockResolvedValue(ok() as any)
        useTestsStore.setState({isDiscovering: false, error: null, isRunningAllTests: false})
    })

    it("Run All's pre-discovery sends no mode (server default = reset) and keeps the project", async () => {
        localStorage.setItem('autoDiscoverBeforeRun', 'true')
        vi.mocked(authPost).mockResolvedValue(
            ok({success: true, data: {runId: 'r1', message: 'x'}}) as any
        )

        await useTestsStore.getState().runAllTests('UI_Tests')

        const discoveryCall = vi
            .mocked(authPost)
            .mock.calls.find(([url]) => String(url).endsWith('/tests/discovery'))
        expect(discoveryCall).toBeDefined()
        expect(discoveryCall![1]).toEqual({project: 'UI_Tests'})
        expect(discoveryCall![1]).not.toHaveProperty('mode')
    })

    it('shows the server reason when Discover fails (e.g. a spec that throws on import)', async () => {
        vi.mocked(authPost).mockResolvedValue({
            ok: false,
            status: 500,
            json: () =>
                Promise.resolve({
                    success: false,
                    error: 'Test discovery failed: Playwright command failed with code 1: boom',
                    message: 'Test discovery failed',
                }),
        } as any)

        await useTestsStore.getState().discoverTests(undefined, 'incremental')

        expect(useTestsStore.getState().error).toContain('boom')
    })

    it("shows the server reason when Run All's pre-discovery fails, and does not start the run", async () => {
        localStorage.setItem('autoDiscoverBeforeRun', 'true')
        vi.mocked(authPost).mockResolvedValue({
            ok: false,
            status: 500,
            json: () =>
                Promise.resolve({
                    success: false,
                    error: 'Test discovery failed: Playwright command failed with code 1: kaboom',
                    message: 'Test discovery failed',
                }),
        } as any)

        await useTestsStore.getState().runAllTests('UI_Tests')

        expect(useTestsStore.getState().error).toContain('kaboom')
        expect(
            vi.mocked(authPost).mock.calls.some(([url]) => String(url).endsWith('/tests/run-all'))
        ).toBe(false)
    })

    it('falls back to the status when the failure has no readable body', async () => {
        vi.mocked(authPost).mockResolvedValue({
            ok: false,
            status: 502,
            json: () => Promise.reject(new Error('not json')),
        } as any)

        await useTestsStore.getState().discoverTests(undefined, 'incremental')

        expect(useTestsStore.getState().error).toBe('HTTP error! status: 502')
    })
})
