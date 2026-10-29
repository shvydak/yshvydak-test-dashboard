import {DashboardError, type Session} from './auth'
import {JIRA_BATCH_SIZE, SERVER_LIST_WINDOW} from './constants'
import {TEST_ID_RE, UUID_RE} from './http'
import type {
    AttachmentRow,
    Envelope,
    JiraStatus,
    JiraTicket,
    ProjectSummary,
    TabConfig,
    TestRow,
} from './types'

export type Degradable<T> = {ok: true; value: T} | {ok: false; reason: string}

export function assertTestId(id: string): void {
    if (!TEST_ID_RE.test(id)) throw new DashboardError('Invalid testId (expected test-<base36>)')
}

export function assertExecutionId(id: string): void {
    if (!UUID_RE.test(id)) throw new DashboardError('Invalid executionId (expected a UUID)')
}

const ATTACHMENT_URL_RE = /^\/attachments\/([^/]+)\/([^/]+)$/

// Typed GET wrappers. Every request goes through Session -> http.ts (the allowlist).
export class DashboardClient {
    constructor(private readonly session: Session) {}

    authEnabled(): Promise<boolean> {
        return this.session.isAuthEnabled()
    }

    private async getEnvelope<T>(
        path: string,
        query?: Record<string, string | number | undefined>
    ) {
        const res = await this.session.get(path, {query})
        if (res.status === 404) throw new DashboardError('Not found', 404)
        if (res.status !== 200)
            throw new DashboardError(`Dashboard answered HTTP ${res.status}`, res.status)
        return JSON.parse(res.body.toString('utf8')) as Envelope<T>
    }

    // 403 on /settings and /jira = the dashboard has login turned off (these routes need a JWT)
    private async degradable<T>(
        path: string,
        query?: Record<string, string>
    ): Promise<Degradable<T>> {
        try {
            return {ok: true, value: (await this.getEnvelope<T>(path, query)).data}
        } catch (err) {
            if (err instanceof DashboardError && err.status === 403) {
                const off = !(await this.authEnabled())
                return {ok: false, reason: off ? 'login is off' : 'forbidden'}
            }
            if (err instanceof DashboardError) return {ok: false, reason: err.message}
            throw err
        }
    }

    tabs() {
        return this.degradable<TabConfig[]>('/api/settings/project-tabs')
    }

    async summaryByProject() {
        return (await this.getEnvelope<ProjectSummary[]>('/api/tests/summary-by-project')).data
    }

    jiraStatus() {
        return this.degradable<JiraStatus>('/api/jira/status')
    }

    async jiraTickets(
        keys: string[]
    ): Promise<Degradable<{tickets: Map<string, JiraTicket>; lastSyncAt: string | null}>> {
        const status = await this.jiraStatus()
        if (!status.ok) return status
        // The tickets route answers [] when the integration is off, even with an old cache
        if (!status.value.enabled) return {ok: false, reason: 'Jira integration is off'}
        const found = new Map<string, JiraTicket>()
        for (let i = 0; i < keys.length; i += JIRA_BATCH_SIZE) {
            const batch = keys.slice(i, i + JIRA_BATCH_SIZE)
            const res = await this.degradable<JiraTicket[]>('/api/jira/tickets', {
                keys: batch.join(','),
            })
            if (!res.ok) return res
            for (const t of res.value) found.set(t.key, t)
        }
        return {ok: true, value: {tickets: found, lastSyncAt: status.value.lastSyncAt}}
    }

    async listTests(project?: string): Promise<{rows: TestRow[]; windowFull: boolean}> {
        const env = await this.getEnvelope<TestRow[]>('/api/tests', {
            project,
            limit: SERVER_LIST_WINDOW,
        })
        return {rows: env.data, windowFull: env.data.length >= SERVER_LIST_WINDOW}
    }

    async testByTestId(testId: string) {
        assertTestId(testId)
        return (await this.getEnvelope<TestRow>(`/api/tests/by-test-id/${testId}`)).data
    }

    async testByExecutionId(executionId: string) {
        assertExecutionId(executionId)
        return (await this.getEnvelope<TestRow>(`/api/tests/${executionId}`)).data
    }

    async history(testId: string, limit: number, before?: string) {
        assertTestId(testId)
        const env = await this.getEnvelope<TestRow[]>(`/api/tests/${testId}/history`, {
            byTestId: 'true',
            limit,
            before,
        })
        return {rows: env.data, total: env.count ?? env.data.length}
    }

    // Rebuilds the URL from validated parts: the response's own URL is never fetched as-is.
    attachmentPath(att: Pick<AttachmentRow, 'url'>): string | undefined {
        const m = ATTACHMENT_URL_RE.exec(att.url ?? '')
        if (!m || !UUID_RE.test(m[1])) return undefined
        const name = m[2]

        if (name === '.' || name === '..' || /[\\\x00-\x1f]/.test(name)) return undefined
        // encodeURIComponent leaves !'()* alone
        let encoded: string
        try {
            encoded = encodeURIComponent(name).replace(
                /[!'()*]/g,
                (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
            )
        } catch {
            return undefined // lone surrogate in the name
        }
        return `/attachments/${m[1]}/${encoded}`
    }

    async attachmentBytes(path: string, maxBytes: number) {
        const res = await this.session.get(path, {maxBytes})
        if (res.status !== 200)
            throw new DashboardError(`Attachment HTTP ${res.status}`, res.status)
        return res
    }
}
