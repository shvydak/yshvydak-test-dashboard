import {Button} from '@shared/components'
import {config} from '@config/environment.config'
import {useTestsStore} from '@features/tests/store/testsStore'
import {useDashboardActions} from '../../hooks'
import {SettingsSection} from './SettingsSection'

export function SettingsActionsSection() {
    const {discoverTests, isDiscovering, getIsAnyTestRunning} = useTestsStore()

    const {clearingData, clearAllData} = useDashboardActions()
    const isAnyTestRunning = getIsAnyTestRunning()

    return (
        <SettingsSection title="Actions" description="Common tasks and operations">
            <div className="space-y-3">
                <Button
                    variant="primary"
                    fullWidth
                    loading={isDiscovering}
                    disabled={isAnyTestRunning}
                    onClick={discoverTests}>
                    {isDiscovering ? 'Discovering...' : '🔍 Discover Tests'}
                </Button>

                <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => window.open(`${config.api.baseUrl}/health`, '_blank')}>
                    🩺 Check API Health
                </Button>

                <Button
                    variant="danger"
                    fullWidth
                    loading={clearingData}
                    disabled={isAnyTestRunning || clearingData}
                    onClick={clearAllData}>
                    {clearingData ? 'Clearing...' : '🗑️ Clear All Data'}
                </Button>
            </div>
        </SettingsSection>
    )
}
