import {describe, expect, it} from 'vitest'
import {HttpGuardError, SizeCapError, createHttp, isAllowedGet, isAllowedRunPost} from '../http'
import {EXEC_1, ID_A, RUN_1, makeFetch} from './helpers/fakeDashboard'

const ok = () => ({json: {success: true, data: []}})

describe('http allowlist', () => {
    it.each([
        '/api/tests/projects',
        '/api/tests/diagnostics',
        '/api/tests/stats',
        '/api/tests/flaky',
        '/api/jira/refresh',
        '/api/runs',
        '/api/runs/stats',
        `/api/runs/${RUN_1}/x`,
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
        `/api/runs/${RUN_1}`,
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

const ROOT = 'https://dashboard.example.com'
const RERUN = `/api/tests/${EXEC_1}/rerun`
const GROUP = '/api/tests/run-group'

describe('run POST guard', () => {
    it.each([
        ['rerun', RERUN, {maxWorkers: 2}],
        ['run-group', GROUP, {filePath: 'tests/a.spec.ts', maxWorkers: 2}],
    ])('with runs off, %s is blocked before any request', async (_n, path, body) => {
        const {fetchFn, calls} = makeFetch(ok)
        await expect(createHttp(ROOT, fetchFn).postRun(path, body)).rejects.toThrow(HttpGuardError)
        await expect(
            createHttp(ROOT, fetchFn, {allowRuns: false}).postRun(path, body)
        ).rejects.toThrow(HttpGuardError)
        expect(calls).toHaveLength(0)
    })

    it.each([
        '/api/tests/run-all',
        '/api/tests/force-reset',
        '/api/tests/cleanup',
        '/api/tests/discovery',
        '/api/tests/process-end',
        '/api/pipeline/run',
        '/api/pipeline/stop',
        '/api/settings/jira',
        '/api/jira/refresh',
        '/api/tests',
        `/api/tests/${ID_A}/rerun`,
        `/api/tests/${EXEC_1}/rerun/x`,
        `/api/tests/${EXEC_1}/notes`,
        '/api/tests/..%2Frun-all',
        '/api/runs',
        `/api/runs/${RUN_1}`,
    ])('with runs on, POST %s is still blocked', async (path) => {
        const {fetchFn, calls} = makeFetch(ok)
        await expect(
            createHttp(ROOT, fetchFn, {allowRuns: true}).postRun(path, {maxWorkers: 2})
        ).rejects.toThrow(HttpGuardError)
        expect(calls).toHaveLength(0)
    })

    it('with runs on, sends the two run-start POSTs', async () => {
        const {fetchFn, calls} = makeFetch(ok)
        const http = createHttp(ROOT, fetchFn, {allowRuns: true})
        await http.postRun(RERUN, {maxWorkers: 2})
        await http.postRun(GROUP, {filePath: 'tests/a.spec.ts', maxWorkers: 1, testNames: ['x']})
        expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
            `POST ${RERUN}`,
            `POST ${GROUP}`,
        ])
        expect(calls[1].body).toEqual({
            filePath: 'tests/a.spec.ts',
            maxWorkers: 1,
            testNames: ['x'],
        })
    })

    const group = (over: Record<string, unknown>) => ({
        filePath: 'tests/a.spec.ts',
        maxWorkers: 2,
        ...over,
    })
    it.each(['tests/a.spec.ts', 'e2e/tests/a-b_c.spec.ts', 'x.test.mjs', 'tests/v1.2/a.spec.tsx'])(
        'accepts the plain spec path %s',
        (filePath) => {
            expect(isAllowedRunPost(GROUP, group({filePath}))).toBe(true)
        }
    )

    it.each([
        ['rerun without maxWorkers', RERUN, {}],
        ['rerun with project', RERUN, {maxWorkers: 2, project: 'x'}],
        ['rerun with 0 workers', RERUN, {maxWorkers: 0}],
        ['rerun with too many workers', RERUN, {maxWorkers: 5}],
        ['rerun with string workers', RERUN, {maxWorkers: '2'}],
        ['rerun with float workers', RERUN, {maxWorkers: 1.5}],
        ['rerun with an array body', RERUN, [{maxWorkers: 2}]],
        ['rerun with a null body', RERUN, null],
        ['group without filePath', GROUP, {maxWorkers: 2}],
        ['group without maxWorkers', GROUP, {filePath: 'tests/a.spec.ts'}],
        ['group with too many workers', GROUP, group({maxWorkers: 99})],
        ['group with an extra key', GROUP, group({source: 'script'})],
        ['group with project', GROUP, group({project: 'x'})],
        ['group with ..', GROUP, group({filePath: '../x.spec.ts'})],
        ['group with inner ..', GROUP, group({filePath: 'tests/../../x.spec.ts'})],
        ['group with absolute path', GROUP, group({filePath: '/etc/passwd'})],
        ['group with option-like path', GROUP, group({filePath: '--config=evil'})],
        ['group with backslash', GROUP, group({filePath: 'tests\\a.spec.ts'})],
        ['group with newline', GROUP, group({filePath: 'tests/a\n.spec.ts'})],
        ['group with empty path', GROUP, group({filePath: ''})],
        ['group with a leading dash', GROUP, group({filePath: '-a.spec.ts'})],
        ['group with a double dash', GROUP, group({filePath: '--a.spec.ts'})],
        ['group with match-all regex', GROUP, group({filePath: '.*'})],
        ['group with a bare word', GROUP, group({filePath: 'spec'})],
        ['group with a directory', GROUP, group({filePath: 'tests'})],
        ['group with empty regex group', GROUP, group({filePath: '(?:)'})],
        ['group with alternation', GROUP, group({filePath: 'a.spec.ts|b.spec.ts'})],
        ['group with a char class', GROUP, group({filePath: '[a-z]x.spec.ts'})],
        ['group with an anchor', GROUP, group({filePath: 'a.spec.ts$'})],
        ['group with a plus', GROUP, group({filePath: 'tests/a+.spec.ts'})],
        ['group with a space', GROUP, group({filePath: 'tests/a b.spec.ts'})],
        ['group with a non-spec extension', GROUP, group({filePath: 'tests/a.txt'})],
        ['group with a dotted segment', GROUP, group({filePath: 'tests/..spec.ts'})],
        ['group with a hidden dir', GROUP, group({filePath: '.hidden/a.spec.ts'})],
        ['group with empty segment', GROUP, group({filePath: 'tests//a.spec.ts'})],
        ['group with long path', GROUP, group({filePath: `${'a'.repeat(400)}.ts`})],
        ['group with non-array names', GROUP, group({testNames: 'x'})],
        ['group with empty names', GROUP, group({testNames: []})],
        ['group with non-string name', GROUP, group({testNames: [1]})],
        ['group with too many names', GROUP, group({testNames: Array(51).fill('x')})],
        ['group with a long name', GROUP, group({testNames: ['x'.repeat(301)]})],
        ['group with a control char in a name', GROUP, group({testNames: ['a\u0000b']})],
    ])('rejects a bad body: %s', (_n, path, body) => {
        expect(isAllowedRunPost(path, body)).toBe(false)
    })
})
