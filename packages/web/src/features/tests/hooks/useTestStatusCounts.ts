import {useQuery} from '@tanstack/react-query'
import {authGet} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface TestStatusCounts {
    total: number
    passed: number
    failed: number
    skipped: number
    pending: number
    noted: number
}

const EMPTY_COUNTS: TestStatusCounts = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    noted: 0,
}

async function fetchTestStatusCounts(project?: string): Promise<TestStatusCounts> {
    const params = new URLSearchParams()
    if (project) {
        params.set('project', project)
    }
    const res = await authGet(`${config.api.baseUrl}/tests/status-counts?${params.toString()}`)
    if (!res.ok) {
        throw new Error('Failed to load test status counts')
    }
    const data = await res.json()
    return data.data ?? EMPTY_COUNTS
}

/**
 * Total/passed/failed/skipped/pending/noted counts, computed server-side over the
 * latest row per test_id — unlimited, unlike the paginated test list. Powers the
 * filter-bar badges so they always reflect the true totals, not just the page the
 * list happens to have fetched (getAllTests() caps at 200 rows with no project,
 * 5000 with one — see testsStore.ts).
 */
export function useTestStatusCounts(project?: string, isAuthenticated = true) {
    const query = useQuery({
        queryKey: ['test-status-counts', project ?? null],
        queryFn: () => fetchTestStatusCounts(project),
        enabled: isAuthenticated,
    })

    return {
        counts: query.data ?? EMPTY_COUNTS,
        isLoading: query.isLoading,
        error: query.error,
    }
}
