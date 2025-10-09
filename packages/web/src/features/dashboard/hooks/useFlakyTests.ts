import {useQuery} from '@tanstack/react-query'
import {authFetch} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'
import {useState, useEffect} from 'react'

export interface FlakyTest {
    testId: string
    name: string
    filePath: string
    totalRuns: number
    failedRuns: number
    passedRuns: number
    flakyPercentage: number
    history: string[]
    lastRun: string
}

interface UseFlakyTestsOptions {
    days?: number
    threshold?: number
}

async function fetchFlakyTests(days: number, threshold: number): Promise<FlakyTest[]> {
    const response = await authFetch(
        `${config.api.baseUrl}/tests/flaky?days=${days}&threshold=${threshold}`
    )
    if (!response.ok) {
        throw new Error('Failed to fetch flaky tests')
    }
    const result = await response.json()
    return result.data || []
}

export function useFlakyTests(options?: UseFlakyTestsOptions) {
    const [days, setDays] = useState(options?.days || 30)
    const [threshold, setThreshold] = useState(options?.threshold || 10)

    useEffect(() => {
        const savedDays = localStorage.getItem('dashboard_flaky_days')
        const savedThreshold = localStorage.getItem('dashboard_flaky_threshold')

        if (savedDays) setDays(parseInt(savedDays))
        if (savedThreshold) setThreshold(parseInt(savedThreshold))
    }, [])

    const query = useQuery({
        queryKey: ['flaky-tests', days, threshold],
        queryFn: () => fetchFlakyTests(days, threshold),
        refetchInterval: false,
        staleTime: 60000,
    })

    const updateDays = (newDays: number) => {
        setDays(newDays)
        localStorage.setItem('dashboard_flaky_days', newDays.toString())
    }

    const updateThreshold = (newThreshold: number) => {
        setThreshold(newThreshold)
        localStorage.setItem('dashboard_flaky_threshold', newThreshold.toString())
    }

    return {
        ...query,
        days,
        threshold,
        updateDays,
        updateThreshold,
    }
}
