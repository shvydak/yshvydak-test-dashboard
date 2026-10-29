import {describe, expect, it} from 'vitest'
import {HttpGuardError, SizeCapError, createHttp, isAllowedGet} from '../http'
import {EXEC_1, ID_A, makeFetch} from './helpers/fakeDashboard'

const ok = () => ({json: {success: true, data: []}})

describe('http allowlist', () => {
    it.each([
        '/api/tests/projects',
        '/api/tests/diagnostics',
        '/api/tests/stats',
        '/api/tests/flaky',
        '/api/jira/refresh',
        '/api/runs',
        '/api/tests/traces/abc',
        `/api/tests/${ID_A}/attachments`,
        `/api/tests/${ID_A}/notes`,
        '/api/tests/..%2Fprojects',
        `/api/tests/by-test-id/${ID_A}/x`,
        `/api/tests/by-test-id/projects`,
        `/attachments/${EXEC_1}/..`,
        `/attachments/${EXEC_1}/a/b.png`,
        `/attachments/not-a-uuid/a.png`,
        '//evil.example.com/api/tests',
        `/attachments/${EXEC_1}/%2e%2e`,
        `/attachments/${EXEC_1}/.%2e`,
        `/attachments/${EXEC_1}/a%2f..%2f..`,
        `/attachments/${EXEC_1}/a%5cb.png`,
    ])('blocks GET %s before any request', async (path) => {
        const {fetchFn, calls} = makeFetch(ok)
        await expect(
            createHttp('https://dashboard.example.com', fetchFn).get(path)
        ).rejects.toThrow(HttpGuardError)
        expect(calls).toHaveLength(0)
    })

    it.each([
        '/api/tests',
        '/api/tests/summary-by-project',
        `/api/tests/by-test-id/${ID_A}`,
        `/api/tests/${EXEC_1}`,
        `/api/tests/${ID_A}/history`,
        '/api/jira/tickets',
        '/api/jira/status',
        '/api/settings/project-tabs',
        `/attachments/${EXEC_1}/shot%20one.png`,
        `/attachments/${EXEC_1}/%252e%252e`,
    ])('allows GET %s', (path) => {
        expect(isAllowedGet(path)).toBe(true)
    })

    it('sends GET with redirect: error and keeps the root prefix', async () => {
        const seen: Array<{url: string; init?: RequestInit}> = []
        const fetchFn = (async (url: URL, init?: RequestInit) => {
            seen.push({url: String(url), init})
            return new Response('{}')
        }) as unknown as typeof fetch
        await createHttp('https://dashboard.example.com/qa', fetchFn).get('/api/tests', {
            query: {project: 'All Tests', limit: 5},
        })
        expect(seen[0].url).toBe(
            'https://dashboard.example.com/qa/api/tests?project=All+Tests&limit=5'
        )
        expect(seen[0].init?.redirect).toBe('error')
        expect(seen[0].init?.method).toBe('GET')
    })

    it('POSTs only to the login path', async () => {
        const {fetchFn, calls} = makeFetch(ok)
        await createHttp('https://dashboard.example.com', fetchFn).postLogin({
            email: 'a@b.c',
            password: 'x',
        })
        expect(calls).toEqual([expect.objectContaining({method: 'POST', path: '/api/auth/login'})])
    })

    it('rejects on a declared Content-Length over maxBytes, before reading the body', async () => {
        const {fetchFn} = makeFetch(() => ({body: 'tiny', headers: {'content-length': '999999'}}))
        await expect(
            createHttp('https://dashboard.example.com', fetchFn).get(
                `/attachments/${EXEC_1}/a.png`,
                {
                    maxBytes: 1000,
                }
            )
        ).rejects.toThrow(SizeCapError)
    })

    it('aborts a response larger than maxBytes', async () => {
        const {fetchFn} = makeFetch(() => ({body: Buffer.alloc(5000)}))
        await expect(
            createHttp('https://dashboard.example.com', fetchFn).get(
                `/attachments/${EXEC_1}/a.png`,
                {
                    maxBytes: 1000,
                }
            )
        ).rejects.toThrow(HttpGuardError)
    })
})
