import {Search, HeartPulse, Trash2} from 'lucide-react'
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
                    {isDiscovering ? (
                        'Discovering...'
                    ) : (
                        <span className="flex items-center gap-1.5">
                            <Search className="h-4 w-4" /> Discover Tests
                        </span>
                    )}
                </Button>

                <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => window.open(`${config.api.baseUrl}/health`, '_blank')}>
                    <span className="flex items-center gap-1.5">
                        <HeartPulse className="h-4 w-4" /> Check API Health
                    </span>
                </Button>

                <Button
                    variant="danger"
                    fullWidth
                    loading={clearingData}
                    disabled={isAnyTestRunning || clearingData}
                    onClick={clearAllData}>
                    {clearingData ? (
                        'Clearing...'
                    ) : (
                        <span className="flex items-center gap-1.5">
                            <Trash2 className="h-4 w-4" /> Clear All Data
                        </span>
                    )}
                </Button>
            </div>
        </SettingsSection>
    )
}
