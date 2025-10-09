import {useQuery} from '@tanstack/react-query'
import {authFetch} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface TimelineDataPoint {
    date: string
    total: number
    passed: number
    failed: number
    skipped: number
    timedOut: number
}

async function fetchTestTimeline(days: number): Promise<TimelineDataPoint[]> {
    const response = await authFetch(`${config.api.baseUrl}/tests/timeline?days=${days}`)
    if (!response.ok) {
        throw new Error('Failed to fetch test timeline')
    }
    const result = await response.json()
    return result.data || []
}

export function useTestTimeline(days: number = 30) {
    return useQuery({
        queryKey: ['test-timeline', days],
        queryFn: () => fetchTestTimeline(days),
        refetchInterval: false,
        staleTime: 60000,
    })
}
