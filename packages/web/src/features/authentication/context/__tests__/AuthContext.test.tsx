/**
 * Tests for AuthContext
 *
 * Authentication state management and context provider.
 *
 * Test Coverage:
 * - AuthProvider - context provider component
 * - useAuth() - context hook with validation
 * - logout() - authentication cleanup
 * - globalLogout mechanism - setGlobalLogout/getGlobalLogout
 * - Edge cases and error handling
 *
 * Target Coverage: 80%+
 */

import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, renderHook} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import {AuthProvider, useAuth, setGlobalLogout, getGlobalLogout} from '../AuthContext'
import React from 'react'

describe('AuthContext', () => {
    beforeEach(() => {
        // Clear storage before each test
        localStorage.clear()
        sessionStorage.clear()

        // Reset global logout function
        setGlobalLogout(null as any)

        // Clear all mocks
        vi.clearAllMocks()
    })

    describe('AuthProvider', () => {
        it('should render children correctly', () => {
            render(
                <AuthProvider onLogout={vi.fn()}>
                    <div data-testid="child">Test Child</div>
                </AuthProvider>
            )

            expect(screen.getByTestId('child')).toBeInTheDocument()
            expect(screen.getByText('Test Child')).toBeInTheDocument()
        })

        it('should provide auth context to children', () => {
            const TestComponent = () => {
                const auth = useAuth()
                return <div data-testid="has-auth">{auth ? 'Has Auth' : 'No Auth'}</div>
            }

            render(
                <AuthProvider onLogout={vi.fn()}>
                    <TestComponent />
                </AuthProvider>
            )

            expect(screen.getByTestId('has-auth')).toHaveTextContent('Has Auth')
        })

        it('should render multiple children', () => {
            render(
                <AuthProvider onLogout={vi.fn()}>
                    <div data-testid="child-1">Child 1</div>
                    <div data-testid="child-2">Child 2</div>
                    <div data-testid="child-3">Child 3</div>
                </AuthProvider>
            )

            expect(screen.getByTestId('child-1')).toBeInTheDocument()
            expect(screen.getByTestId('child-2')).toBeInTheDocument()
            expect(screen.getByTestId('child-3')).toBeInTheDocument()
        })

        it('should handle nested elements', () => {
            render(
                <AuthProvider onLogout={vi.fn()}>
                    <div>
                        <div>
                            <span data-testid="nested">Nested Content</span>
                        </div>
                    </div>
                </AuthProvider>
            )

            expect(screen.getByTestId('nested')).toBeInTheDocument()
        })
    })

    describe('useAuth() hook', () => {
        it('should return logout function from context', () => {
            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={vi.fn()}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            expect(result.current).toHaveProperty('logout')
            expect(typeof result.current.logout).toBe('function')
        })

        it('should throw error when used outside AuthProvider', () => {
            // Suppress console.error for this test
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

            expect(() => {
                renderHook(() => useAuth())
            }).toThrow('useAuth must be used within AuthProvider')

            consoleError.mockRestore()
        })

        it('should work with nested components', () => {
            const NestedComponent = () => {
                const {logout} = useAuth()
                return <button onClick={logout}>Logout</button>
            }

            const MiddleComponent = () => {
                return (
                    <div>
                        <NestedComponent />
                    </div>
                )
            }

            render(
                <AuthProvider onLogout={vi.fn()}>
                    <MiddleComponent />
                </AuthProvider>
            )

            expect(screen.getByRole('button')).toBeInTheDocument()
        })
    })

    describe('logout() function', () => {
        it('should clear localStorage auth data', () => {
            localStorage.setItem('_auth', 'test-auth-data')

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={vi.fn()}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            result.current.logout()

            expect(localStorage.getItem('_auth')).toBeNull()
        })

        it('should clear sessionStorage auth data', () => {
            sessionStorage.setItem('_auth', 'test-session-data')

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={vi.fn()}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            result.current.logout()

            expect(sessionStorage.getItem('_auth')).toBeNull()
        })

        it('should clear both localStorage and sessionStorage', () => {
            localStorage.setItem('_auth', 'local-data')
            sessionStorage.setItem('_auth', 'session-data')

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={vi.fn()}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            result.current.logout()

            expect(localStorage.getItem('_auth')).toBeNull()
            expect(sessionStorage.getItem('_auth')).toBeNull()
        })

        it('should call onLogout callback', () => {
            const mockOnLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            result.current.logout()

            expect(mockOnLogout).toHaveBeenCalledTimes(1)
        })

        it('should call onLogout after clearing storage', () => {
            const mockOnLogout = vi.fn(() => {
                // Verify storage is cleared when callback is called
                expect(localStorage.getItem('_auth')).toBeNull()
                expect(sessionStorage.getItem('_auth')).toBeNull()
            })

            localStorage.setItem('_auth', 'test-data')
            sessionStorage.setItem('_auth', 'test-data')

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            result.current.logout()

            expect(mockOnLogout).toHaveBeenCalled()
        })

        it('should work when no auth data exists', () => {
            const mockOnLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Should not throw
            expect(() => result.current.logout()).not.toThrow()
            expect(mockOnLogout).toHaveBeenCalled()
        })

        it('should work when called multiple times', () => {
            const mockOnLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            result.current.logout()
            result.current.logout()
            result.current.logout()

            expect(mockOnLogout).toHaveBeenCalledTimes(3)
        })

        it('should clear storage even if onLogout throws', () => {
            const mockOnLogout = vi.fn(() => {
                throw new Error('Logout callback error')
            })

            localStorage.setItem('_auth', 'test-data')

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Storage should be cleared before callback
            expect(() => result.current.logout()).toThrow('Logout callback error')
            expect(localStorage.getItem('_auth')).toBeNull()
        })
    })

    describe('Global Logout Mechanism', () => {
        it('should set global logout function', () => {
            const mockLogout = vi.fn()

            setGlobalLogout(mockLogout)

            expect(getGlobalLogout()).toBe(mockLogout)
        })

        it('should get global logout function', () => {
            const mockLogout = vi.fn()
            setGlobalLogout(mockLogout)

            const globalLogout = getGlobalLogout()

            expect(globalLogout).toBe(mockLogout)
            expect(typeof globalLogout).toBe('function')
        })

        it('should return null when no global logout is set', () => {
            expect(getGlobalLogout()).toBeNull()
        })

        it('should allow calling global logout function', () => {
            const mockLogout = vi.fn()
            setGlobalLogout(mockLogout)

            const globalLogout = getGlobalLogout()
            globalLogout?.()

            expect(mockLogout).toHaveBeenCalledTimes(1)
        })

        it('should allow overwriting global logout function', () => {
            const mockLogout1 = vi.fn()
            const mockLogout2 = vi.fn()

            setGlobalLogout(mockLogout1)
            expect(getGlobalLogout()).toBe(mockLogout1)

            setGlobalLogout(mockLogout2)
            expect(getGlobalLogout()).toBe(mockLogout2)

            getGlobalLogout()?.()

            expect(mockLogout1).not.toHaveBeenCalled()
            expect(mockLogout2).toHaveBeenCalledTimes(1)
        })

        it('should allow clearing global logout function', () => {
            const mockLogout = vi.fn()
            setGlobalLogout(mockLogout)

            expect(getGlobalLogout()).toBe(mockLogout)

            setGlobalLogout(null as any)

            expect(getGlobalLogout()).toBeNull()
        })

        it('should work with provider logout function', () => {
            const mockProviderLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockProviderLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Set global logout to provider's logout
            setGlobalLogout(result.current.logout)

            // Call via global logout
            const globalLogout = getGlobalLogout()
            globalLogout?.()

            expect(mockProviderLogout).toHaveBeenCalled()
        })
    })

    describe('Integration Tests', () => {
        it('should complete full logout flow', () => {
            localStorage.setItem('_auth', JSON.stringify({token: 'test-token'}))
            sessionStorage.setItem('_auth', JSON.stringify({token: 'test-token'}))

            const mockOnLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Set as global logout
            setGlobalLogout(result.current.logout)

            // Verify data exists
            expect(localStorage.getItem('_auth')).toBeTruthy()
            expect(sessionStorage.getItem('_auth')).toBeTruthy()

            // Logout via context
            result.current.logout()

            // Verify cleanup
            expect(localStorage.getItem('_auth')).toBeNull()
            expect(sessionStorage.getItem('_auth')).toBeNull()
            expect(mockOnLogout).toHaveBeenCalled()
        })

        it('should work with global logout from authFetch', () => {
            const mockOnLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Simulate authFetch setting global logout
            setGlobalLogout(result.current.logout)

            // Simulate 401 error triggering global logout
            const globalLogout = getGlobalLogout()
            globalLogout?.()

            expect(mockOnLogout).toHaveBeenCalled()
        })

        it('should handle multiple provider instances', () => {
            const mockOnLogout1 = vi.fn()
            const mockOnLogout2 = vi.fn()

            const TestComponent1 = () => {
                const {logout} = useAuth()
                return <button data-testid="logout-1" onClick={logout} />
            }

            const TestComponent2 = () => {
                const {logout} = useAuth()
                return <button data-testid="logout-2" onClick={logout} />
            }

            const {container} = render(
                <>
                    <AuthProvider onLogout={mockOnLogout1}>
                        <TestComponent1 />
                    </AuthProvider>
                    <AuthProvider onLogout={mockOnLogout2}>
                        <TestComponent2 />
                    </AuthProvider>
                </>
            )

            const buttons = container.querySelectorAll('button')
            expect(buttons).toHaveLength(2)
        })

        it('should preserve other localStorage data on logout', () => {
            localStorage.setItem('_auth', 'auth-data')
            localStorage.setItem('other-key', 'other-data')
            localStorage.setItem('user-preferences', 'preferences')

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={vi.fn()}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            result.current.logout()

            expect(localStorage.getItem('_auth')).toBeNull()
            expect(localStorage.getItem('other-key')).toBe('other-data')
            expect(localStorage.getItem('user-preferences')).toBe('preferences')
        })

        it('should preserve other sessionStorage data on logout', () => {
            sessionStorage.setItem('_auth', 'auth-data')
            sessionStorage.setItem('temp-data', 'temp')

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={vi.fn()}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            result.current.logout()

            expect(sessionStorage.getItem('_auth')).toBeNull()
            expect(sessionStorage.getItem('temp-data')).toBe('temp')
        })
    })

    describe('Edge Cases', () => {
        it('should handle rapid logout calls', () => {
            const mockOnLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Rapid fire 10 logout calls
            for (let i = 0; i < 10; i++) {
                result.current.logout()
            }

            expect(mockOnLogout).toHaveBeenCalledTimes(10)
        })

        it('should handle concurrent logout calls', async () => {
            const mockOnLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Call logout concurrently
            await Promise.all([
                Promise.resolve(result.current.logout()),
                Promise.resolve(result.current.logout()),
                Promise.resolve(result.current.logout()),
            ])

            expect(mockOnLogout).toHaveBeenCalledTimes(3)
        })

        it('should work when localStorage is disabled', () => {
            const originalLocalStorage = global.localStorage

            // Mock localStorage to throw (simulating disabled localStorage)
            Object.defineProperty(global, 'localStorage', {
                value: {
                    getItem: () => {
                        throw new Error('localStorage is disabled')
                    },
                    setItem: () => {
                        throw new Error('localStorage is disabled')
                    },
                    removeItem: () => {
                        throw new Error('localStorage is disabled')
                    },
                    clear: () => {
                        throw new Error('localStorage is disabled')
                    },
                },
                writable: true,
            })

            const mockOnLogout = vi.fn()

            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={mockOnLogout}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Should throw when trying to clear storage
            expect(() => result.current.logout()).toThrow('localStorage is disabled')

            // Restore
            Object.defineProperty(global, 'localStorage', {
                value: originalLocalStorage,
                writable: true,
            })
        })

        it('should handle undefined onLogout gracefully', () => {
            // TypeScript prevents this, but JavaScript might allow it
            const wrapper = ({children}: {children: React.ReactNode}) => (
                <AuthProvider onLogout={undefined as any}>{children}</AuthProvider>
            )

            const {result} = renderHook(() => useAuth(), {wrapper})

            // Should throw when undefined is called as function
            expect(() => result.current.logout()).toThrow()
        })
    })
})
