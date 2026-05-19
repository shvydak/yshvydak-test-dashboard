import {X} from 'lucide-react'
import {ModalBackdrop} from '@shared/components/molecules'
import {SettingsThemeSection} from './SettingsThemeSection'
import {SettingsTestExecutionSection} from './SettingsTestExecutionSection'
import {SettingsActionsSection} from './SettingsActionsSection'
import {SettingsStorageSection} from './SettingsStorageSection'
import {SettingsDataRetentionSection} from './SettingsDataRetentionSection'

export interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
}

export function SettingsModal({isOpen, onClose}: SettingsModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-0 md:p-4">
                <ModalBackdrop onClick={onClose} blur="sm" />

                <div className="relative w-full max-w-2xl animate-scale-in overflow-y-auto bg-white shadow-pop dark:bg-gray-800 dark:backdrop-blur-xl max-h-screen md:max-h-[90vh] md:rounded-2xl md:border md:border-gray-200/80 md:dark:border-white/[0.07]">
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200/70 bg-white/90 p-4 backdrop-blur-xl dark:border-white/[0.06] dark:bg-gray-800/90 md:p-6">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                Settings
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                Manage your dashboard preferences and actions
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-5 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto md:p-6 md:space-y-5">
                        <SettingsThemeSection />
                        <SettingsTestExecutionSection />
                        <SettingsActionsSection />
                        <SettingsStorageSection />
                        <SettingsDataRetentionSection />
                    </div>
                </div>
            </div>
        </div>
    )
}
