import {DashboardError, type Session} from './auth'
import {JIRA_BATCH_SIZE, SERVER_LIST_WINDOW} from './constants'
import {RUN_GROUP_PATH, TEST_ID_RE, UUID_RE} from './http'
import type {
    AttachmentRow,
    Envelope,
    JiraStatus,
    JiraTicket,
    ProjectSummary,
    RunRow,
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

export const RUNS_DISABLED =
    'Runs are disabled for this dashboard (set DASHBOARD_ALLOW_RUNS=true in this MCP server config to enable them)'

export function assertRunId(id: string): void {
    if (!UUID_RE.test(id)) throw new DashboardError('Invalid runId (expected a UUID)')
}

const ATTACHMENT_URL_RE = /^\/attachments\/([^/]+)\/([^/]+)$/

// Typed GET wrappers. Every request goes through Session -> http.ts (the allowlist).
export class DashboardClient {
    constructor(private readonly session: Session) {}

    get runsEnabled(): boolean {
        return this.session.runsEnabled
    }

    assertRunsEnabled(): void {
        if (!this.runsEnabled) throw new DashboardError(RUNS_DISABLED)
    }

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

    // Starts a run. Never retried: a busy dashboard answers 409/423 and the caller gets a clear message.
    // Run ids this process started (memory only, capped), for the run-age line of get_run_status
    private readonly startedAt = new Map<string, number>()

    runStartedAt(runId: string): number | undefined {
        return this.startedAt.get(runId)
    }

    // Every filePath the dashboard lists (unscoped list + each project's); any failed read throws,
    // so callers fail closed. windowFull: some list hit the server window, files may be missing.
    async knownFiles(): Promise<{files: Set<string>; windowFull: boolean}> {
        const files = new Set<string>()
        let windowFull = false
        const add = (res: {rows: TestRow[]; windowFull: boolean}) => {
            windowFull ||= res.windowFull
            for (const r of res.rows) files.add(r.filePath)
        }
        add(await this.listTests())
        for (const p of await this.summaryByProject()) add(await this.listTests(p.project))
        return {files, windowFull}
    }

    // Latest execution of a test within one project
    async latestInProject(testId: string, project: string): Promise<TestRow | undefined> {
        assertTestId(testId)
        const {rows, windowFull} = await this.listTests(project)
        const found = rows.find((r) => r.testId === testId)
        if (!found && windowFull) {
            throw new DashboardError(
                `Test ${testId} not found in "${project}" (only the newest ${SERVER_LIST_WINDOW} tests are checked)`
            )
        }
        return found
    }

    private async startRun(path: string, body: unknown): Promise<string> {
        this.assertRunsEnabled()
        const res = await this.session.postRun(path, body)
        if (res.status === 200) {
            let runId: unknown
            try {
                runId = JSON.parse(res.body.toString('utf8')).data?.runId
            } catch {
                // handled below
            }
            if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
                throw new DashboardError(
                    'Dashboard answered 200 but returned no usable runId: a run may have started, check the dashboard UI'
                )
            }
            if (this.startedAt.size >= 100)
                this.startedAt.delete(this.startedAt.keys().next().value!)
            this.startedAt.set(runId, Date.now())
            return runId
        }
        let payload: {code?: unknown; currentRunId?: unknown} = {}
        try {
            payload = JSON.parse(res.body.toString('utf8'))
        } catch {
            // not JSON: fall through to the status text
        }
        const current =
            typeof payload.currentRunId === 'string' && UUID_RE.test(payload.currentRunId)
                ? ` (run ${payload.currentRunId})`
                : ''
        const NOT_STARTED = 'Not started: '
        switch (payload.code) {
            case 'TESTS_ALREADY_RUNNING':
                throw new DashboardError(
                    `${NOT_STARTED}a run is already active on this dashboard${current}. Try again after it finishes; this tool does not retry.`,
                    res.status
                )
            case 'CI_RUN_QUEUED':
                throw new DashboardError(
                    `${NOT_STARTED}a CI run is queued and starts when the current run ends. Try again later; this tool does not retry.`,
                    res.status
                )
            case 'RUN_CANCELLED':
                throw new DashboardError(
                    `${NOT_STARTED}a Stop was requested while the run was preparing.`,
                    res.status
                )
            case 'CI_AUTORUN_PAUSED':
                throw new DashboardError(`${NOT_STARTED}CI auto-run is paused.`, res.status)
        }
        if (res.status === 404) throw new DashboardError('Test not found', 404)
        if (res.status === 400) {
            throw new DashboardError(
                `${NOT_STARTED}the dashboard rejected the request (HTTP 400)`,
                400
            )
        }
        if (res.status >= 500) {
            throw new DashboardError(
                `Dashboard answered HTTP ${res.status}: the run may have started. Check get_run_status or the dashboard UI before trying again`,
                res.status
            )
        }
        throw new DashboardError(`Dashboard answered HTTP ${res.status}`, res.status)
    }

    rerunExecution(executionId: string, maxWorkers: number) {
        assertExecutionId(executionId)
        return this.startRun(`/api/tests/${executionId}/rerun`, {maxWorkers})
    }

    runFile(filePath: string, maxWorkers: number, testNames?: string[]) {
        return this.startRun(RUN_GROUP_PATH, {
            filePath,
            maxWorkers,
            ...(testNames ? {testNames} : {}),
        })
    }

    async run(runId: string) {
        assertRunId(runId)
        try {
            return (await this.getEnvelope<RunRow>(`/api/runs/${runId}`)).data
        } catch (err) {
            if (err instanceof DashboardError && err.status === 404) {
                throw new DashboardError(
                    'Run not found (it never existed, or it was stopped and deleted)',
                    404
                )
            }
            throw err
        }
    }

    async runResults(runId: string, limit: number) {
        assertRunId(runId)
        const env = await this.getEnvelope<TestRow[]>('/api/tests', {runId, limit})
        return env.data
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
