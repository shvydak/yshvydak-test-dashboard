import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query'
import {authFetch} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface DiskThresholds {
    warningPercent: number
    criticalPercent: number
}

async function fetchDiskThresholds(): Promise<DiskThresholds> {
    const response = await authFetch(`${config.api.baseUrl}/settings/disk-thresholds`)
    if (!response.ok) {
        throw new Error('Failed to fetch disk thresholds')
    }
    const result = await response.json()
    return result.data
}

async function saveDiskThresholds(thresholds: DiskThresholds): Promise<DiskThresholds> {
    const response = await authFetch(`${config.api.baseUrl}/settings/disk-thresholds`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(thresholds),
    })
    if (!response.ok) {
        const result = await response.json()
        throw new Error(result.message || 'Failed to save disk thresholds')
    }
    const result = await response.json()
    return result.data
}

export function useDiskThresholds() {
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: ['disk-thresholds'],
        queryFn: fetchDiskThresholds,
        staleTime: 60000,
    })

    const mutation = useMutation({
        mutationFn: saveDiskThresholds,
        onSuccess: (data) => {
            queryClient.setQueryData(['disk-thresholds'], data)
        },
    })

    return {
        thresholds: query.data,
        isLoading: query.isLoading,
        error: query.error,
        saveThresholds: mutation.mutate,
        isSaving: mutation.isPending,
        saveError: mutation.error,
    }
}
