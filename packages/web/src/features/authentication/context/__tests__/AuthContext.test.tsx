/**
 * Tests for the global logout hook (setGlobalLogout/getGlobalLogout):
 * authFetch calls it on a 401, App registers it.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest'
import {setGlobalLogout, getGlobalLogout} from '../AuthContext'

describe('AuthContext', () => {
    beforeEach(() => {
        setGlobalLogout(null as any)
        vi.clearAllMocks()
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
    })
})
