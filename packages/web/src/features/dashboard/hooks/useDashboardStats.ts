import {useQuery} from '@tanstack/react-query'
import {authFetch} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface DashboardStats {
    totalTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    successRate: number
    totalRuns: number
    recentRuns: any[]
}

async function fetchDashboardStats(): Promise<DashboardStats> {
    const response = await authFetch(`${config.api.baseUrl}/runs/stats`)
    if (!response.ok) {
        throw new Error('Failed to fetch dashboard stats')
    }
    const result = await response.json()
    return result.data
}

export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: fetchDashboardStats,
        refetchInterval: 30000,
    })
}
