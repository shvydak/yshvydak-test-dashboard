import {usePlaywrightWorkers} from '@/hooks/usePlaywrightWorkers'
import {useAutoDiscoverSetting} from '@/hooks/useAutoDiscoverSetting'
import {usePlaywrightProject} from '@/hooks/usePlaywrightProject'
import {useCIAutoRun} from '@/hooks/useCIAutoRun'
import {SettingsSection} from './SettingsSection'

const DURATION_OPTIONS = [
    {label: '1h', hours: 1},
    {label: '2h', hours: 2},
    {label: '3h', hours: 3},
    {label: '8h', hours: 8},
]

function formatResumeTime(resumeAt: string): string {
    const date = new Date(resumeAt)
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
}

export function SettingsTestExecutionSection() {
    const {workers, setWorkers, resetToDefault} = usePlaywrightWorkers()
    const {enabled: autoDiscover, toggle: toggleAutoDiscover} = useAutoDiscoverSetting()
    const {
        selectedProject,
        setSelectedProject,
        availableProjects,
        isLoadingProjects,
        isSavingProject,
        projectError,
        reloadProjects,
    } = usePlaywrightProject()
    const {pause, isSaving: isSavingPause, pauseFor, resume} = useCIAutoRun()

    const isPaused = pause?.paused ?? false
    const resumeAt = pause?.resumeAt ?? null

    const handleWorkersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10)
        if (!isNaN(value)) setWorkers(value)
    }

    const handleProjectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        await setSelectedProject(e.target.value)
    }

    const toggleClass = (active: boolean) =>
        `relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
            active ? 'bg-primary-600 dark:bg-primary-500' : 'bg-gray-200 dark:bg-white/10'
        }`

    const toggleKnobClass = (active: boolean) =>
        `inline-block h-4 w-4 transform rounded-full bg-white shadow-soft transition-transform duration-200 ${
            active ? 'translate-x-6' : 'translate-x-1'
        }`

    return (
        <SettingsSection title="Test Execution" description="Configure test execution behavior">
            <div className="space-y-4">
                {/* Maximum Workers */}
                <div>
                    <label
                        htmlFor="max-workers"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Maximum Workers
                    </label>
                    <div className="flex items-center gap-4">
                        <input
                            id="max-workers"
                            type="number"
                            min={1}
                            max={16}
                            value={workers}
                            onChange={handleWorkersChange}
                            className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 tabular-nums transition-all
                                     focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500/60
                                     dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-100"
                        />
                        <button
                            onClick={resetToDefault}
                            className="text-sm font-medium text-gray-500 transition-colors hover:text-primary-600
                                     dark:text-gray-400 dark:hover:text-primary-400">
                            Reset to default (2)
                        </button>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Limit concurrent test execution (1-16 workers)
                    </p>
                </div>

                {/* Manual run defaults — only affect the dashboard's own Run All / rerun buttons */}
                <div className="rounded-2xl border border-gray-200/70 bg-gray-50/50 px-4 py-3 space-y-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Manual Run Defaults
                    </p>

                    {/* Default project for Run All */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label
                                htmlFor="playwright-project"
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Project
                            </label>
                            <button
                                onClick={reloadProjects}
                                disabled={isLoadingProjects || isSavingProject}
                                className="text-xs font-medium text-gray-500 transition-colors hover:text-primary-600
                                         dark:text-gray-400 dark:hover:text-primary-400 disabled:opacity-50">
                                {isLoadingProjects ? 'Loading…' : 'Refresh'}
                            </button>
                        </div>
                        <select
                            id="playwright-project"
                            value={selectedProject}
                            onChange={(e) => {
                                void handleProjectChange(e)
                            }}
                            disabled={isLoadingProjects || isSavingProject}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 transition-all
                                     focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500/60
                                     dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-100
                                     disabled:opacity-50">
                            <option value="">All Projects</option>
                            {availableProjects.map((project) => (
                                <option key={project} value={project}>
                                    {project}
                                </option>
                            ))}
                        </select>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            {selectedProject
                                ? `Dashboard's Run All button will use "${selectedProject}" when no project tab is selected.`
                                : "Dashboard's Run All button will run all projects when no project tab is selected."}{' '}
                            The CI pipeline always uses the steps configured above under Project
                            Tabs.
                        </p>
                        {projectError && (
                            <p className="mt-2 text-sm text-danger-600 dark:text-danger-400">
                                {projectError}
                            </p>
                        )}
                    </div>

                    {/* Auto-discover */}
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Auto-discover before run
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Discover new tests automatically before each dashboard Run All
                            </p>
                        </div>
                        <button
                            role="switch"
                            aria-checked={autoDiscover}
                            onClick={toggleAutoDiscover}
                            className={toggleClass(autoDiscover)}>
                            <span className={toggleKnobClass(autoDiscover)} />
                        </button>
                    </div>
                </div>

                {/* CI pipeline controls — apply to trigger-test-run.sh / the CI pipeline as a whole */}
                <div className="rounded-2xl border border-gray-200/70 bg-gray-50/50 px-4 py-3 space-y-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        CI Pipeline
                    </p>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Pause CI auto-run
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {isPaused && resumeAt
                                    ? `Active · resumes at ${formatResumeTime(resumeAt)}`
                                    : isPaused
                                      ? 'Active · no auto-resume'
                                      : 'Block trigger-test-run.sh from starting the pipeline'}
                            </p>
                        </div>
                        <button
                            role="switch"
                            aria-checked={isPaused}
                            disabled={isSavingPause}
                            onClick={() => (isPaused ? resume() : pauseFor(3))}
                            className={toggleClass(isPaused) + ' disabled:opacity-50'}>
                            <span className={toggleKnobClass(isPaused)} />
                        </button>
                    </div>

                    {/* Duration picker — visible when about to pause or already paused */}
                    {isPaused && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                Change duration:
                            </span>
                            <div className="flex gap-1.5">
                                {DURATION_OPTIONS.map(({label, hours}) => (
                                    <button
                                        key={hours}
                                        disabled={isSavingPause}
                                        onClick={() => pauseFor(hours)}
                                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-primary-400 hover:text-primary-600 disabled:opacity-50
                                                 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-primary-400 dark:hover:text-primary-400">
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Which projects run, in what order, and whether a failure stops the chain is
                        configured above under Project Tabs.
                    </p>
                </div>
            </div>
        </SettingsSection>
    )
}
