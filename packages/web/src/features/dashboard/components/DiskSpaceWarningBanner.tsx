import {HardDrive} from 'lucide-react'
import {AlertBanner} from '@shared/components/molecules/AlertBanner'
import {formatBytes} from '@features/tests/utils/formatters'
import type {DiskWarningSeverity} from '../hooks/useDiskSpaceWarning'
import type {DiskStats} from '../hooks/useStorageStats'
import type {DiskThresholds} from '../hooks/useDiskThresholds'

interface DiskSpaceWarningBannerProps {
    severity: DiskWarningSeverity
    diskStats: DiskStats
    thresholds: DiskThresholds
    onDismiss: () => void
    onFreeUpSpace: () => void
}

export function DiskSpaceWarningBanner({
    severity,
    diskStats,
    thresholds,
    onDismiss,
    onFreeUpSpace,
}: DiskSpaceWarningBannerProps) {
    const freePercent = 100 - diskStats.usedPercent
    const isCritical = severity === 'critical'

    const threshold = isCritical ? thresholds.criticalPercent : thresholds.warningPercent
    const title = isCritical ? 'Critical: Disk space almost full' : 'Warning: Disk space low'
    const message = `${formatBytes(diskStats.free)} free (${freePercent}%) — threshold is ${threshold}%`

    return (
        <AlertBanner
            severity={isCritical ? 'danger' : 'warning'}
            icon={<HardDrive className="h-4 w-4" />}
            title={title}
            message={message}
            primaryAction={{label: 'Free up space', onClick: onFreeUpSpace}}
            onDismiss={onDismiss}
        />
    )
}
