import {useState} from 'react'
import {Button} from '@shared/components'
import {SettingsSection} from './SettingsSection'
import {useStorageStats} from '../../hooks'
import {formatBytes} from '@features/tests/utils/formatters'

export function SettingsStorageSection() {
    const [isOpen, setIsOpen] = useState(false)
    const {data: stats, isLoading, error, refetch, isRefetching} = useStorageStats(isOpen)

    const handleToggle = () => {
        const newIsOpen = !isOpen
        setIsOpen(newIsOpen)
        if (newIsOpen && !stats) {
            refetch()
        }
    }

    const handleRefresh = () => {
        refetch()
    }

    return (
        <SettingsSection
            title="Storage Statistics"
            description="View storage usage for tests and attachments">
            <div className="space-y-4">
                <Button variant="secondary" fullWidth onClick={handleToggle}>
                    {isOpen ? '▼ Hide Storage Info' : '▶ Show Storage Info'}
                </Button>

                {isOpen && (
                    <div className="space-y-4">
                        {isLoading || isRefetching ? (
                            <div className="text-center py-4 text-gray-600 dark:text-gray-400">
                                Loading storage statistics...
                            </div>
                        ) : error ? (
                            <div className="text-center py-4 text-red-600 dark:text-red-400">
                                Failed to load storage statistics
                            </div>
                        ) : stats ? (
                            <>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                                    {/* Total Storage */}
                                    <div className="pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-gray-900 dark:text-white">
                                                Total Storage
                                            </span>
                                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
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

                                    {/* Database Storage */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                💾 Database
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
                                                📎 Attachments
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
                                                <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
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
                                    {isRefetching ? 'Refreshing...' : '🔄 Refresh Statistics'}
                                </Button>
                            </>
                        ) : null}
                    </div>
                )}
            </div>
        </SettingsSection>
    )
}
