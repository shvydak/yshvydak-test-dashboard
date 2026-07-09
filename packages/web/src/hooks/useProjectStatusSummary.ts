import {useQuery} from '@tanstack/react-query'
import {authGet} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface ProjectStatusSummary {
    project: string
    total: number
    passed: number
    failed: number
}

async function fetchProjectStatusSummary(): Promise<ProjectStatusSummary[]> {
    const res = await authGet(`${config.api.baseUrl}/tests/summary-by-project`)
    if (!res.ok) {
        throw new Error('Failed to load project status summary')
    }
    const data = await res.json()
    return data.data ?? []
}

/**
 * Latest passed/failed counts per project — reflects the current state of every
 * project regardless of what triggered each test's last run (manual rerun, group
 * run, Run All, or a CI-pipeline step). Powers the tab-bar status badge.
 */
export function useProjectStatusSummary(isAuthenticated = true) {
    const query = useQuery({
        queryKey: ['project-status-summary'],
        queryFn: fetchProjectStatusSummary,
        enabled: isAuthenticated,
    })

    return {
        summary: query.data ?? [],
        isLoading: query.isLoading,
    }
}
