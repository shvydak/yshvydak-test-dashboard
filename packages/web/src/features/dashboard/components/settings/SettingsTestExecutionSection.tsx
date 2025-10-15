import {usePlaywrightWorkers} from '@/hooks/usePlaywrightWorkers'
import {SettingsSection} from './SettingsSection'

export function SettingsTestExecutionSection() {
    const {workers, setWorkers, resetToDefault} = usePlaywrightWorkers()

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10)
        if (!isNaN(value)) {
            setWorkers(value)
        }
    }

    return (
        <SettingsSection
            title="Test Execution"
            description="Configure test execution behavior">
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
                        onChange={handleChange}
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
        </SettingsSection>
    )
}
