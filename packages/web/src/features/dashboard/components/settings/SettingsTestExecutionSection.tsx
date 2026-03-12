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
                            className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                                     focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                        />
                        <button
                            onClick={resetToDefault}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900
                                     dark:hover:text-gray-200 transition-colors">
                            Reset to default (2)
                        </button>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
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
                            className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600
                                     dark:hover:text-blue-400 transition-colors disabled:opacity-50">
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
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                                 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent
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
                        <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                            {projectError}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between">
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
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                            autoDiscover ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                        }`}>
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                autoDiscover ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            </div>
        </SettingsSection>
    )
}
