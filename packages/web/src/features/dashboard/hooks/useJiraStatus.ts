import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query'
import {authGet, authPost} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface JiraStatus {
    // true only when JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN are all set on the server.
    enabled: boolean
    lastSyncAt: string | null
    // Outcome of the most recent sync ATTEMPT — may be false even when lastSyncAt is set (an
    // older successful sync, followed by a failing one). null = no attempt yet.
    lastSyncOk: boolean | null
    // Short, human reason for the last attempt's failure (e.g. "authentication (401)"), or null
    // when the last attempt succeeded or none has run.
    lastSyncError: string | null
}

export interface JiraRefreshResult {
    checked: number
    updated: number
    failed: number
    lastSyncAt: string | null
}

const JIRA_STATUS_QUERY_KEY = ['jira-status'] as const
const DEFAULT_STATUS: JiraStatus = {
    enabled: false,
    lastSyncAt: null,
    lastSyncOk: null,
    lastSyncError: null,
}

async function fetchJiraStatus(): Promise<JiraStatus> {
    const response = await authGet(`${config.api.baseUrl}/jira/status`)
    if (!response.ok) {
        throw new Error('Failed to fetch Jira connection status')
    }
    const result = await response.json()
    return result.data
}

async function refreshJiraTickets(): Promise<JiraRefreshResult> {
    const response = await authPost(`${config.api.baseUrl}/jira/refresh`)
    if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.message || 'Failed to refresh Jira tickets')
    }
    const result = await response.json()
    return result.data
}

/** Connection status + manual "refresh now" for Settings → Tags & tickets. */
export function useJiraStatus() {
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: JIRA_STATUS_QUERY_KEY,
        queryFn: fetchJiraStatus,
        staleTime: 60 * 1000,
    })

    const mutation = useMutation({
        mutationFn: refreshJiraTickets,
        onSuccess: () => {
            // Refetch rather than hand-construct: the refresh response doesn't carry
            // lastSyncOk/lastSyncError, only GET /jira/status does.
            queryClient.invalidateQueries({queryKey: JIRA_STATUS_QUERY_KEY})
            // Chips on screen may now have fresher (or first-time) type/status data.
            queryClient.invalidateQueries({queryKey: ['jira-ticket-info']})
        },
    })

    return {
        status: query.data ?? DEFAULT_STATUS,
        isLoading: query.isLoading,
        refresh: mutation.mutate,
        isRefreshing: mutation.isPending,
        refreshResult: mutation.data,
        refreshError: mutation.error,
        resetRefreshError: mutation.reset,
    }
}
