import {IJiraTicketRepository} from '../repositories/jiraTicket.repository'
import {ITestRepository} from '../types/service.types'
import {
    JiraApiIssue,
    JiraBulkFetchResponse,
    JiraConnectionStatus,
    JiraStatusCategory,
    JiraSyncResult,
    JiraTicketInfo,
} from '../types/jira.types'
import {extractJiraTicketKeysFromMetadataRows} from '../utils/jiraTicketKey.util'
import {Logger} from '../utils/logger.util'
import {config} from '../config/environment.config'

// Jira Cloud caps `issueIdsOrKeys` at 100 per `POST /rest/api/3/issue/bulkfetch` call. 50 keeps
// every batch comfortably under that and keeps a single bad batch's blast radius small.
const BATCH_SIZE = 50
const VALID_CATEGORIES: JiraStatusCategory[] = ['new', 'indeterminate', 'done']

// Carries the HTTP status so refreshKeys can turn it into a short, human reason (never the raw
// response body — that could echo back request details we don't want in the UI/logs).
class JiraApiError extends Error {
    constructor(
        public status: number,
        message: string
    ) {
        super(message)
    }
}

function describeJiraError(error: unknown): string {
    if (error instanceof JiraApiError) {
        if (error.status === 401 || error.status === 403) {
            return `authentication (${error.status})`
        }
        if (error.status === 429) {
            return 'rate limited (429)'
        }
        if (error.status >= 500) {
            return `Jira unavailable (${error.status})`
        }
        return `sync failed (${error.status})`
    }
    return 'network error'
}

export interface IJiraService {
    isEnabled(): boolean
    getStatus(): Promise<JiraConnectionStatus>
    getTicketInfo(keys: string[]): Promise<JiraTicketInfo[]>
    refreshAllKnownKeys(): Promise<JiraSyncResult>
}

export class JiraService implements IJiraService {
    // A manual "Refresh now" click can land while the 30-minute timer's sync is still running
    // (or vice versa). Rather than run both, the second caller awaits and reuses the first's
    // in-flight result.
    private syncInFlight: Promise<JiraSyncResult> | null = null

    constructor(
        private jiraTicketRepository: IJiraTicketRepository,
        private testRepository: ITestRepository
    ) {}

    isEnabled(): boolean {
        return config.jira.enabled
    }

    async getStatus(): Promise<JiraConnectionStatus> {
        const [lastSyncAt, lastAttempt] = await Promise.all([
            this.jiraTicketRepository.getLastSyncAt(),
            this.jiraTicketRepository.getLastSyncStatus(),
        ])
        return {
            enabled: this.isEnabled(),
            lastSyncAt,
            lastSyncOk: lastAttempt?.ok ?? null,
            lastSyncError: lastAttempt && !lastAttempt.ok ? lastAttempt.errorReason : null,
        }
    }

    /** Cached info for the requested keys. Missing/never-synced keys are simply absent — the
     *  caller (chip rendering) treats an absent key as "no data yet", not an error. Always []
     *  when the integration isn't configured, even if a cache from an earlier configuration
     *  still exists — env removed means "behave exactly as without this feature". */
    async getTicketInfo(keys: string[]): Promise<JiraTicketInfo[]> {
        if (!this.isEnabled() || keys.length === 0) return []
        return this.jiraTicketRepository.getByKeys(keys)
    }

    /** Discovers every ticket-key tag currently on any test, then refreshes all of them.
     *  No-op (not an error) when the integration isn't configured. Concurrent calls share one
     *  in-flight sync instead of racing. */
    async refreshAllKnownKeys(): Promise<JiraSyncResult> {
        if (!this.isEnabled()) {
            return {checked: 0, updated: 0, failed: 0}
        }
        if (this.syncInFlight) {
            return this.syncInFlight
        }

        this.syncInFlight = this.performSync().finally(() => {
            this.syncInFlight = null
        })
        return this.syncInFlight
    }

    private async performSync(): Promise<JiraSyncResult> {
        const rows = await this.testRepository.getAllLatestMetadata()
        const keys = extractJiraTicketKeysFromMetadataRows(rows)

        if (keys.length === 0) {
            await this.jiraTicketRepository.setLastSyncStatus({
                ok: true,
                errorReason: null,
                attemptedAt: new Date().toISOString(),
            })
            return {checked: 0, updated: 0, failed: 0}
        }

        const {result, failureReason} = await this.refreshKeys(keys)
        // ok/reason reflect whether any BATCH REQUEST itself failed (bad token, Jira down,
        // network) — not whether every individual ticket resolved. A ticket Jira can't resolve
        // (deleted, no access, typo'd key) is simply absent from the response's `issues` array —
        // a normal, expected outcome, not an integration failure — and must not flip the Settings
        // badge to "last sync failed".
        await this.jiraTicketRepository.setLastSyncStatus({
            ok: failureReason === null,
            errorReason: failureReason,
            attemptedAt: new Date().toISOString(),
        })
        return result
    }

    private async refreshKeys(
        keys: string[]
    ): Promise<{result: JiraSyncResult; failureReason: string | null}> {
        const result: JiraSyncResult = {checked: keys.length, updated: 0, failed: 0}
        let failureReason: string | null = null

        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            const batch = keys.slice(i, i + BATCH_SIZE)
            try {
                const tickets = await this.fetchBatch(batch)
                await this.jiraTicketRepository.upsertMany(tickets)
                result.updated += tickets.length
                // Keys Jira couldn't resolve (deleted, no access, typo) simply aren't in `tickets`
                // — their chip stays as today, the rest of the batch is unaffected.
                result.failed += batch.length - tickets.length
            } catch (error) {
                // One clear line per failing batch — never throws further, so a Jira outage or a
                // bad token degrades to "chips render as before", not a broken dashboard.
                const reason = describeJiraError(error)
                failureReason = failureReason ?? reason
                Logger.warn(
                    `Jira sync: batch of ${batch.length} ticket(s) failed (${reason}) — chips for these keys will show without type/status until the next sync.`,
                    error instanceof Error ? error.message : error
                )
                result.failed += batch.length
            }
        }

        return {result, failureReason}
    }

    private async fetchBatch(keys: string[]): Promise<JiraTicketInfo[]> {
        const url = `${config.jira.baseUrl}/rest/api/3/issue/bulkfetch`
        const auth = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64')

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                issueIdsOrKeys: keys,
                fields: ['issuetype', 'status', 'summary', 'assignee'],
            }),
        })

        if (!response.ok) {
            // Body may carry Jira's error detail but never the token — safe to include the status only.
            throw new JiraApiError(
                response.status,
                `Jira API responded ${response.status} ${response.statusText}`
            )
        }

        const body = (await response.json()) as JiraBulkFetchResponse
        // Per the bulkfetch spec, issueErrors covers only transient per-issue failures during
        // this request — never a deleted/inaccessible/typo'd key. Those simply don't appear in
        // `issues`, with no entry anywhere in the response; this log is about the transient case.
        if (body.issueErrors?.length) {
            Logger.debug(
                `Jira sync: ${body.issueErrors.length} of ${keys.length} key(s) in this batch hit a transient issueErrors failure`
            )
        }
        return (body.issues || []).map(mapIssueToTicketInfo)
    }
}

function mapIssueToTicketInfo(issue: JiraApiIssue): JiraTicketInfo {
    const categoryKey = issue.fields.status?.statusCategory?.key
    const statusCategory: JiraStatusCategory = VALID_CATEGORIES.includes(
        categoryKey as JiraStatusCategory
    )
        ? (categoryKey as JiraStatusCategory)
        : 'indeterminate' // unknown category from Jira — render as "in progress" rather than guess done/new

    return {
        key: issue.key,
        issueType: issue.fields.issuetype?.name || 'Unknown',
        statusName: issue.fields.status?.name || 'Unknown',
        statusCategory,
        summary: issue.fields.summary || '',
        assignee: issue.fields.assignee?.displayName ?? null,
        // Explicit ISO with Z — see schema.sql (fetched_at) for why this must never be a naive
        // SQL-side timestamp.
        fetchedAt: new Date().toISOString(),
    }
}
