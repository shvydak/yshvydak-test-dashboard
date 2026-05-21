import {useState} from 'react'
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Database,
    HardDrive,
    Paperclip,
    RefreshCw,
} from 'lucide-react'
import {Button} from '@shared/components'
import {SettingsSection} from './SettingsSection'
import {useStorageStats} from '../../hooks'
import {formatBytes} from '@features/tests/utils/formatters'

export function SettingsStorageSection() {
    const [isOpen, setIsOpen] = useState(false)
    const {data: stats, isLoading, error, refetch, isRefetching} = useStorageStats(true)

    const LOW_SPACE_THRESHOLD = 5 * 1024 * 1024 * 1024 // 5 GB
    const LOW_SPACE_PERCENT_THRESHOLD = 10 // 10%
    const isLowSpace =
        stats?.disk &&
        stats.disk.availableSpace > 0 &&
        (stats.disk.availableSpace < LOW_SPACE_THRESHOLD ||
            stats.disk.percentFree < LOW_SPACE_PERCENT_THRESHOLD)

    const handleToggle = () => {
        setIsOpen(!isOpen)
    }

    const handleRefresh = () => {
        refetch()
    }

    const description =
        stats?.disk && stats.disk.totalSpace > 0
            ? `View storage usage (Disk space: ${formatBytes(stats.disk.availableSpace)} free)`
            : 'View storage usage for tests and attachments'

    return (
        <SettingsSection title="Storage Statistics" description={description}>
            <div className="space-y-4">
                {/* Low Space Alert (visible when collapsed) */}
                {isLowSpace && !isOpen && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-danger-200 bg-danger-50/50 p-4 text-sm text-danger-700 dark:border-danger-900/30 dark:bg-danger-950/20 dark:text-danger-400">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-danger-500 dark:text-danger-400 mt-0.5" />
                        <div>
                            <span className="font-semibold block text-base mb-1">
                                Warning: Server is running out of space!
                            </span>
                            Only{' '}
                            <span className="font-bold">
                                {formatBytes(stats.disk.availableSpace)}
                            </span>{' '}
                            ({stats.disk.percentFree}% free) is left on the server disk. Please free
                            up space immediately to prevent test execution failures.
                        </div>
                    </div>
                )}

                <Button variant="secondary" fullWidth onClick={handleToggle}>
                    {isOpen ? (
                        <span className="flex items-center gap-1.5">
                            <ChevronDown className="h-4 w-4" /> Hide Storage Info
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5">
                            <ChevronRight className="h-4 w-4" /> Show Storage Info
                        </span>
                    )}
                </Button>

                {isOpen && (
                    <div className="space-y-4">
                        {isLoading || isRefetching ? (
                            <div className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                Loading storage statistics...
                            </div>
                        ) : error ? (
                            <div className="py-4 text-center text-sm text-danger-600 dark:text-danger-400">
                                Failed to load storage statistics
                            </div>
                        ) : stats ? (
                            <>
                                <div className="space-y-3 rounded-xl border border-gray-200/70 bg-white/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                                    {/* Total Storage */}
                                    <div className="border-b border-gray-200/70 pb-3 dark:border-white/[0.06]">
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-gray-900 dark:text-white">
                                                Total Storage
                                            </span>
                                            <span className="text-lg font-bold tabular-nums text-primary-600 dark:text-primary-400">
                                                {formatBytes(stats.total.size)}
                                            </span>
                                        </div>
                                        {stats.database.totalResults > 0 && (
                                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                Average per test:{' '}
                                                {formatBytes(stats.total.averageSizePerTest)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Server Disk Space */}
                                    {stats.disk && stats.disk.totalSpace > 0 && (
                                        <div className="border-b border-gray-200/70 pb-3 dark:border-white/[0.06] space-y-2">
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between items-center text-sm font-medium text-gray-900 dark:text-white">
                                                    <span className="flex items-center gap-1.5">
                                                        <HardDrive className="h-4 w-4" /> Server
                                                        Disk Space
                                                    </span>
                                                    <span className="tabular-nums font-semibold">
                                                        {formatBytes(stats.disk.availableSpace)}{' '}
                                                        free of {formatBytes(stats.disk.totalSpace)}
                                                    </span>
                                                </div>

                                                {/* Progress bar */}
                                                <div className="h-2 w-full bg-gray-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            isLowSpace
                                                                ? 'bg-danger-500 dark:bg-danger-600'
                                                                : 'bg-primary-500 dark:bg-primary-600'
                                                        }`}
                                                        style={{
                                                            width: `${100 - stats.disk.percentFree}%`,
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                                    <span>{stats.disk.percentFree}% available</span>
                                                    <span>
                                                        {Math.round(100 - stats.disk.percentFree)}%
                                                        used
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Low Space Alert */}
                                            {isLowSpace && (
                                                <div className="mt-2 flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50/50 p-3 text-xs text-danger-700 dark:border-danger-900/30 dark:bg-danger-950/20 dark:text-danger-400">
                                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                                    <div>
                                                        <span className="font-semibold block mb-0.5">
                                                            Warning: Low Disk Space!
                                                        </span>
                                                        Only{' '}
                                                        <span className="font-bold">
                                                            {formatBytes(stats.disk.availableSpace)}
                                                        </span>{' '}
                                                        is left on the server. Please clean up old
                                                        test runs or attachments to prevent test
                                                        execution failures.
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Database Storage */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                <span className="flex items-center gap-1.5">
                                                    <Database className="h-4 w-4" /> Database
                                                </span>
                                            </span>
                                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                                                {formatBytes(stats.database.size)}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                                            <div className="flex justify-between">
                                                <span>Test runs:</span>
                                                <span>
                                                    {stats.database.totalRuns.toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Test results:</span>
                                                <span>
                                                    {stats.database.totalResults.toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Attachment records:</span>
                                                <span>
                                                    {stats.database.totalAttachments.toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Attachments Storage */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                <span className="flex items-center gap-1.5">
                                                    <Paperclip className="h-4 w-4" /> Attachments
                                                </span>
                                            </span>
                                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                                                {formatBytes(stats.attachments.totalSize)}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                                            <div className="flex justify-between">
                                                <span>Total files:</span>
                                                <span>
                                                    {stats.attachments.totalFiles.toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Test directories:</span>
                                                <span>
                                                    {stats.attachments.testDirectories.toLocaleString()}
                                                </span>
                                            </div>

                                            {/* Type Breakdown */}
                                            {stats.attachments.totalFiles > 0 && (
                                                <div className="mt-2 border-t border-gray-200/70 pt-2 dark:border-white/[0.06]">
                                                    <div className="font-medium mb-1">By type:</div>
                                                    {Object.entries(
                                                        stats.attachments.typeBreakdown
                                                    ).map(
                                                        ([type, data]) =>
                                                            data.count > 0 && (
                                                                <div
                                                                    key={type}
                                                                    className="flex justify-between">
                                                                    <span className="capitalize">
                                                                        {type}:
                                                                    </span>
                                                                    <span>
                                                                        {data.count} (
                                                                        {formatBytes(data.size)})
                                                                    </span>
                                                                </div>
                                                            )
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    variant="secondary"
                                    fullWidth
                                    onClick={handleRefresh}
                                    loading={isRefetching}
                                    disabled={isRefetching}>
                                    {isRefetching ? (
                                        'Refreshing...'
                                    ) : (
                                        <span className="flex items-center gap-1.5">
                                            <RefreshCw className="h-4 w-4" /> Refresh Statistics
                                        </span>
                                    )}
                                </Button>
                            </>
                        ) : null}
                    </div>
                )}
            </div>
        </SettingsSection>
    )
}
