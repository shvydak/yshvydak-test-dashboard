import {Session} from '../../auth'
import {DashboardClient} from '../../client'
import type {Config} from '../../config'
import {createHttp} from '../../http'
import {createTools} from '../../tools'
import type {AttachmentRow, TestRow} from '../../types'

export const ID_A = 'test-abc123'
export const EXEC_1 = '11111111-1111-4111-8111-111111111111'
export const EXEC_2 = '22222222-2222-4222-8222-222222222222'

export interface FakeReply {
    status?: number
    json?: unknown
    body?: Buffer | string
    headers?: Record<string, string>
}
export type Router = (method: string, url: URL, headers: Headers) => FakeReply | undefined

export interface Recorded {
    method: string
    path: string
    search: string
    auth: string | null
}

export function envelope(data: unknown, count?: number): FakeReply {
    return {json: {success: true, data, count}}
}

// A fetch stand-in that records every request; unrouted requests fail the test loudly.
export function makeFetch(router: Router) {
    const calls: Recorded[] = []
    const fetchFn = (async (input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input))
        const headers = new Headers(init?.headers)
        const method = init?.method ?? 'GET'
        calls.push({
            method,
            path: url.pathname,
            search: url.search,
            auth: headers.get('authorization'),
        })
        const reply = router(method, url, headers)
        if (!reply) throw new Error(`unrouted request: ${method} ${url.pathname}`)
        const body =
            reply.body !== undefined
                ? reply.body
                : JSON.stringify(reply.json ?? {success: true, data: null})
        return new Response(body, {
            status: reply.status ?? 200,
            headers: {'content-type': 'application/json', ...reply.headers},
        })
    }) as typeof fetch
    return {fetchFn, calls}
}

export function makeStack(
    router: Router,
    config: Partial<Config> = {},
    runPasswordCmd?: (cmd: string) => Promise<string>
) {
    const {fetchFn, calls} = makeFetch(router)
    const cfg: Config = {root: 'https://dashboard.example.com', ...config}
    const session = new Session(cfg, createHttp(cfg.root, fetchFn), runPasswordCmd)
    const client = new DashboardClient(session)
    const tools = createTools(client, 'dashboard.example.com')
    const tool = (name: string) => {
        const def = tools.find((t) => t.name === name)!
        return (args: Record<string, unknown> = {}) => def.handler(def.input.parse(args) as never)
    }
    return {calls, client, session, tools, tool}
}

export const authOff: Router = (_m, url) =>
    url.pathname === '/api/auth/config' ? envelope({authEnabled: false}) : undefined

export function row(over: Partial<TestRow> = {}): TestRow {
    return {
        id: EXEC_1,
        runId: 'run-1',
        testId: ID_A,
        name: 'Checkout works',
        filePath: 'tests/checkout.spec.ts',
        status: 'passed',
        duration: 1200,
        project: 'All_Tests',
        createdAt: '2026-10-20T10:00:00.000Z',
        metadata: {tags: [], line: 12},
        ...over,
    }
}

export function shot(over: Partial<AttachmentRow> = {}): AttachmentRow {
    return {
        id: 'att-1',
        testResultId: EXEC_1,
        type: 'screenshot',
        fileName: 'shot.png',
        fileSize: 2048,
        mimeType: 'image/png',
        url: `/attachments/${EXEC_1}/shot.png`,
        ...over,
    }
}

export const textOf = (res: {content: Array<{type: string; text?: string}>}) =>
    JSON.parse(res.content.find((c) => c.type === 'text')!.text!)

export interface World {
    authEnabled?: boolean
    tabs?: Array<{project: string; displayName?: string}> | 403
    summary?: Array<{project: string; total: number; passed: number; failed: number}>
    rows?: TestRow[]
    byTestId?: TestRow
    byExecution?: TestRow
    history?: TestRow[]
    historyTotal?: number
    jira?: {enabled: boolean; tickets: Array<Record<string, unknown>>; lastSyncError?: string} | 403
    files?: Record<string, Buffer>
}

// Router for a whole fake dashboard; the sweep and the tool tests share it.
export function world(w: World): Router {
    return (_m, url) => {
        const p = url.pathname
        if (p === '/api/auth/config') return envelope({authEnabled: w.authEnabled ?? false})
        if (p === '/api/settings/project-tabs') {
            return w.tabs === 403 || w.tabs === undefined
                ? {status: 403, json: {success: false}}
                : envelope(w.tabs)
        }
        if (p === '/api/tests/summary-by-project') return envelope(w.summary ?? [])
        if (p === '/api/tests') {
            const project = url.searchParams.get('project')
            const rows = (w.rows ?? []).filter((r) => !project || r.project === project)
            return envelope(rows, rows.length)
        }
        if (p.startsWith('/api/tests/by-test-id/')) return envelope(w.byTestId ?? w.rows?.[0])
        if (p.endsWith('/history')) {
            const h = w.history ?? []
            return envelope(h, w.historyTotal ?? h.length)
        }
        if (/^\/api\/tests\/[0-9a-f-]{36}$/.test(p)) return envelope(w.byExecution ?? w.rows?.[0])
        if (p === '/api/jira/status') {
            return w.jira === 403 || w.jira === undefined
                ? {status: 403, json: {success: false}}
                : envelope({
                      enabled: w.jira.enabled,
                      lastSyncAt: '2026-10-28T08:00:00.000Z',
                      lastSyncOk: true,
                      lastSyncError: w.jira.lastSyncError ?? null,
                  })
        }
        if (p === '/api/jira/tickets' && w.jira && w.jira !== 403) {
            const keys = (url.searchParams.get('keys') ?? '').split(',')
            return envelope(w.jira.tickets.filter((t) => keys.includes(String(t.key))))
        }
        if (p.startsWith('/attachments/')) {
            const file = w.files?.[decodeURIComponent(p.split('/').pop()!)]
            return file ? {body: file, headers: {'content-type': 'image/png'}} : {status: 404}
        }
        return undefined
    }
}

export const ticket = (key: string, statusCategory: string, issueType = 'Bug') => ({
    key,
    issueType,
    statusName: statusCategory === 'done' ? 'Done' : 'Open',
    statusCategory,
    summary: 'secret summary',
    assignee: 'someone',
    fetchedAt: '2026-10-28T08:00:00.000Z',
})
