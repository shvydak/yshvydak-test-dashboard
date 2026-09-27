import {BaseRepository} from './base.repository'
import {JiraTicketCacheRow, JiraTicketInfo, JiraSyncStatusRow} from '../types/jira.types'

function rowToInfo(row: JiraTicketCacheRow): JiraTicketInfo {
    return {
        key: row.ticket_key,
        issueType: row.issue_type,
        statusName: row.status_name,
        statusCategory: row.status_category,
        summary: row.summary,
        assignee: row.assignee,
        fetchedAt: row.fetched_at,
    }
}

export interface JiraSyncStatus {
    ok: boolean
    errorReason: string | null
    attemptedAt: string
}

export interface IJiraTicketRepository {
    getByKeys(keys: string[]): Promise<JiraTicketInfo[]>
    upsertMany(tickets: JiraTicketInfo[]): Promise<void>
    getLastSyncAt(): Promise<string | null>
    getLastSyncStatus(): Promise<JiraSyncStatus | null>
    setLastSyncStatus(status: JiraSyncStatus): Promise<void>
}

export class JiraTicketRepository extends BaseRepository implements IJiraTicketRepository {
    async getByKeys(keys: string[]): Promise<JiraTicketInfo[]> {
        if (keys.length === 0) return []

        const placeholders = keys.map(() => '?').join(', ')
        const rows = await this.queryAll<JiraTicketCacheRow>(
            `SELECT * FROM jira_ticket_cache WHERE ticket_key IN (${placeholders})`,
            keys
        )
        return rows.map(rowToInfo)
    }

    async upsertMany(tickets: JiraTicketInfo[]): Promise<void> {
        for (const ticket of tickets) {
            await this.execute(
                `
                    INSERT INTO jira_ticket_cache
                        (ticket_key, issue_type, status_name, status_category, summary, assignee, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ticket_key) DO UPDATE SET
                        issue_type = excluded.issue_type,
                        status_name = excluded.status_name,
                        status_category = excluded.status_category,
                        summary = excluded.summary,
                        assignee = excluded.assignee,
                        fetched_at = excluded.fetched_at
                `,
                [
                    ticket.key,
                    ticket.issueType,
                    ticket.statusName,
                    ticket.statusCategory,
                    ticket.summary,
                    ticket.assignee,
                    // Bound explicitly (ISO, with Z) — see schema.sql comment on fetched_at for why
                    // this must never be left to SQLite's own CURRENT_TIMESTAMP.
                    ticket.fetchedAt,
                ]
            )
        }
    }

    // Derived from the cache itself (MAX(fetched_at)) rather than a dedicated app_settings key —
    // one less piece of state to keep in sync. Only downside: reads back `null` for "connected,
    // background sync ran, but zero ticket-key tags exist yet" — same as "never synced". Accepted
    // as a rare, self-correcting transient (the moment one ticket tag appears, this stops being null).
    async getLastSyncAt(): Promise<string | null> {
        const row = await this.queryOne<{maxFetchedAt: string | null}>(
            `SELECT MAX(fetched_at) as maxFetchedAt FROM jira_ticket_cache`
        )
        return row?.maxFetchedAt ?? null
    }

    async getLastSyncStatus(): Promise<JiraSyncStatus | null> {
        const row = await this.queryOne<JiraSyncStatusRow>(
            `SELECT * FROM jira_sync_status WHERE id = 1`
        )
        if (!row) return null
        return {ok: !!row.ok, errorReason: row.error_reason, attemptedAt: row.attempted_at}
    }

    async setLastSyncStatus(status: JiraSyncStatus): Promise<void> {
        await this.execute(
            `
                INSERT INTO jira_sync_status (id, ok, error_reason, attempted_at)
                VALUES (1, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    ok = excluded.ok,
                    error_reason = excluded.error_reason,
                    attempted_at = excluded.attempted_at
            `,
            [status.ok ? 1 : 0, status.errorReason, status.attemptedAt]
        )
    }
}
