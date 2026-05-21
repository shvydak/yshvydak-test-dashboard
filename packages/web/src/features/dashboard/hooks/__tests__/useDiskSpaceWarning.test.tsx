import React from 'react'
import {renderHook, act} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {useDiskSpaceWarning} from '../useDiskSpaceWarning'
import * as useStorageStatsModule from '../useStorageStats'
import * as useDiskThresholdsModule from '../useDiskThresholds'

vi.mock('../useStorageStats')
vi.mock('../useDiskThresholds')

describe('useDiskSpaceWarning', () => {
    let queryClient: QueryClient

    const wrapper = ({children}: {children: React.ReactNode}) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const mockStorageStats = (usedPercent: number | null) => {
        vi.mocked(useStorageStatsModule.useStorageStats).mockReturnValue({
            data:
                usedPercent !== null
                    ? {disk: {total: 100, free: 100 - usedPercent, used: usedPercent, usedPercent}}
                    : {disk: null},
            isLoading: false,
        } as any)
    }

    const mockThresholds = (warningPercent: number, criticalPercent: number) => {
        vi.mocked(useDiskThresholdsModule.useDiskThresholds).mockReturnValue({
            thresholds: {warningPercent, criticalPercent},
            isLoading: false,
            saveThresholds: vi.fn(),
            isSaving: false,
            saveError: null,
        } as any)
    }

    beforeEach(() => {
        queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
        vi.clearAllMocks()
    })

    describe('severity calculation', () => {
        it('should return null when disk stats are unavailable', () => {
            mockStorageStats(null)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.severity).toBeNull()
        })

        it('should return null when thresholds are not loaded', () => {
            mockStorageStats(50)
            vi.mocked(useDiskThresholdsModule.useDiskThresholds).mockReturnValue({
                thresholds: undefined,
                isLoading: true,
                saveThresholds: vi.fn(),
                isSaving: false,
                saveError: null,
            } as any)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.severity).toBeNull()
        })

        it('should return null when disk is healthy (free > warning threshold)', () => {
            // 30% used → 70% free, warning at 20% free → healthy
            mockStorageStats(30)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.severity).toBeNull()
        })

        it('should return "warning" when free space is at warning threshold', () => {
            // 80% used → 20% free, warning at 20% → triggers warning
            mockStorageStats(80)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.severity).toBe('warning')
        })

        it('should return "warning" when free space is between critical and warning', () => {
            // 88% used → 12% free, warning=20%, critical=5%
            mockStorageStats(88)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.severity).toBe('warning')
        })

        it('should return "critical" when free space is at critical threshold', () => {
            // 95% used → 5% free, critical=5%
            mockStorageStats(95)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.severity).toBe('critical')
        })

        it('should return "critical" when free space is below critical threshold', () => {
            // 98% used → 2% free, critical=5%
            mockStorageStats(98)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.severity).toBe('critical')
        })

        it('should return null when disk is exactly at 100 - warning - 1 (just above threshold)', () => {
            // warning=20% → threshold fires at ≤20% free. 79% used → 21% free → healthy
            mockStorageStats(79)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.severity).toBeNull()
        })
    })

    describe('dismiss behaviour', () => {
        it('should start as not dismissed', () => {
            mockStorageStats(90)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.isDismissed).toBe(false)
        })

        it('should set isDismissed to true when dismiss() is called', () => {
            mockStorageStats(90)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            act(() => {
                result.current.dismiss()
            })

            expect(result.current.isDismissed).toBe(true)
        })

        it('should reset isDismissed to false when triggerCheck() is called', () => {
            mockStorageStats(90)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            act(() => {
                result.current.dismiss()
            })
            expect(result.current.isDismissed).toBe(true)

            act(() => {
                result.current.triggerCheck()
            })

            expect(result.current.isDismissed).toBe(false)
        })
    })

    describe('returned values', () => {
        it('should expose diskStats from storage stats', () => {
            mockStorageStats(60)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.diskStats).toEqual({
                total: 100,
                free: 40,
                used: 60,
                usedPercent: 60,
            })
        })

        it('should expose null diskStats when disk is unavailable', () => {
            mockStorageStats(null)
            mockThresholds(20, 5)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.diskStats).toBeNull()
        })

        it('should expose current thresholds', () => {
            mockStorageStats(50)
            mockThresholds(30, 10)

            const {result} = renderHook(() => useDiskSpaceWarning(), {wrapper})

            expect(result.current.thresholds).toEqual({warningPercent: 30, criticalPercent: 10})
        })
    })
})
