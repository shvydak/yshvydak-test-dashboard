import {useState} from 'react'
import {Button, Input} from '@shared/components'
import {useTestsStore} from '@features/tests/store/testsStore'
import {useDashboardActions} from '../../hooks'
import {SettingsSection} from './SettingsSection'

export function SettingsDataRetentionSection() {
    const {getIsAnyTestRunning} = useTestsStore()
    const {cleaningData, cleanupData} = useDashboardActions()
    const isAnyTestRunning = getIsAnyTestRunning()

    const [daysToKeep, setDaysToKeep] = useState('30')
    const [runsToKeep, setRunsToKeep] = useState('20')

    const handleDateCleanup = () => {
        if (!daysToKeep || isNaN(parseInt(daysToKeep))) return
        const date = new Date()
        date.setDate(date.getDate() - parseInt(daysToKeep))
        cleanupData('date', date.toISOString())
    }

    const handleCountCleanup = () => {
        if (!runsToKeep || isNaN(parseInt(runsToKeep))) return
        cleanupData('count', parseInt(runsToKeep))
    }

    return (
        <SettingsSection
            title="Data Retention"
            description="Manage historical data to save storage space">
            <div className="space-y-4">
                {/* Option A: Date-based cleanup */}
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Delete data older than
                        </label>
                        <div className="relative">
                            <Input
                                type="number"
                                min="1"
                                value={daysToKeep}
                                onChange={(e) => setDaysToKeep(e.target.value)}
                                placeholder="30"
                            />
                            <span className="absolute right-3 top-2.5 text-sm text-gray-500">
                                days
                            </span>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        loading={cleaningData}
                        disabled={isAnyTestRunning || cleaningData}
                        onClick={handleDateCleanup}>
                        Delete
                    </Button>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 my-3"></div>

                {/* Option B: Count-based cleanup */}
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Keep only the latest
                        </label>
                        <div className="relative">
                            <Input
                                type="number"
                                min="1"
                                value={runsToKeep}
                                onChange={(e) => setRunsToKeep(e.target.value)}
                                placeholder="20"
                            />
                            <span className="absolute right-3 top-2.5 text-sm text-gray-500">
                                runs per test
                            </span>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        loading={cleaningData}
                        disabled={isAnyTestRunning || cleaningData}
                        onClick={handleCountCleanup}>
                        Prune
                    </Button>
                </div>
            </div>
        </SettingsSection>
    )
}
