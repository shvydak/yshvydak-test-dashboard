import {useQuery} from '@tanstack/react-query'
import {TestResult} from '@yshvydak/core'
import {authGet} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'
import {FilterKey} from '../constants'

const DB_STATUS_FILTERS: ReadonlySet<FilterKey> = new Set([
    'passed',
    'failed',
    'skipped',
    'pending',
])

// Effectively "no cap" for a single status/project slice — large enough that no
// project's tests of one status are expected to exceed it.
const FILTERED_FETCH_LIMIT = 5000

async function fetchFilteredTests(filter: FilterKey, project?: string): Promise<TestResult[]> {
    const params = new URLSearchParams()
    params.set('limit', String(FILTERED_FETCH_LIMIT))
    if (project) {
        params.set('project', project)
    }
    if (DB_STATUS_FILTERS.has(filter)) {
        params.set('status', filter)
    }
    const res = await authGet(`${config.api.baseUrl}/tests?${params.toString()}`)
    if (!res.ok) {
        throw new Error('Failed to load filtered tests')
    }
    const data = await res.json()
    return Array.isArray(data.data) ? data.data : []
}

/**
 * Server-resolved test list for a specific status-bar filter (Passed/Failed/Skipped/
 * Pending/Noted). testsStore.tests is capped at 200 rows without a project selected
 * (5000 with one) and ordered by recency, so a status with matches outside that
 * window would show 0 results in the list while the status-counts badge (an
 * unlimited aggregate) still reports the true count — exactly the bug this hook
 * closes. Not used for filter === 'all', where the already-loaded store list is
 * correct and cheaper.
 */
export function useFilteredTestsByStatus(
    filter: FilterKey,
    project?: string,
    isAuthenticated = true
) {
    const query = useQuery({
        queryKey: ['filtered-tests-by-status', filter, project ?? null],
        queryFn: () => fetchFilteredTests(filter, project),
        enabled: isAuthenticated && filter !== 'all',
    })

    return {
        tests: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
    }
}
