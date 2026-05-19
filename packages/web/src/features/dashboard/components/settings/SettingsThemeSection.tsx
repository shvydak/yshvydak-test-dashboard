import React from 'react'
import {SunMedium, Moon, MonitorSmartphone} from 'lucide-react'
import {useTheme} from '@/hooks/useTheme'
import {SettingsSection} from './SettingsSection'

type ThemeMode = 'auto' | 'light' | 'dark'

const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
    auto: <MonitorSmartphone className="h-5 w-5" />,
    light: <SunMedium className="h-5 w-5" />,
    dark: <Moon className="h-5 w-5" />,
}

export function SettingsThemeSection() {
    const {themeMode, setThemeMode} = useTheme()

    const themeOptions: Array<{value: ThemeMode; label: string}> = [
        {value: 'auto', label: 'Auto'},
        {value: 'light', label: 'Light'},
        {value: 'dark', label: 'Dark'},
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
                            {THEME_ICONS[option.value]}
                            <span>{option.label}</span>
                        </div>
                    </button>
                ))}
            </div>
        </SettingsSection>
    )
}
