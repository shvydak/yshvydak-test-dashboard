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
            <div className="flex gap-1.5 rounded-2xl bg-gray-100/70 p-1.5 dark:bg-white/[0.04]">
                {themeOptions.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setThemeMode(option.value)}
                        className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                            themeMode === option.value
                                ? 'bg-white text-primary-700 shadow-soft dark:bg-primary-500/15 dark:text-primary-300'
                                : 'text-gray-500 hover:bg-white/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-white'
                        }`}>
                        <div className="flex flex-col items-center gap-1.5">
                            <span className="text-2xl">{option.icon}</span>
                            <span>{option.label}</span>
                        </div>
                    </button>
                ))}
            </div>
        </SettingsSection>
    )
}
