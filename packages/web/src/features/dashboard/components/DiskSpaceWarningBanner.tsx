import {X, HardDrive, AlertTriangle} from 'lucide-react'
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

    const bannerClass = isCritical
        ? 'bg-danger-50 border-danger-200 dark:bg-danger-500/10 dark:border-danger-400/20'
        : 'bg-warning-50 border-warning-200 dark:bg-warning-500/10 dark:border-warning-400/20'

    const iconClass = isCritical
        ? 'text-danger-600 dark:text-danger-400'
        : 'text-warning-600 dark:text-warning-400'

    const titleClass = isCritical
        ? 'text-danger-800 dark:text-danger-200'
        : 'text-warning-800 dark:text-warning-200'

    const textClass = isCritical
        ? 'text-danger-700 dark:text-danger-300'
        : 'text-warning-700 dark:text-warning-300'

    const threshold = isCritical ? thresholds.criticalPercent : thresholds.warningPercent
    const title = isCritical ? 'Critical: Disk space almost full' : 'Warning: Disk space low'
    const message = `${formatBytes(diskStats.free)} free (${freePercent}%) — threshold is ${threshold}%`

    return (
        <div
            className={`shrink-0 border-b px-3 py-2.5 md:px-4 md:py-3 ${bannerClass}`}
            role="alert">
            <div className="container mx-auto flex items-center gap-3">
                <div className={`flex-shrink-0 ${iconClass}`}>
                    <AlertTriangle className="h-4 w-4" />
                </div>

                <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <HardDrive className={`h-3.5 w-3.5 flex-shrink-0 ${iconClass}`} />
                        <span className={`text-sm font-semibold ${titleClass}`}>{title}</span>
                    </div>
                    <span className={`text-sm ${textClass}`}>{message}</span>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                        onClick={onFreeUpSpace}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                            isCritical
                                ? 'bg-danger-100 text-danger-700 hover:bg-danger-200 dark:bg-danger-500/20 dark:text-danger-300 dark:hover:bg-danger-500/30'
                                : 'bg-warning-100 text-warning-700 hover:bg-warning-200 dark:bg-warning-500/20 dark:text-warning-300 dark:hover:bg-warning-500/30'
                        }`}>
                        Free up space
                    </button>
                    <button
                        onClick={onDismiss}
                        className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
                            isCritical
                                ? 'text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-500/20'
                                : 'text-warning-500 hover:bg-warning-100 dark:hover:bg-warning-500/20'
                        }`}
                        aria-label="Dismiss">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    )
}
