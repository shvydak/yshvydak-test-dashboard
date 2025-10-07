import {SettingsThemeSection} from './SettingsThemeSection'
import {SettingsActionsSection} from './SettingsActionsSection'

export interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
}

export function SettingsModal({isOpen, onClose}: SettingsModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-4">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>

                <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-xl">
                    <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                Settings
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Manage your dashboard preferences and actions
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                            <svg
                                className="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                        <SettingsThemeSection />
                        <SettingsActionsSection />
                    </div>
                </div>
            </div>
        </div>
    )
}
