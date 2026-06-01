import {useEffect, useState} from 'react'
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Database,
    HardDrive,
    Paperclip,
    RefreshCw,
} from 'lucide-react'
import {Button, ConfirmationDialog} from '@shared/components'
import {SettingsSection} from './SettingsSection'
import {useStorageStats, useDiskThresholds} from '../../hooks'
import {useDashboardActions} from '../../hooks'
import {useTestsStore} from '@features/tests/store/testsStore'
import {formatBytes} from '@features/tests/utils/formatters'

const compactInputClass =
    'w-14 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/15 transition-colors dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:focus:border-primary-400/60 disabled:opacity-40'

export function SettingsStorageSection() {
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const {data: stats, isLoading: statsLoading, refetch, isRefetching} = useStorageStats(true)
    const {thresholds, saveThresholds, isSaving, saveError} = useDiskThresholds()
    const {cleaningData, cleanupData} = useDashboardActions()
    const {getIsAnyTestRunning} = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()

    const [warningInput, setWarningInput] = useState('')
    const [criticalInput, setCriticalInput] = useState('')
    const [thresholdsSynced, setThresholdsSynced] = useState(false)
    const [daysToKeep, setDaysToKeep] = useState('30')
    const [runsToKeep, setRunsToKeep] = useState('20')
    // 'strip' frees space but keeps history; 'full' permanently deletes executions.
    const [cleanupMode, setCleanupMode] = useState<'strip' | 'full'>('strip')
    // Pending full-delete action awaiting confirmation (null = dialog closed).
    const [confirmFull, setConfirmFull] = useState<null | {type: 'date' | 'count'}>(null)
    // Which criterion is currently running, so only its button shows the spinner
    // (cleaningData is shared across both rows).
    const [pendingAction, setPendingAction] = useState<'date' | 'count' | null>(null)

    // Clear the in-flight marker once the shared cleanup flag settles.
    useEffect(() => {
        if (!cleaningData) setPendingAction(null)
    }, [cleaningData])

    if (thresholds && !thresholdsSynced) {
        setWarningInput(String(thresholds.warningPercent))
        setCriticalInput(String(thresholds.criticalPercent))
        setThresholdsSynced(true)
    }

    const handleSaveThresholds = () => {
        const warning = parseInt(warningInput)
        const critical = parseInt(criticalInput)
        if (isNaN(warning) || isNaN(critical)) return
        saveThresholds({warningPercent: warning, criticalPercent: critical})
    }

    const daysValid = !!daysToKeep && parseInt(daysToKeep) >= 1
    const runsValid = !!runsToKeep && parseInt(runsToKeep) >= 1

    // Convert "older than N days" into a cutoff at the START of the day N days ago,
    // so the whole Nth day is kept (avoids the time-of-day off-by-one where a run
    // made earlier on day N would otherwise count as older than the criterion).
    const dateCutoff = () => {
        const date = new Date()
        date.setDate(date.getDate() - parseInt(daysToKeep))
        date.setHours(0, 0, 0, 0)
        return date.toISOString()
    }

    // Single entry point for both criteria. In 'full' mode we route through the
    // confirmation dialog; in 'strip' mode we run immediately.
    const runAction = (type: 'date' | 'count') => {
        if (type === 'date' ? !daysValid : !runsValid) return
        if (cleanupMode === 'full') {
            setConfirmFull({type})
            return
        }
        setPendingAction(type)
        if (type === 'date') {
            cleanupData('date', dateCutoff(), 'strip')
        } else {
            cleanupData('count', parseInt(runsToKeep), 'strip')
        }
    }

    const handleConfirmFull = () => {
        if (!confirmFull) return
        setPendingAction(confirmFull.type)
        if (confirmFull.type === 'date') {
            if (daysValid) cleanupData('date', dateCutoff(), 'full')
        } else {
            if (runsValid) cleanupData('count', parseInt(runsToKeep), 'full')
        }
        setConfirmFull(null)
    }

    const disk = stats?.disk
    const freePercent = disk ? 100 - disk.usedPercent : null

    const dashboardPercent =
        stats?.total.size && disk
            ? Math.min((stats.total.size / disk.total) * 100, disk.usedPercent)
            : 0
    const otherUsedPercent = disk ? Math.max(0, disk.usedPercent - dashboardPercent) : 0

    const diskStatus =
        !disk || !thresholds
            ? 'unknown'
            : freePercent! <= thresholds.criticalPercent
              ? 'critical'
              : freePercent! <= thresholds.warningPercent
                ? 'warning'
                : 'healthy'

    const statusConfig = {
        healthy: {
            dot: 'bg-success-500',
            badge: 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400',
            label: 'Healthy',
        },
        warning: {
            dot: 'bg-warning-500',
            badge: 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400',
            label: 'Low',
        },
        critical: {
            dot: 'bg-danger-500',
            badge: 'bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-400',
            label: 'Critical',
        },
        unknown: {
            dot: 'bg-gray-400',
            badge: 'bg-gray-100 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400',
            label: '—',
        },
    }[diskStatus]

    const barColor =
        !disk || disk.usedPercent < 80
            ? 'bg-success-500'
            : disk.usedPercent < 95
              ? 'bg-warning-500'
              : 'bg-danger-500'

    return (
        <SettingsSection title="Storage" description="Disk space, usage details and cleanup">
            <div className="space-y-5">
                {/* ── DISK SPACE ─────────────────────────────── */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                Disk Space
                            </span>
                        </div>
                        {!statsLoading && (
                            <span
                                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusConfig.badge}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
                                {statusConfig.label}
                            </span>
                        )}
                    </div>

                    {statsLoading ? (
                        <div className="space-y-2">
                            <div className="h-7 w-32 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.05]" />
                            <div className="h-2 w-full animate-pulse rounded-full bg-gray-100 dark:bg-white/[0.05]" />
                            <div className="h-4 w-48 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.05]" />
                        </div>
                    ) : disk ? (
                        <>
                            <div className="flex items-baseline justify-between mb-2.5">
                                <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                                    {formatBytes(disk.free)}
                                    <span className="ml-1.5 text-sm font-medium text-gray-400 dark:text-gray-500">
                                        free
                                    </span>
                                </span>
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                    of {formatBytes(disk.total)}
                                </span>
                            </div>
                            <div
                                className="w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]"
                                style={{height: '8px'}}>
                                <div className="flex h-full">
                                    {dashboardPercent > 0 && (
                                        <div
                                            className="h-full bg-primary-500 transition-all duration-500"
                                            style={{width: `${dashboardPercent}%`}}
                                        />
                                    )}
                                    {otherUsedPercent > 0 && (
                                        <div
                                            className={`h-full transition-all duration-500 ${barColor}`}
                                            style={{width: `${otherUsedPercent}%`}}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="mt-1.5 flex justify-between text-xs text-gray-400 dark:text-gray-500">
                                <span>{formatBytes(disk.used)} used</span>
                                <span>{disk.usedPercent}%</span>
                            </div>
                            {dashboardPercent > 0 && (
                                <div className="mt-1.5 flex gap-3 text-xs text-gray-400 dark:text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary-500" />
                                        Dashboard {formatBytes(stats!.total.size)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span
                                            className={`h-2 w-2 flex-shrink-0 rounded-full ${barColor}`}
                                        />
                                        Other {formatBytes(disk.used - stats!.total.size)}
                                    </span>
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Disk info unavailable
                        </p>
                    )}
                </div>

                {/* ── STORAGE DETAILS (collapsible) ────────── */}
                <div className="border-t border-gray-200/70 pt-4 dark:border-white/[0.06]">
                    <button
                        onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                        className="flex w-full items-center justify-between text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                        <span>Storage Details</span>
                        {isDetailsOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                        )}
                    </button>

                    {isDetailsOpen && (
                        <div className="mt-3 space-y-3 text-sm">
                            {statsLoading || isRefetching ? (
                                <div className="py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                                    Loading…
                                </div>
                            ) : stats ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">
                                            Total (DB + Attachments)
                                        </span>
                                        <span className="font-bold tabular-nums text-primary-600 dark:text-primary-400">
                                            {formatBytes(stats.total.size)}
                                        </span>
                                    </div>
                                    {stats.database.totalResults > 0 && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500">
                                            {formatBytes(stats.total.averageSizePerTest)} avg per
                                            test
                                        </p>
                                    )}

                                    <div className="space-y-2">
                                        {/* Database card */}
                                        <div className="rounded-xl bg-gray-50/80 p-3 dark:bg-white/[0.03]">
                                            <div className="mb-2 flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
                                                    <Database className="h-3.5 w-3.5 text-gray-400" />
                                                    Database
                                                </span>
                                                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                                                    {formatBytes(stats.database.size)}
                                                </span>
                                            </div>
                                            <div className="space-y-1 pl-5 text-xs text-gray-400 dark:text-gray-500">
                                                <div className="flex justify-between">
                                                    <span>Runs</span>
                                                    <span>
                                                        {stats.database.totalRuns.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Results</span>
                                                    <span>
                                                        {stats.database.totalResults.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Attachments</span>
                                                    <span>
                                                        {stats.database.totalAttachments.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Attachments card */}
                                        <div className="rounded-xl bg-gray-50/80 p-3 dark:bg-white/[0.03]">
                                            <div className="mb-2 flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
                                                    <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                                                    Attachments
                                                </span>
                                                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                                                    {formatBytes(stats.attachments.totalSize)}
                                                </span>
                                            </div>
                                            <div className="space-y-1 pl-5 text-xs text-gray-400 dark:text-gray-500">
                                                <div className="flex justify-between">
                                                    <span>Files</span>
                                                    <span>
                                                        {stats.attachments.totalFiles.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Directories</span>
                                                    <span>
                                                        {stats.attachments.testDirectories.toLocaleString()}
                                                    </span>
                                                </div>
                                                {stats.attachments.totalFiles > 0 && (
                                                    <div className="mt-1.5 space-y-1 border-t border-gray-200/60 pt-1.5 dark:border-white/[0.05]">
                                                        {Object.entries(
                                                            stats.attachments.typeBreakdown
                                                        ).map(
                                                            ([type, data]) =>
                                                                data.count > 0 && (
                                                                    <div
                                                                        key={type}
                                                                        className="flex justify-between">
                                                                        <span className="capitalize">
                                                                            {type}
                                                                        </span>
                                                                        <span>
                                                                            {data.count} (
                                                                            {formatBytes(data.size)}
                                                                            )
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
                                        size="sm"
                                        fullWidth
                                        onClick={() => refetch()}
                                        loading={isRefetching}
                                        disabled={isRefetching}>
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        Refresh
                                    </Button>
                                </>
                            ) : null}
                        </div>
                    )}
                </div>

                {/* ── ALERTS ────────────────────────────────── */}
                <div className="border-t border-gray-200/70 pt-4 dark:border-white/[0.06]">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Alerts
                    </p>
                    <p className="mb-3.5 text-xs text-gray-500 dark:text-gray-400">
                        Show banner when free space drops below:
                    </p>

                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-2">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-warning-500" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                Warning
                            </span>
                        </div>
                        <input
                            type="number"
                            min="1"
                            max="99"
                            value={warningInput}
                            onChange={(e) => setWarningInput(e.target.value)}
                            className={compactInputClass}
                        />
                        <span className="w-10 text-xs text-gray-400 dark:text-gray-500">
                            % free
                        </span>

                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-danger-500" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                Critical
                            </span>
                        </div>
                        <input
                            type="number"
                            min="1"
                            max="99"
                            value={criticalInput}
                            onChange={(e) => setCriticalInput(e.target.value)}
                            className={compactInputClass}
                        />
                        <span className="w-10 text-xs text-gray-400 dark:text-gray-500">
                            % free
                        </span>

                        <div>
                            {saveError && (
                                <p className="text-xs text-danger-600 dark:text-danger-400">
                                    {saveError instanceof Error
                                        ? saveError.message
                                        : 'Failed to save thresholds'}
                                </p>
                            )}
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSaveThresholds}
                            loading={isSaving}
                            disabled={isSaving}>
                            Save
                        </Button>
                        <span className="w-10" />
                    </div>
                </div>

                {/* ── CLEAN UP ──────────────────────────────── */}
                <div className="border-t border-gray-200/70 pt-4 dark:border-white/[0.06]">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Clean Up
                    </p>
                    {/* Mode toggle: 'strip' keeps history, 'full' deletes executions */}
                    <div className="mb-3 inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-white/[0.05]">
                        <button
                            onClick={() => setCleanupMode('strip')}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                cleanupMode === 'strip'
                                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/[0.12] dark:text-white'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}>
                            Free space
                        </button>
                        <button
                            onClick={() => setCleanupMode('full')}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                cleanupMode === 'full'
                                    ? 'bg-danger-500 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-danger-600 dark:text-gray-400 dark:hover:text-danger-400'
                            }`}>
                            Delete permanently
                        </button>
                    </div>

                    <p
                        className={`mb-3.5 flex items-start gap-1.5 text-xs ${
                            cleanupMode === 'full'
                                ? 'font-medium text-danger-600 dark:text-danger-400'
                                : 'text-gray-500 dark:text-gray-400'
                        }`}>
                        {cleanupMode === 'full' && (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span>
                            {cleanupMode === 'strip'
                                ? 'Frees disk space by deleting attachments (videos, traces, screenshots). Test history and the timeline are kept.'
                                : 'Permanently deletes the matching executions, including their history. This shrinks the timeline and cannot be undone.'}
                        </span>
                    </p>

                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 gap-y-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                            {cleanupMode === 'strip'
                                ? 'Remove attachments older than'
                                : 'Delete runs older than'}
                        </span>
                        <input
                            type="number"
                            min="1"
                            value={daysToKeep}
                            onChange={(e) => setDaysToKeep(e.target.value)}
                            disabled={isAnyTestRunning || cleaningData}
                            className={compactInputClass}
                        />
                        <span className="w-14 text-right text-xs text-gray-400 dark:text-gray-500">
                            days
                        </span>
                        <Button
                            variant={cleanupMode === 'strip' ? 'secondary' : 'danger'}
                            size="sm"
                            loading={cleaningData && pendingAction === 'date'}
                            disabled={isAnyTestRunning || cleaningData || !daysValid}
                            onClick={() => runAction('date')}>
                            {cleanupMode === 'strip' ? 'Free space' : 'Delete'}
                        </Button>

                        <span className="text-sm text-gray-700 dark:text-gray-300">
                            {cleanupMode === 'strip'
                                ? 'Keep attachments for latest'
                                : 'Keep only latest'}
                        </span>
                        <input
                            type="number"
                            min="1"
                            value={runsToKeep}
                            onChange={(e) => setRunsToKeep(e.target.value)}
                            disabled={isAnyTestRunning || cleaningData}
                            className={compactInputClass}
                        />
                        <span className="w-14 text-right text-xs text-gray-400 dark:text-gray-500">
                            runs/test
                        </span>
                        <Button
                            variant={cleanupMode === 'strip' ? 'secondary' : 'danger'}
                            size="sm"
                            loading={cleaningData && pendingAction === 'count'}
                            disabled={isAnyTestRunning || cleaningData || !runsValid}
                            onClick={() => runAction('count')}>
                            {cleanupMode === 'strip' ? 'Free space' : 'Prune'}
                        </Button>
                    </div>
                </div>
            </div>

            <ConfirmationDialog
                isOpen={confirmFull !== null}
                title="Delete permanently?"
                description={
                    confirmFull?.type === 'date'
                        ? `This permanently deletes all executions older than ${daysToKeep} days, including their history. The timeline will shrink for that period. This cannot be undone.`
                        : `This permanently deletes all but the latest ${runsToKeep} runs per test, including their history. The timeline will shrink. This cannot be undone.`
                }
                confirmText="Delete permanently"
                cancelText="Cancel"
                variant="danger"
                isLoading={cleaningData}
                onConfirm={handleConfirmFull}
                onCancel={() => setConfirmFull(null)}
            />
        </SettingsSection>
    )
}
