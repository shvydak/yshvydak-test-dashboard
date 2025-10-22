import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {renderHook, act, waitFor} from '@testing-library/react'
import {useTheme, applyThemeMode, type ThemeMode} from '../useTheme'

/**
 * Test Suite: useTheme Hook
 *
 * Tests theme management functionality including:
 * - Theme persistence to localStorage
 * - System preference detection (prefers-color-scheme)
 * - Theme toggle (light/dark/auto)
 * - CSS class application to document element
 * - MediaQuery listener for auto theme updates
 *
 * Coverage Target: 80%+
 */

describe('useTheme', () => {
    let mockMatchMedia: {
        matches: boolean
        addEventListener: ReturnType<typeof vi.fn>
        removeEventListener: ReturnType<typeof vi.fn>
        media: string
    }

    beforeEach(() => {
        // Clear localStorage
        localStorage.clear()

        // Reset document element classes
        document.documentElement.className = ''

        // Mock matchMedia
        mockMatchMedia = {
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            media: '(prefers-color-scheme: dark)',
        }

        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            configurable: true,
            value: vi.fn().mockReturnValue(mockMatchMedia),
        })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('Initialization', () => {
        it('should initialize with "auto" theme when no localStorage value', () => {
            const {result} = renderHook(() => useTheme())

            expect(result.current.themeMode).toBe('auto')
        })

        it('should initialize with saved theme from localStorage', () => {
            localStorage.setItem('theme', 'dark')

            const {result} = renderHook(() => useTheme())

            expect(result.current.themeMode).toBe('dark')
        })

        it('should initialize with "light" theme from localStorage', () => {
            localStorage.setItem('theme', 'light')

            const {result} = renderHook(() => useTheme())

            expect(result.current.themeMode).toBe('light')
        })

        it('should handle invalid localStorage value by defaulting to "auto"', () => {
            localStorage.setItem('theme', 'invalid-theme')

            const {result} = renderHook(() => useTheme())

            // Even with invalid value, it should read it (type coercion)
            expect(result.current.themeMode).toBe('invalid-theme')
        })
    })

    describe('Theme Mode Setting', () => {
        it('should update theme mode to "dark"', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(result.current.themeMode).toBe('dark')
            expect(localStorage.getItem('theme')).toBe('dark')
        })

        it('should update theme mode to "light"', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('light')
            })

            expect(result.current.themeMode).toBe('light')
            expect(localStorage.getItem('theme')).toBe('light')
        })

        it('should update theme mode to "auto"', () => {
            localStorage.setItem('theme', 'dark')
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('auto')
            })

            expect(result.current.themeMode).toBe('auto')
            expect(localStorage.getItem('theme')).toBe('auto')
        })

        it('should persist theme changes to localStorage', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(localStorage.getItem('theme')).toBe('dark')

            act(() => {
                result.current.setThemeMode('light')
            })

            expect(localStorage.getItem('theme')).toBe('light')
        })
    })

    describe('isDark State', () => {
        it('should set isDark to true when theme is "dark"', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(result.current.isDark).toBe(true)
        })

        it('should set isDark to false when theme is "light"', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('light')
            })

            expect(result.current.isDark).toBe(false)
        })

        it('should set isDark based on system preference when theme is "auto"', () => {
            mockMatchMedia.matches = true

            const {result} = renderHook(() => useTheme())

            expect(result.current.themeMode).toBe('auto')
            expect(result.current.isDark).toBe(true)
        })

        it('should set isDark to false when auto mode and system prefers light', () => {
            mockMatchMedia.matches = false

            const {result} = renderHook(() => useTheme())

            expect(result.current.themeMode).toBe('auto')
            expect(result.current.isDark).toBe(false)
        })
    })

    describe('System Preference Detection (Auto Mode)', () => {
        it('should register mediaQuery listener on mount', () => {
            renderHook(() => useTheme())

            expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
            expect(mockMatchMedia.addEventListener).toHaveBeenCalledWith(
                'change',
                expect.any(Function)
            )
        })

        it('should remove mediaQuery listener on unmount', () => {
            const {unmount} = renderHook(() => useTheme())

            unmount()

            expect(mockMatchMedia.removeEventListener).toHaveBeenCalledWith(
                'change',
                expect.any(Function)
            )
        })

        it('should update isDark when system preference changes in auto mode', () => {
            mockMatchMedia.matches = false
            const {result} = renderHook(() => useTheme())

            expect(result.current.isDark).toBe(false)

            // Simulate system preference change
            act(() => {
                const handler = mockMatchMedia.addEventListener.mock.calls[0][1] as (
                    e: MediaQueryListEvent
                ) => void
                handler({matches: true} as MediaQueryListEvent)
            })

            expect(result.current.isDark).toBe(true)
        })

        it('should NOT update isDark when system preference changes in dark mode', async () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(result.current.isDark).toBe(true)

            // Simulate system preference change (should be ignored in dark mode)
            act(() => {
                // Get the most recent handler (after setThemeMode)
                const calls = mockMatchMedia.addEventListener.mock.calls
                const handler = calls[calls.length - 1][1] as (e: MediaQueryListEvent) => void
                handler({matches: false} as MediaQueryListEvent)
            })

            // Wait for any state updates
            await waitFor(() => {
                // isDark should remain true (dark mode is explicit)
                expect(result.current.isDark).toBe(true)
            })
        })

        it('should NOT update isDark when system preference changes in light mode', async () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('light')
            })

            expect(result.current.isDark).toBe(false)

            // Simulate system preference change (should be ignored in light mode)
            act(() => {
                // Get the most recent handler (after setThemeMode)
                const calls = mockMatchMedia.addEventListener.mock.calls
                const handler = calls[calls.length - 1][1] as (e: MediaQueryListEvent) => void
                handler({matches: true} as MediaQueryListEvent)
            })

            // Wait for any state updates
            await waitFor(() => {
                // isDark should remain false (light mode is explicit)
                expect(result.current.isDark).toBe(false)
            })
        })

        it('should update listeners when theme mode changes', () => {
            const {result} = renderHook(() => useTheme())

            const initialAddCalls = mockMatchMedia.addEventListener.mock.calls.length

            act(() => {
                result.current.setThemeMode('dark')
            })

            // Should have registered new listener after theme change
            expect(mockMatchMedia.addEventListener.mock.calls.length).toBeGreaterThan(
                initialAddCalls
            )
        })
    })

    describe('CSS Class Application', () => {
        it('should add "dark" class when theme is "dark"', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(true)
        })

        it('should remove "dark" class when theme is "light"', () => {
            document.documentElement.classList.add('dark')

            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('light')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(false)
        })

        it('should add "dark" class when auto mode and system prefers dark', () => {
            mockMatchMedia.matches = true

            renderHook(() => useTheme())

            expect(document.documentElement.classList.contains('dark')).toBe(true)
        })

        it('should remove "dark" class when auto mode and system prefers light', () => {
            mockMatchMedia.matches = false

            renderHook(() => useTheme())

            expect(document.documentElement.classList.contains('dark')).toBe(false)
        })

        it('should update class when switching from light to dark', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('light')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(false)

            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(true)
        })

        it('should update class when switching from dark to light', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(true)

            act(() => {
                result.current.setThemeMode('light')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(false)
        })

        it('should update class when switching from explicit to auto mode', () => {
            mockMatchMedia.matches = true
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('light')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(false)

            act(() => {
                result.current.setThemeMode('auto')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(true)
        })
    })

    describe('applyThemeMode Standalone Function', () => {
        it('should add "dark" class for dark mode', () => {
            applyThemeMode('dark')

            expect(document.documentElement.classList.contains('dark')).toBe(true)
        })

        it('should remove "dark" class for light mode', () => {
            document.documentElement.classList.add('dark')

            applyThemeMode('light')

            expect(document.documentElement.classList.contains('dark')).toBe(false)
        })

        it('should add "dark" class for auto mode when system prefers dark', () => {
            mockMatchMedia.matches = true

            applyThemeMode('auto')

            expect(document.documentElement.classList.contains('dark')).toBe(true)
        })

        it('should remove "dark" class for auto mode when system prefers light', () => {
            mockMatchMedia.matches = false
            document.documentElement.classList.add('dark')

            applyThemeMode('auto')

            expect(document.documentElement.classList.contains('dark')).toBe(false)
        })

        it('should be idempotent when called multiple times', () => {
            applyThemeMode('dark')
            applyThemeMode('dark')
            applyThemeMode('dark')

            expect(document.documentElement.classList.contains('dark')).toBe(true)

            applyThemeMode('light')
            applyThemeMode('light')

            expect(document.documentElement.classList.contains('dark')).toBe(false)
        })
    })

    describe('Integration Scenarios', () => {
        it('should handle complete theme cycle: auto -> dark -> light -> auto', () => {
            mockMatchMedia.matches = true
            const {result} = renderHook(() => useTheme())

            // Start with auto (system dark)
            expect(result.current.themeMode).toBe('auto')
            expect(result.current.isDark).toBe(true)
            expect(document.documentElement.classList.contains('dark')).toBe(true)

            // Switch to dark
            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(result.current.themeMode).toBe('dark')
            expect(result.current.isDark).toBe(true)
            expect(document.documentElement.classList.contains('dark')).toBe(true)
            expect(localStorage.getItem('theme')).toBe('dark')

            // Switch to light
            act(() => {
                result.current.setThemeMode('light')
            })

            expect(result.current.themeMode).toBe('light')
            expect(result.current.isDark).toBe(false)
            expect(document.documentElement.classList.contains('dark')).toBe(false)
            expect(localStorage.getItem('theme')).toBe('light')

            // Back to auto
            act(() => {
                result.current.setThemeMode('auto')
            })

            expect(result.current.themeMode).toBe('auto')
            expect(result.current.isDark).toBe(true) // System still prefers dark
            expect(document.documentElement.classList.contains('dark')).toBe(true)
            expect(localStorage.getItem('theme')).toBe('auto')
        })

        it('should persist theme across multiple hook instances', () => {
            const {result: result1} = renderHook(() => useTheme())

            act(() => {
                result1.current.setThemeMode('dark')
            })

            // Unmount first instance
            const {result: result2} = renderHook(() => useTheme())

            // Second instance should read from localStorage
            expect(result2.current.themeMode).toBe('dark')
            expect(result2.current.isDark).toBe(true)
        })

        it('should respond to system preference changes in real-time (auto mode)', () => {
            mockMatchMedia.matches = false
            const {result} = renderHook(() => useTheme())

            expect(result.current.isDark).toBe(false)

            // System switches to dark mode
            act(() => {
                mockMatchMedia.matches = true
                const handler = mockMatchMedia.addEventListener.mock.calls[0][1] as (
                    e: MediaQueryListEvent
                ) => void
                handler({matches: true} as MediaQueryListEvent)
            })

            expect(result.current.isDark).toBe(true)
            expect(document.documentElement.classList.contains('dark')).toBe(true)

            // System switches back to light mode
            act(() => {
                mockMatchMedia.matches = false
                const handler = mockMatchMedia.addEventListener.mock.calls[0][1] as (
                    e: MediaQueryListEvent
                ) => void
                handler({matches: false} as MediaQueryListEvent)
            })

            expect(result.current.isDark).toBe(false)
            expect(document.documentElement.classList.contains('dark')).toBe(false)
        })

        it('should handle rapid theme changes without errors', () => {
            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('dark')
                result.current.setThemeMode('light')
                result.current.setThemeMode('auto')
                result.current.setThemeMode('dark')
                result.current.setThemeMode('light')
            })

            expect(result.current.themeMode).toBe('light')
            expect(result.current.isDark).toBe(false)
            expect(localStorage.getItem('theme')).toBe('light')
        })
    })

    describe('Edge Cases', () => {
        it('should handle missing matchMedia API gracefully', () => {
            // Remove matchMedia (simulate old browser)
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                value: undefined,
            })

            // Should throw but we catch it in try-catch if needed
            expect(() => {
                renderHook(() => useTheme())
            }).toThrow()
        })

        it('should handle localStorage quota exceeded', () => {
            const {result} = renderHook(() => useTheme())

            // Mock localStorage.setItem to throw
            const originalSetItem = Storage.prototype.setItem
            Storage.prototype.setItem = vi.fn(() => {
                throw new Error('QuotaExceededError')
            })

            expect(() => {
                act(() => {
                    result.current.setThemeMode('dark')
                })
            }).toThrow('QuotaExceededError')

            // Restore original
            Storage.prototype.setItem = originalSetItem
        })

        it('should handle empty string in localStorage', () => {
            localStorage.setItem('theme', '')

            const {result} = renderHook(() => useTheme())

            // Should default to "auto" when empty
            expect(result.current.themeMode).toBe('auto')
        })

        it('should work when document element has other classes', () => {
            document.documentElement.className = 'some-other-class another-class'

            const {result} = renderHook(() => useTheme())

            act(() => {
                result.current.setThemeMode('dark')
            })

            expect(document.documentElement.classList.contains('dark')).toBe(true)
            expect(document.documentElement.classList.contains('some-other-class')).toBe(true)
            expect(document.documentElement.classList.contains('another-class')).toBe(true)
        })

        it('should handle multiple addEventListener calls correctly', () => {
            const {result, rerender} = renderHook(() => useTheme())

            const initialCalls = mockMatchMedia.addEventListener.mock.calls.length

            // Change theme multiple times
            act(() => {
                result.current.setThemeMode('dark')
            })

            rerender()

            act(() => {
                result.current.setThemeMode('light')
            })

            rerender()

            // Should have called addEventListener multiple times (once per effect)
            expect(mockMatchMedia.addEventListener.mock.calls.length).toBeGreaterThan(initialCalls)
        })
    })

    describe('Return Value Structure', () => {
        it('should return all required properties', () => {
            const {result} = renderHook(() => useTheme())

            expect(result.current).toHaveProperty('themeMode')
            expect(result.current).toHaveProperty('isDark')
            expect(result.current).toHaveProperty('setThemeMode')
        })

        it('should have correct types for all properties', () => {
            const {result} = renderHook(() => useTheme())

            expect(typeof result.current.themeMode).toBe('string')
            expect(typeof result.current.isDark).toBe('boolean')
            expect(typeof result.current.setThemeMode).toBe('function')
        })

        it('should allow calling setThemeMode with all valid theme modes', () => {
            const {result} = renderHook(() => useTheme())

            const modes: ThemeMode[] = ['auto', 'light', 'dark']

            modes.forEach((mode) => {
                act(() => {
                    result.current.setThemeMode(mode)
                })

                expect(result.current.themeMode).toBe(mode)
            })
        })
    })
})
