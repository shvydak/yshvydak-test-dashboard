import {useState, useEffect} from 'react'
import {RefreshCw} from 'lucide-react'
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

    const compactInputClass =
        'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 ' +
        'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500/60 ' +
        'dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-100 w-40'

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
                        {/* Header row */}
                        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-1">
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                Project
                            </span>
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 w-40">
                                Tab label
                            </span>
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                Visible
                            </span>
                        </div>

                        {localTabs.map((tab) => (
                            <div
                                key={tab.project}
                                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate font-mono text-xs">
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
                                    className={compactInputClass}
                                    disabled={isSaving}
                                />
                                <button
                                    role="switch"
                                    aria-checked={tab.visible}
                                    onClick={() => handleVisibleToggle(tab.project)}
                                    disabled={isSaving}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-50 ${
                                        tab.visible
                                            ? 'bg-primary-600 dark:bg-primary-500'
                                            : 'bg-gray-200 dark:bg-white/10'
                                    }`}>
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-soft transition-transform duration-200 ${
                                            tab.visible ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Changes apply globally for all users. Tab label can be renamed without affecting
                    which project it tracks.
                </p>
            </div>
        </SettingsSection>
    )
}
