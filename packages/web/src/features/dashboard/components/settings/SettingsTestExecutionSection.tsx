import {usePlaywrightWorkers} from '@/hooks/usePlaywrightWorkers'
import {useAutoDiscoverSetting} from '@/hooks/useAutoDiscoverSetting'
import {usePlaywrightProject} from '@/hooks/usePlaywrightProject'
import {SettingsSection} from './SettingsSection'

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

    const handleWorkersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10)
        if (!isNaN(value)) {
            setWorkers(value)
        }
    }

    const handleProjectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        await setSelectedProject(e.target.value)
    }

    return (
        <SettingsSection title="Test Execution" description="Configure test execution behavior">
            <div className="space-y-4">
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

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label
                            htmlFor="playwright-project"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Playwright Project
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
                            ? `All test runs will use "${selectedProject}" for every user`
                            : 'All projects defined in playwright.config.ts will run'}
                    </p>
                    {projectError && (
                        <p className="mt-2 text-sm text-danger-600 dark:text-danger-400">
                            {projectError}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200/70 bg-white/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Auto-discover before run
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Discover new tests automatically before each run
                        </p>
                    </div>
                    <button
                        role="switch"
                        aria-checked={autoDiscover}
                        onClick={toggleAutoDiscover}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
                            autoDiscover
                                ? 'bg-primary-600 dark:bg-primary-500'
                                : 'bg-gray-200 dark:bg-white/10'
                        }`}>
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-soft transition-transform duration-200 ${
                                autoDiscover ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            </div>
        </SettingsSection>
    )
}
