import {useQuery} from '@tanstack/react-query'
import {authFetch} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface StorageStats {
    database: {
        size: number
        totalRuns: number
        totalResults: number
        totalAttachments: number
    }
    attachments: {
        totalSize: number
        totalFiles: number
        testDirectories: number
        typeBreakdown: {
            video: {count: number; size: number}
            screenshot: {count: number; size: number}
            trace: {count: number; size: number}
            log: {count: number; size: number}
            other: {count: number; size: number}
        }
    }
    total: {
        size: number
        averageSizePerTest: number
    }
}

async function fetchStorageStats(): Promise<StorageStats> {
    const response = await authFetch(`${config.api.baseUrl}/storage/stats`)
    if (!response.ok) {
        throw new Error('Failed to fetch storage stats')
    }
    const result = await response.json()
    return result.data
}

export function useStorageStats(enabled = true) {
    return useQuery({
        queryKey: ['storage-stats'],
        queryFn: fetchStorageStats,
        enabled,
        staleTime: 30000, // Consider data stale after 30 seconds
    })
}
