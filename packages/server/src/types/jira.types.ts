// Jira Cloud integration types (read-only enrichment for ticket-key tags).

export type JiraStatusCategory = 'new' | 'indeterminate' | 'done'

// One cached ticket, as served to the frontend and stored in jira_ticket_cache.
export interface JiraTicketInfo {
    key: string
    issueType: string
    statusName: string
    statusCategory: JiraStatusCategory
    summary: string
    assignee: string | null
    fetchedAt: string
}

// Row shape from jira_ticket_cache (snake_case).
export interface JiraTicketCacheRow {
    ticket_key: string
    issue_type: string
    status_name: string
    status_category: JiraStatusCategory
    summary: string
    assignee: string | null
    fetched_at: string
}

export interface JiraSyncResult {
    checked: number
    updated: number
    failed: number
}

export interface JiraConnectionStatus {
    enabled: boolean
    // ISO timestamp (with Z) of the most recent ticket actually written to the cache, or null.
    lastSyncAt: string | null
    // Outcome of the most recent sync ATTEMPT (may differ from lastSyncAt: an attempt that fails
    // entirely still records here even though nothing was written to the cache). null = no sync
    // has been attempted yet (integration just enabled, or has never run).
    lastSyncOk: boolean | null
    // Short, human-readable reason for the last attempt's failure (e.g. "authentication (401)"),
    // or null when the last attempt succeeded (or none has run yet). Never the raw response body.
    lastSyncError: string | null
}

// Row shape from jira_sync_status (single row, id = 1).
export interface JiraSyncStatusRow {
    id: number
    ok: number // SQLite has no boolean type — 0/1
    error_reason: string | null
    attempted_at: string
}

// Minimal shape of one Jira Cloud issue as returned by `/rest/api/3/issue/bulkfetch`
// (only the fields we request).
export interface JiraApiIssue {
    key: string
    fields: {
        issuetype?: {name?: string}
        status?: {name?: string; statusCategory?: {key?: string}}
        summary?: string
        assignee?: {displayName?: string} | null
    }
}

// `POST /rest/api/3/issue/bulkfetch` response. A key Jira can't resolve (deleted, no access,
// invalid key) is simply absent from `issues` — it is NOT listed in `issueErrors` either. Per
// the Atlassian bulkfetch spec, `issueErrors` covers only transient per-issue failures during
// the fetch; the caller must not treat its presence as a whole-batch failure.
export interface JiraBulkFetchResponse {
    issues?: JiraApiIssue[]
    issueErrors?: Array<{id: string; errorMessage: string}>
}
