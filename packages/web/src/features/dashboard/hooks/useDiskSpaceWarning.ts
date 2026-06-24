import {useState, useCallback, useMemo} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useStorageStats, type DiskStats} from './useStorageStats'
import {useDiskThresholds, type DiskThresholds} from './useDiskThresholds'

export type DiskWarningSeverity = 'warning' | 'critical' | null

export interface UseDiskSpaceWarningReturn {
    severity: DiskWarningSeverity
    diskStats: DiskStats | null
    thresholds: DiskThresholds | undefined
    isDismissed: boolean
    dismiss: () => void
    triggerCheck: () => void
}

export function useDiskSpaceWarning(isAuthenticated = true): UseDiskSpaceWarningReturn {
    const [isDismissed, setIsDismissed] = useState(false)
    const queryClient = useQueryClient()

    const {data: storageStats} = useStorageStats(isAuthenticated)
    const {thresholds} = useDiskThresholds(isAuthenticated)

    const triggerCheck = useCallback(() => {
        setIsDismissed(false)
        queryClient.invalidateQueries({queryKey: ['storage-stats']})
    }, [queryClient])

    const severity = useMemo((): DiskWarningSeverity => {
        if (!storageStats?.disk || !thresholds) return null
        const freePercent = 100 - storageStats.disk.usedPercent
        if (freePercent <= thresholds.criticalPercent) return 'critical'
        if (freePercent <= thresholds.warningPercent) return 'warning'
        return null
    }, [storageStats, thresholds])

    return {
        severity,
        diskStats: storageStats?.disk ?? null,
        thresholds,
        isDismissed,
        dismiss: () => setIsDismissed(true),
        triggerCheck,
    }
}
