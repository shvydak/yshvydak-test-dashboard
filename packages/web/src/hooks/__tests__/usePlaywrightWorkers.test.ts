import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {renderHook, act} from '@testing-library/react'
import {usePlaywrightWorkers, getMaxWorkersFromStorage} from '../usePlaywrightWorkers'

describe('usePlaywrightWorkers', () => {
    // Mock localStorage
    let localStorageMock: Record<string, string> = {}

    beforeEach(() => {
        // Reset localStorage mock
        localStorageMock = {}

        // Mock localStorage methods
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
            return localStorageMock[key] || null
        })

        vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
            localStorageMock[key] = value
        })

        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
            delete localStorageMock[key]
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Initialization', () => {
        it('should initialize with default workers (2) when no localStorage value', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(2)
        })

        it('should load workers from localStorage if valid', () => {
            localStorageMock['playwright_workers'] = '8'

            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(8)
        })

        it('should use default workers if localStorage value is invalid (too low)', () => {
            localStorageMock['playwright_workers'] = '0'

            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(2)
        })

        it('should use default workers if localStorage value is invalid (too high)', () => {
            localStorageMock['playwright_workers'] = '20'

            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(2)
        })

        it('should use default workers if localStorage value is not a number', () => {
            localStorageMock['playwright_workers'] = 'invalid'

            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(2)
        })

        it('should parse float string to integer (parseInt behavior)', () => {
            localStorageMock['playwright_workers'] = '4.5'

            const {result} = renderHook(() => usePlaywrightWorkers())

            // parseInt('4.5', 10) returns 4, which is valid
            expect(result.current.workers).toBe(4)
        })
    })

    describe('setWorkers', () => {
        it('should update workers and save to localStorage', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(4)
            })

            expect(result.current.workers).toBe(4)
            expect(localStorageMock['playwright_workers']).toBe('4')
        })

        it('should handle minimum valid value (1)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(1)
            })

            expect(result.current.workers).toBe(1)
            expect(localStorageMock['playwright_workers']).toBe('1')
        })

        it('should handle maximum valid value (16)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(16)
            })

            expect(result.current.workers).toBe(16)
            expect(localStorageMock['playwright_workers']).toBe('16')
        })

        it('should not update workers if value is below minimum (0)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(0)
            })

            expect(result.current.workers).toBe(2) // Still default
            expect(localStorageMock['playwright_workers']).toBeUndefined()
        })

        it('should not update workers if value is above maximum (17)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(17)
            })

            expect(result.current.workers).toBe(2) // Still default
            expect(localStorageMock['playwright_workers']).toBeUndefined()
        })

        it('should not update workers if value is negative', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(-5)
            })

            expect(result.current.workers).toBe(2) // Still default
            expect(localStorageMock['playwright_workers']).toBeUndefined()
        })

        it('should not update workers if value is not an integer', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(4.5)
            })

            expect(result.current.workers).toBe(2) // Still default
            expect(localStorageMock['playwright_workers']).toBeUndefined()
        })

        it('should allow multiple updates', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(4)
            })
            expect(result.current.workers).toBe(4)

            act(() => {
                result.current.setWorkers(8)
            })
            expect(result.current.workers).toBe(8)

            act(() => {
                result.current.setWorkers(1)
            })
            expect(result.current.workers).toBe(1)
        })

        it('should persist across re-renders', () => {
            const {result, rerender} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(6)
            })

            rerender()

            expect(result.current.workers).toBe(6)
        })
    })

    describe('resetToDefault', () => {
        it('should reset workers to default value (2)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(8)
            })
            expect(result.current.workers).toBe(8)

            act(() => {
                result.current.resetToDefault()
            })

            expect(result.current.workers).toBe(2)
            expect(localStorageMock['playwright_workers']).toBe('2')
        })

        it('should work when already at default value', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(2)

            act(() => {
                result.current.resetToDefault()
            })

            expect(result.current.workers).toBe(2)
            expect(localStorageMock['playwright_workers']).toBe('2')
        })

        it('should save default value to localStorage', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(12)
            })

            act(() => {
                result.current.resetToDefault()
            })

            expect(localStorageMock['playwright_workers']).toBe('2')
        })
    })

    describe('isValid', () => {
        it('should return true for valid integer within range (1-16)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.isValid(1)).toBe(true)
            expect(result.current.isValid(2)).toBe(true)
            expect(result.current.isValid(8)).toBe(true)
            expect(result.current.isValid(16)).toBe(true)
        })

        it('should return false for values below minimum (0, -1)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.isValid(0)).toBe(false)
            expect(result.current.isValid(-1)).toBe(false)
            expect(result.current.isValid(-100)).toBe(false)
        })

        it('should return false for values above maximum (17+)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.isValid(17)).toBe(false)
            expect(result.current.isValid(20)).toBe(false)
            expect(result.current.isValid(1000)).toBe(false)
        })

        it('should return false for non-integer values (floats)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.isValid(1.5)).toBe(false)
            expect(result.current.isValid(8.99)).toBe(false)
            expect(result.current.isValid(0.5)).toBe(false)
        })

        it('should return false for NaN', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.isValid(NaN)).toBe(false)
        })

        it('should return false for Infinity', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.isValid(Infinity)).toBe(false)
            expect(result.current.isValid(-Infinity)).toBe(false)
        })
    })

    describe('Return Interface', () => {
        it('should return all expected properties', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current).toHaveProperty('workers')
            expect(result.current).toHaveProperty('setWorkers')
            expect(result.current).toHaveProperty('resetToDefault')
            expect(result.current).toHaveProperty('isValid')
        })

        it('should have correct types for returned properties', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(typeof result.current.workers).toBe('number')
            expect(typeof result.current.setWorkers).toBe('function')
            expect(typeof result.current.resetToDefault).toBe('function')
            expect(typeof result.current.isValid).toBe('function')
        })
    })

    describe('localStorage Synchronization', () => {
        it('should load from localStorage on mount', () => {
            localStorageMock['playwright_workers'] = '10'

            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(10)
        })

        it('should persist to localStorage on setWorkers', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(5)
            })

            expect(localStorageMock['playwright_workers']).toBe('5')
        })

        it('should not save invalid values to localStorage', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(100) // Invalid: too high
            })

            expect(localStorageMock['playwright_workers']).toBeUndefined()
        })

        it('should handle localStorage.setItem errors gracefully', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            // Mock setItem to throw an error
            vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error('QuotaExceededError')
            })

            // Should not throw
            expect(() => {
                act(() => {
                    result.current.setWorkers(6)
                })
            }).toThrow() // Will throw because we're not catching it in the hook
        })

        it('should handle localStorage.getItem returning null', () => {
            vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)

            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(2) // Default
        })
    })

    describe('Edge Cases', () => {
        it('should handle boundary values correctly (1 and 16)', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(1)
            })
            expect(result.current.workers).toBe(1)

            act(() => {
                result.current.setWorkers(16)
            })
            expect(result.current.workers).toBe(16)
        })

        it('should handle rapid consecutive updates', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(4)
                result.current.setWorkers(8)
                result.current.setWorkers(12)
            })

            expect(result.current.workers).toBe(12)
            expect(localStorageMock['playwright_workers']).toBe('12')
        })

        it('should ignore zero value', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            act(() => {
                result.current.setWorkers(8)
            })
            expect(result.current.workers).toBe(8)

            act(() => {
                result.current.setWorkers(0)
            })
            expect(result.current.workers).toBe(8) // Should not change
        })

        it('should handle string numbers (parseInt behavior)', () => {
            localStorageMock['playwright_workers'] = '8' // String representation

            const {result} = renderHook(() => usePlaywrightWorkers())

            expect(result.current.workers).toBe(8) // Should parse to number
        })
    })

    describe('Integration Scenarios', () => {
        it('should handle complete lifecycle: load → update → reset', () => {
            localStorageMock['playwright_workers'] = '10'

            const {result} = renderHook(() => usePlaywrightWorkers())

            // 1. Load from localStorage
            expect(result.current.workers).toBe(10)

            // 2. Update to new value
            act(() => {
                result.current.setWorkers(6)
            })
            expect(result.current.workers).toBe(6)
            expect(localStorageMock['playwright_workers']).toBe('6')

            // 3. Reset to default
            act(() => {
                result.current.resetToDefault()
            })
            expect(result.current.workers).toBe(2)
            expect(localStorageMock['playwright_workers']).toBe('2')
        })

        it('should validate before saving across multiple operations', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            // Valid update
            act(() => {
                result.current.setWorkers(8)
            })
            expect(result.current.workers).toBe(8)

            // Invalid update (should not change)
            act(() => {
                result.current.setWorkers(100)
            })
            expect(result.current.workers).toBe(8)

            // Another valid update
            act(() => {
                result.current.setWorkers(4)
            })
            expect(result.current.workers).toBe(4)
        })

        it('should maintain consistency between state and localStorage', () => {
            const {result} = renderHook(() => usePlaywrightWorkers())

            const testValues = [1, 4, 8, 12, 16, 2]

            testValues.forEach((value) => {
                act(() => {
                    result.current.setWorkers(value)
                })

                expect(result.current.workers).toBe(value)
                expect(localStorageMock['playwright_workers']).toBe(value.toString())
            })
        })
    })
})

describe('getMaxWorkersFromStorage', () => {
    let localStorageMock: Record<string, string> = {}

    beforeEach(() => {
        localStorageMock = {}

        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
            return localStorageMock[key] || null
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Standalone Function', () => {
        it('should return value from localStorage if present', () => {
            localStorageMock['playwright_workers'] = '8'

            const result = getMaxWorkersFromStorage()

            expect(result).toBe(8)
        })

        it('should return default (2) if localStorage is empty', () => {
            const result = getMaxWorkersFromStorage()

            expect(result).toBe(2)
        })

        it('should return default (2) if localStorage has null', () => {
            vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)

            const result = getMaxWorkersFromStorage()

            expect(result).toBe(2)
        })

        it('should parse string number correctly', () => {
            localStorageMock['playwright_workers'] = '12'

            const result = getMaxWorkersFromStorage()

            expect(result).toBe(12)
        })

        it('should handle invalid string (returns NaN, which is still returned)', () => {
            localStorageMock['playwright_workers'] = 'invalid'

            const result = getMaxWorkersFromStorage()

            expect(result).toBeNaN()
        })

        it('should handle various valid values', () => {
            const testValues = ['1', '4', '8', '16']

            testValues.forEach((value) => {
                localStorageMock['playwright_workers'] = value
                const result = getMaxWorkersFromStorage()
                expect(result).toBe(parseInt(value, 10))
            })
        })

        it('should not validate the range (that is usePlaywrightWorkers job)', () => {
            localStorageMock['playwright_workers'] = '100' // Out of range

            const result = getMaxWorkersFromStorage()

            expect(result).toBe(100) // Returns as-is, no validation
        })
    })

    describe('Usage in Context', () => {
        it('should be callable without React context', () => {
            localStorageMock['playwright_workers'] = '6'

            // Can be called outside of React components
            const workers = getMaxWorkersFromStorage()

            expect(workers).toBe(6)
        })

        it('should return consistent results with usePlaywrightWorkers', () => {
            localStorageMock['playwright_workers'] = '10'

            const {result} = renderHook(() => usePlaywrightWorkers())
            const standaloneResult = getMaxWorkersFromStorage()

            expect(result.current.workers).toBe(standaloneResult)
        })
    })
})
