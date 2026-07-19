import {useState, useEffect} from 'react'
import {RefreshCw, ChevronUp, ChevronDown, Minus, Plus} from 'lucide-react'
import {useProjectTabs, ProjectTabConfig} from '@/hooks/useProjectTabs'
import {SettingsSection} from './SettingsSection'

export function SettingsProjectTabsSection() {
    const {tabs, updateTabs, isLoading, isSaving, error, reload} = useProjectTabs()
    const [localTabs, setLocalTabs] = useState<ProjectTabConfig[]>([])

    // Sync local state when tabs load
    useEffect(() => {
        setLocalTabs(tabs)
    }, [tabs])

    const handleDisplayNameChange = (project: string, displayName: string) => {
        setLocalTabs((prev) => prev.map((t) => (t.project === project ? {...t, displayName} : t)))
    }

    const handleDisplayNameBlur = async (project: string) => {
        const tab = localTabs.find((t) => t.project === project)
        if (!tab) return
        const trimmed = tab.displayName.trim()
        if (!trimmed) {
            // Reset to project name if empty
            setLocalTabs((prev) =>
                prev.map((t) => (t.project === project ? {...t, displayName: project} : t))
            )
            return
        }
        const updated = localTabs.map((t) =>
            t.project === project ? {...t, displayName: trimmed} : t
        )
        setLocalTabs(updated)
        await updateTabs(updated)
    }

    const handleVisibleToggle = async (project: string) => {
        const updated = localTabs.map((t) =>
            t.project === project ? {...t, visible: !t.visible} : t
        )
        setLocalTabs(updated)
        await updateTabs(updated)
    }

    const handlePipelineToggle = async (project: string) => {
        const updated = localTabs.map((t) =>
            t.project === project
                ? {
                      ...t,
                      inPipeline: !t.inPipeline,
                      // Turning a step out of the pipeline also clears its stop-on-failure
                      // flag, since it has no meaning outside the pipeline.
                      stopPipelineOnFailure: !t.inPipeline ? t.stopPipelineOnFailure : false,
                  }
                : t
        )
        setLocalTabs(updated)
        await updateTabs(updated)
    }

    const handleWorkersChange = (project: string, value: string) => {
        const workers = value === '' ? undefined : parseInt(value, 10)
        setLocalTabs((prev) => prev.map((t) => (t.project === project ? {...t, workers} : t)))
    }

    const handleWorkersBlur = async (project: string) => {
        const tab = localTabs.find((t) => t.project === project)
        if (!tab) return
        const valid =
            tab.workers !== undefined &&
            Number.isInteger(tab.workers) &&
            tab.workers >= 1 &&
            tab.workers <= 16
        const updated = localTabs.map((t) =>
            t.project === project ? {...t, workers: valid ? tab.workers : undefined} : t
        )
        setLocalTabs(updated)
        await updateTabs(updated)
    }

    const handleWorkersStep = async (project: string, direction: 1 | -1) => {
        const tab = localTabs.find((t) => t.project === project)
        if (!tab) return
        const current = tab.workers ?? (direction === 1 ? 0 : 2)
        const next = Math.min(16, Math.max(1, current + direction))
        const updated = localTabs.map((t) => (t.project === project ? {...t, workers: next} : t))
        setLocalTabs(updated)
        await updateTabs(updated)
    }

    const handleStopOnFailureToggle = async (project: string) => {
        const updated = localTabs.map((t) =>
            t.project === project ? {...t, stopPipelineOnFailure: !t.stopPipelineOnFailure} : t
        )
        setLocalTabs(updated)
        await updateTabs(updated)
    }

    const handleMove = async (project: string, direction: 'up' | 'down') => {
        const index = localTabs.findIndex((t) => t.project === project)
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (index === -1 || targetIndex < 0 || targetIndex >= localTabs.length) return

        const updated = [...localTabs]
        ;[updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]]
        setLocalTabs(updated)
        await updateTabs(updated)
    }

    // Position of each tab within the CI pipeline specifically (not the same as
    // its position in the tab list — hidden/non-pipeline tabs don't get a step).
    const pipelineStepByProject = new Map<string, number>()
    let stepCounter = 0
    for (const tab of localTabs) {
        if (tab.inPipeline) {
            stepCounter += 1
            pipelineStepByProject.set(tab.project, stepCounter)
        }
    }

    const toggleClass = (on: boolean, danger = false) =>
        `relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-30 disabled:pointer-events-none ${
            danger ? 'focus-visible:ring-danger-500/60' : 'focus-visible:ring-primary-500/60'
        } ${
            on
                ? danger
                    ? 'bg-danger-600 dark:bg-danger-500'
                    : 'bg-primary-600 dark:bg-primary-500'
                : 'bg-gray-200 dark:bg-white/10'
        }`

    const toggleKnobClass = (on: boolean) =>
        `inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-soft transition-transform duration-200 ${
            on ? 'translate-x-4' : 'translate-x-1'
        }`

    return (
        <SettingsSection
            title="Project Tabs"
            description="Configure which Playwright projects appear as navigation tabs">
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <button
                        onClick={reload}
                        disabled={isLoading || isSaving}
                        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 disabled:opacity-50">
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        {isLoading ? 'Loading…' : 'Refresh projects'}
                    </button>
                    {isSaving && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Saving…</span>
                    )}
                </div>

                {error && <p className="text-sm text-danger-600 dark:text-danger-400">{error}</p>}

                {localTabs.length === 0 && !isLoading && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No Playwright projects found. Run tests first or check your
                        playwright.config.ts.
                    </p>
                )}

                {localTabs.length > 0 && (
                    <div className="space-y-2">
                        {localTabs.map((tab, index) => {
                            const ciStep = pipelineStepByProject.get(tab.project)
                            return (
                                <div
                                    key={tab.project}
                                    className={`rounded-xl border border-gray-200/70 bg-white/60 px-3.5 py-3 transition-opacity dark:border-white/[0.06] dark:bg-white/[0.02] ${
                                        tab.visible ? '' : 'opacity-60'
                                    }`}>
                                    {/* Top row: identity */}
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex flex-shrink-0 items-center gap-0.5">
                                            <button
                                                type="button"
                                                aria-label={`Move ${tab.project} up`}
                                                onClick={() => handleMove(tab.project, 'up')}
                                                disabled={isSaving || index === 0}
                                                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-200">
                                                <ChevronUp className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`Move ${tab.project} down`}
                                                onClick={() => handleMove(tab.project, 'down')}
                                                disabled={
                                                    isSaving || index === localTabs.length - 1
                                                }
                                                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-200">
                                                <ChevronDown className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <span className="flex-shrink-0 truncate rounded-md border border-gray-200 bg-white px-1.5 py-1 font-mono text-[11px] text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
                                            {tab.project}
                                        </span>
                                        <input
                                            type="text"
                                            value={tab.displayName}
                                            onChange={(e) =>
                                                handleDisplayNameChange(tab.project, e.target.value)
                                            }
                                            onBlur={() => handleDisplayNameBlur(tab.project)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.currentTarget.blur()
                                                }
                                            }}
                                            disabled={isSaving}
                                            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-200 focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/60 dark:text-gray-100 dark:hover:border-white/10 dark:focus:bg-white/[0.05]"
                                        />
                                        <div className="flex flex-shrink-0 items-center gap-1.5">
                                            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                                                Visible
                                            </span>
                                            <button
                                                role="switch"
                                                aria-checked={tab.visible}
                                                onClick={() => handleVisibleToggle(tab.project)}
                                                disabled={isSaving}
                                                className={toggleClass(tab.visible)}>
                                                <span className={toggleKnobClass(tab.visible)} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Bottom row: execution behavior */}
                                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200/70 pt-2.5 dark:border-white/[0.06]">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                Workers
                                            </span>
                                            <span className="inline-flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.05]">
                                                <button
                                                    type="button"
                                                    aria-label={`Decrease workers for ${tab.project}`}
                                                    onClick={() =>
                                                        handleWorkersStep(tab.project, -1)
                                                    }
                                                    disabled={isSaving}
                                                    className="flex h-6 w-5 items-center justify-center text-gray-400 transition-colors hover:text-primary-600 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-500 dark:hover:text-primary-400">
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={16}
                                                    placeholder="Auto"
                                                    aria-label={`Workers for ${tab.project}`}
                                                    value={tab.workers ?? ''}
                                                    onChange={(e) =>
                                                        handleWorkersChange(
                                                            tab.project,
                                                            e.target.value
                                                        )
                                                    }
                                                    onBlur={() => handleWorkersBlur(tab.project)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.currentTarget.blur()
                                                        }
                                                    }}
                                                    disabled={isSaving}
                                                    className="w-9 border-0 bg-transparent text-center text-xs text-gray-900 [appearance:textfield] focus:outline-none dark:text-gray-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                />
                                                <button
                                                    type="button"
                                                    aria-label={`Increase workers for ${tab.project}`}
                                                    onClick={() =>
                                                        handleWorkersStep(tab.project, 1)
                                                    }
                                                    disabled={isSaving}
                                                    className="flex h-6 w-5 items-center justify-center text-gray-400 transition-colors hover:text-primary-600 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-500 dark:hover:text-primary-400">
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                            </span>
                                        </div>

                                        <span className="h-1 w-1 flex-shrink-0 rounded-full bg-gray-300 dark:bg-white/15" />

                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                In CI pipeline
                                            </span>
                                            {ciStep !== undefined && (
                                                <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                                                    Step {ciStep}
                                                </span>
                                            )}
                                            <button
                                                role="switch"
                                                aria-checked={tab.inPipeline}
                                                aria-label={`Include ${tab.project} in CI pipeline`}
                                                onClick={() => handlePipelineToggle(tab.project)}
                                                disabled={isSaving}
                                                className={toggleClass(tab.inPipeline)}>
                                                <span className={toggleKnobClass(tab.inPipeline)} />
                                            </button>
                                        </div>

                                        <span className="h-1 w-1 flex-shrink-0 rounded-full bg-gray-300 dark:bg-white/15" />

                                        <div
                                            className={`flex items-center gap-2 ${!tab.inPipeline ? 'opacity-40' : ''}`}
                                            title={
                                                !tab.inPipeline
                                                    ? 'Enable "In CI pipeline" first'
                                                    : undefined
                                            }>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                Stop on failure
                                            </span>
                                            <button
                                                role="switch"
                                                aria-checked={tab.stopPipelineOnFailure}
                                                aria-label={`Stop the pipeline if ${tab.project} fails`}
                                                onClick={() =>
                                                    handleStopOnFailureToggle(tab.project)
                                                }
                                                disabled={isSaving || !tab.inPipeline}
                                                className={toggleClass(
                                                    tab.stopPipelineOnFailure,
                                                    true
                                                )}>
                                                <span
                                                    className={toggleKnobClass(
                                                        tab.stopPipelineOnFailure
                                                    )}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Changes apply globally for all users. Tab label can be renamed without affecting
                    which project it tracks. Workers overrides the "Maximum Workers" setting for
                    this project only (leave blank to use the default) — applies to Run All, rerun,
                    and CI pipeline/script triggers alike. The ▲▼ order also sets CI pipeline order
                    ("Step N") for tabs with "In CI pipeline" enabled; "Stop on failure" skips the
                    remaining pipeline steps if that step has any failed tests.
                </p>
            </div>
        </SettingsSection>
    )
}
