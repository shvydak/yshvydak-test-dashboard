import {useMemo} from 'react'
import {useQuery} from '@tanstack/react-query'
import {authGet} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export type JiraStatusCategory = 'new' | 'indeterminate' | 'done'

export interface JiraTicketInfo {
    key: string
    issueType: string
    statusName: string
    statusCategory: JiraStatusCategory
    summary: string
    assignee: string | null
    fetchedAt: string
}

// Must match the server's MAX_TICKET_KEYS_PER_REQUEST (jira.controller.ts) — that endpoint
// 400s above this count. A screen with more ticket-key tags than this would otherwise get zero
// enrichment; chunk into parallel batches instead.
const MAX_KEYS_PER_REQUEST = 200

async function fetchTicketBatch(keys: string[]): Promise<JiraTicketInfo[]> {
    const response = await authGet(
        `${config.api.baseUrl}/jira/tickets?keys=${encodeURIComponent(keys.join(','))}`
    )
    if (!response.ok) {
        throw new Error('Failed to fetch Jira ticket info')
    }
    const result = await response.json()
    return result.data || []
}

async function fetchJiraTicketInfo(keys: string[]): Promise<JiraTicketInfo[]> {
    const batches: string[][] = []
    for (let i = 0; i < keys.length; i += MAX_KEYS_PER_REQUEST) {
        batches.push(keys.slice(i, i + MAX_KEYS_PER_REQUEST))
    }
    // allSettled, not all: one bad batch (network blip, a transient 5xx) must not drop the
    // tickets every OTHER batch already resolved — a failed batch's keys just stay absent,
    // same as "not synced yet" (see the map-building comment below).
    const results = await Promise.allSettled(batches.map(fetchTicketBatch))
    return results.flatMap((batchResult) =>
        batchResult.status === 'fulfilled' ? batchResult.value : []
    )
}

/**
 * Cached Jira type/status/summary/assignee for a set of ticket-key tags, keyed by ticket key.
 * A key absent from the returned map means "no Jira data yet" (integration disabled, ticket
 * not synced yet, or lookup failed) — never an error state; callers fall back to the plain chip.
 */
export function useJiraTicketInfo(keys: string[]) {
    // Sorted + de-duplicated so the query key (and the cache entry) is stable across renders
    // that pass the same set of keys in a different order.
    const sortedKeys = useMemo(() => Array.from(new Set(keys)).sort(), [keys])

    const query = useQuery({
        queryKey: ['jira-ticket-info', sortedKeys],
        queryFn: () => fetchJiraTicketInfo(sortedKeys),
        enabled: sortedKeys.length > 0,
        staleTime: 5 * 60 * 1000,
    })

    const ticketInfo = useMemo(() => {
        const map = new Map<string, JiraTicketInfo>()
        for (const ticket of query.data ?? []) {
            map.set(ticket.key, ticket)
        }
        return map
    }, [query.data])

    return {ticketInfo, isLoading: query.isLoading}
}
