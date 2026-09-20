import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query'
import {authGet, authPut} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

// 'left' | 'right' = Tickets column on lg+ (chips under the name below lg);
// 'below' = chips under the test name at every width, no column
export type ChipAlignment = 'left' | 'right' | 'below'

// 'tickets' = only ticket-key tags (ABC-123) become chips; 'all' = every tag does
export type TagMode = 'tickets' | 'all'

export interface JiraSettings {
    baseUrl: string
    chipAlignment: ChipAlignment
    tagMode: TagMode
}

export const JIRA_SETTINGS_QUERY_KEY = ['jira-settings'] as const

export const DEFAULT_JIRA_SETTINGS: JiraSettings = {
    baseUrl: '',
    chipAlignment: 'left',
    tagMode: 'tickets',
}

async function fetchJiraSettings(): Promise<JiraSettings> {
    const response = await authGet(`${config.api.baseUrl}/settings/jira`)
    if (!response.ok) {
        throw new Error('Failed to fetch Jira settings')
    }
    const result = await response.json()
    return result.data
}

async function saveJiraSettings(settings: JiraSettings): Promise<JiraSettings> {
    const response = await authPut(`${config.api.baseUrl}/settings/jira`, settings)
    if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.message || 'Failed to save Jira settings')
    }
    const result = await response.json()
    return result.data
}

/**
 * Global Jira settings. Fetched once at App level (`enabled: isAuthenticated`);
 * rows and chips pass `enabled = false` and just read the shared cache.
 */
export function useJiraSettings(enabled = true) {
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: JIRA_SETTINGS_QUERY_KEY,
        queryFn: fetchJiraSettings,
        staleTime: 60000,
        enabled,
    })

    const mutation = useMutation({
        mutationFn: saveJiraSettings,
        onSuccess: (data) => {
            queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, data)
        },
    })

    return {
        settings: query.data ?? DEFAULT_JIRA_SETTINGS,
        isLoading: query.isLoading,
        error: query.error,
        saveSettings: mutation.mutate,
        isSaving: mutation.isPending,
        saveError: mutation.error,
        resetSaveError: mutation.reset,
    }
}
