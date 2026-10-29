import {describe, expect, it} from 'vitest'
import {DashboardError} from '../auth'
import {envelope, makeStack, type Router} from './helpers/fakeDashboard'

const authOn =
    (extra: Router): Router =>
    (m, url, h) =>
        url.pathname === '/api/auth/config' ? envelope({authEnabled: true}) : extra(m, url, h)

const withCreds = {email: 'qa@example.com', password: 'pw-secret'}

describe('Session', () => {
    it('does not log in when auth is off', async () => {
        const {session, calls} = makeStack((_m, url) =>
            url.pathname === '/api/auth/config' ? envelope({authEnabled: false}) : envelope([])
        )
        await session.get('/api/tests')
        expect(calls.some((c) => c.path === '/api/auth/login')).toBe(false)
        expect(calls.at(-1)?.auth).toBeNull()
    })

    it('logs in once and reuses the token', async () => {
        const {session, calls} = makeStack(
            authOn((m, url) =>
                url.pathname === '/api/auth/login' ? envelope({token: 'tok-1'}) : envelope([])
            ),
            withCreds
        )
        await session.get('/api/tests')
        await session.get('/api/tests')
        expect(calls.filter((c) => c.path === '/api/auth/login')).toHaveLength(1)
        expect(calls.filter((c) => c.path === '/api/tests').map((c) => c.auth)).toEqual([
            'Bearer tok-1',
            'Bearer tok-1',
        ])
    })

    it('parallel first calls share one login', async () => {
        const {session, calls} = makeStack(
            authOn((_m, url) =>
                url.pathname === '/api/auth/login' ? envelope({token: 'tok-1'}) : envelope([])
            ),
            withCreds
        )
        await Promise.all([session.get('/api/tests'), session.get('/api/tests/summary-by-project')])
        expect(calls.filter((c) => c.path === '/api/auth/login')).toHaveLength(1)
    })

    it('parallel first calls share one auth/config probe', async () => {
        const {session, calls} = makeStack((_m, url) =>
            url.pathname === '/api/auth/config' ? envelope({authEnabled: false}) : envelope([])
        )
        await Promise.all([session.get('/api/tests'), session.get('/api/tests/summary-by-project')])
        expect(calls.filter((c) => c.path === '/api/auth/config')).toHaveLength(1)
    })

    it('re-logs in once on a 401 and retries once', async () => {
        let logins = 0
        const {session, calls} = makeStack(
            authOn((_m, url, h) => {
                if (url.pathname === '/api/auth/login') return envelope({token: `tok-${++logins}`})
                return h.get('authorization') === 'Bearer tok-2' ? envelope([]) : {status: 401}
            }),
            withCreds
        )
        const res = await session.get('/api/tests')
        expect(res.status).toBe(200)
        expect(logins).toBe(2)
        expect(calls.filter((c) => c.path === '/api/tests')).toHaveLength(2)
    })

    it('a second 401 is an error, with no further requests', async () => {
        const {session, calls} = makeStack(
            authOn((_m, url) =>
                url.pathname === '/api/auth/login' ? envelope({token: 't'}) : {status: 401}
            ),
            withCreds
        )
        await expect(session.get('/api/tests')).rejects.toThrow(/Login failed/)
        expect(calls.filter((c) => c.path === '/api/auth/login')).toHaveLength(2)
        expect(calls.filter((c) => c.path === '/api/tests')).toHaveLength(2)
    })

    it('DASHBOARD_TOKEN skips login; a rejected token is an error, not a loop', async () => {
        const {session, calls} = makeStack(
            authOn(() => ({status: 401})),
            {token: 'static'}
        )
        await expect(session.get('/api/tests')).rejects.toThrow(/DASHBOARD_TOKEN was rejected/)
        expect(calls.some((c) => c.path === '/api/auth/login')).toBe(false)
        expect(calls.filter((c) => c.path === '/api/tests')).toHaveLength(1)
    })

    it('takes the password from the command, and never leaks it or the token in errors', async () => {
        const seen: string[] = []
        const {session} = makeStack(
            authOn((_m, url) =>
                url.pathname === '/api/auth/login' ? {status: 401} : envelope([])
            ),
            {email: 'qa@example.com', passwordCmd: 'security find-generic-password -s x -w'},
            async (cmd) => {
                seen.push(cmd)
                return 'keychain-pw'
            }
        )
        const err = await session.get('/api/tests').catch((e) => e)
        expect(seen).toEqual(['security find-generic-password -s x -w'])
        expect(err).toBeInstanceOf(DashboardError)
        expect(String(err.message)).not.toContain('keychain-pw')
    })

    it('says what to configure when login is on and no credentials are set', async () => {
        const {session} = makeStack(authOn(() => envelope([])))
        await expect(session.get('/api/tests')).rejects.toThrow(/DASHBOARD_EMAIL/)
    })
})
