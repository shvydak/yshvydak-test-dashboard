import {useState, useEffect} from 'react'

type ThemeMode = 'auto' | 'light' | 'dark'

interface UseThemeReturn {
    themeMode: ThemeMode
    isDark: boolean
    setThemeMode: (mode: ThemeMode) => void
}

export function useTheme(): UseThemeReturn {
    const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem('theme')
        return (saved as ThemeMode) || 'auto'
    })

    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

        const applyTheme = () => {
            let shouldBeDark = false

            if (themeMode === 'dark') {
                shouldBeDark = true
            } else if (themeMode === 'light') {
                shouldBeDark = false
            } else {
                shouldBeDark = mediaQuery.matches
            }

            setIsDark(shouldBeDark)

            if (shouldBeDark) {
                document.documentElement.classList.add('dark')
            } else {
                document.documentElement.classList.remove('dark')
            }
        }

        applyTheme()

        const handler = (e: MediaQueryListEvent) => {
            if (themeMode === 'auto') {
                setIsDark(e.matches)
                if (e.matches) {
                    document.documentElement.classList.add('dark')
                } else {
                    document.documentElement.classList.remove('dark')
                }
            }
        }

        mediaQuery.addEventListener('change', handler)
        return () => mediaQuery.removeEventListener('change', handler)
    }, [themeMode])

    const setThemeMode = (mode: ThemeMode) => {
        setThemeModeState(mode)
        localStorage.setItem('theme', mode)
    }

    return {
        themeMode,
        isDark,
        setThemeMode,
    }
}
