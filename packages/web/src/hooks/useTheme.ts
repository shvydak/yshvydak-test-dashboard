import {useState, useEffect} from 'react'

export type ThemeMode = 'auto' | 'light' | 'dark'

interface UseThemeReturn {
    themeMode: ThemeMode
    isDark: boolean
    setThemeMode: (mode: ThemeMode) => void
}

export function applyThemeMode(themeMode: ThemeMode): void {
    let shouldBeDark = false

    if (themeMode === 'dark') {
        shouldBeDark = true
    } else if (themeMode === 'light') {
        shouldBeDark = false
    } else {
        shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    }

    if (shouldBeDark) {
        document.documentElement.classList.add('dark')
    } else {
        document.documentElement.classList.remove('dark')
    }
}

export function useTheme(): UseThemeReturn {
    const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem('theme')
        return (saved as ThemeMode) || 'auto'
    })

    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

        const updateIsDark = () => {
            const shouldBeDark =
                themeMode === 'dark' ||
                (themeMode === 'auto' && mediaQuery.matches) ||
                (themeMode === 'light' ? false : false)
            setIsDark(shouldBeDark)
        }

        applyThemeMode(themeMode)
        updateIsDark()

        const handler = (e: MediaQueryListEvent) => {
            if (themeMode === 'auto') {
                setIsDark(e.matches)
                applyThemeMode(themeMode)
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
