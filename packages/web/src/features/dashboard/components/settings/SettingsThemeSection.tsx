import {useTheme} from '@/hooks/useTheme'
import {SettingsSection} from './SettingsSection'

type ThemeMode = 'auto' | 'light' | 'dark'

export function SettingsThemeSection() {
    const {themeMode, setThemeMode} = useTheme()

    const themeOptions: Array<{value: ThemeMode; label: string; icon: string}> = [
        {value: 'auto', label: 'Auto', icon: '🌓'},
        {value: 'light', label: 'Light', icon: '☀️'},
        {value: 'dark', label: 'Dark', icon: '🌙'},
    ]

    return (
        <SettingsSection
            title="Theme"
            description="Choose your preferred theme or follow system settings">
            <div className="flex space-x-2">
                {themeOptions.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setThemeMode(option.value)}
                        className={`flex-1 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                            themeMode === option.value
                                ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 border-2 border-primary-500'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}>
                        <div className="flex flex-col items-center space-y-1">
                            <span className="text-2xl">{option.icon}</span>
                            <span>{option.label}</span>
                        </div>
                    </button>
                ))}
            </div>
        </SettingsSection>
    )
}
