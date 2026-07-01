import {Search, HeartPulse, Trash2, ChevronDown} from 'lucide-react'
import {useRef, useState} from 'react'
import {Button} from '@shared/components'
import {config} from '@config/environment.config'
import {useTestsStore} from '@features/tests/store/testsStore'
import {useClickOutside} from '@/hooks/useClickOutside'
import {useDashboardActions} from '../../hooks'
import {SettingsSection} from './SettingsSection'

export interface SettingsActionsSectionProps {
    activeProject?: string
}

export function SettingsActionsSection({activeProject}: SettingsActionsSectionProps) {
    const {discoverTests, isDiscovering, getIsAnyTestRunning} = useTestsStore()

    const {clearingData, clearAllData} = useDashboardActions()
    const isAnyTestRunning = getIsAnyTestRunning()
    const [showClearMenu, setShowClearMenu] = useState(false)
    const clearSplitRef = useRef<HTMLDivElement>(null)
    useClickOutside(clearSplitRef, showClearMenu, () => setShowClearMenu(false))

    return (
        <SettingsSection title="Actions" description="Common tasks and operations">
            <div className="space-y-3">
                <Button
                    variant="primary"
                    fullWidth
                    loading={isDiscovering}
                    disabled={isAnyTestRunning}
                    onClick={() => discoverTests()}>
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

                <div className="relative" ref={clearSplitRef}>
                    <div className="flex rounded-xl shadow-soft">
                        <Button
                            variant="danger"
                            fullWidth
                            loading={clearingData}
                            disabled={isAnyTestRunning || clearingData}
                            onClick={() => {
                                setShowClearMenu(false)
                                clearAllData()
                            }}
                            className="rounded-r-none shadow-none">
                            {clearingData ? (
                                'Clearing...'
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <Trash2 className="h-4 w-4" /> Clear All Data
                                </span>
                            )}
                        </Button>
                        <Button
                            variant="danger"
                            loading={false}
                            disabled={isAnyTestRunning || clearingData || !activeProject}
                            onClick={() => setShowClearMenu((open) => !open)}
                            aria-label="Clear project data options"
                            aria-expanded={showClearMenu}
                            className="rounded-l-none shadow-none border-l border-white/20 px-2 dark:border-black/20">
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                    </div>
                    {showClearMenu && activeProject && (
                        <div className="absolute top-full left-0 z-50 mt-2 min-w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-800">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowClearMenu(false)
                                    clearAllData(activeProject)
                                }}
                                className="flex w-full items-center gap-2 whitespace-nowrap px-4 py-2.5 text-left text-sm text-danger-600 hover:bg-gray-50 dark:text-danger-400 dark:hover:bg-white/[0.06]">
                                <Trash2 className="h-3.5 w-3.5" />
                                Clear "{activeProject}" data only
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </SettingsSection>
    )
}
