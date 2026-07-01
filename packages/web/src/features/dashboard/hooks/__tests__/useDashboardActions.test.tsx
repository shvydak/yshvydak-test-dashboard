import React from 'react'
import {renderHook, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {useDashboardActions} from '../useDashboardActions'
import * as authFetch from '@features/authentication/utils/authFetch'
import * as testsStore from '@features/tests/store/testsStore'
import {config} from '@config/environment.config'

// Mock dependencies
vi.mock('@features/authentication/utils/authFetch')
vi.mock('@features/tests/store/testsStore')

describe('useDashboardActions', () => {
    let queryClient: QueryClient
    let confirmSpy: any
    let alertSpy: any

    const mockFetchTests = vi.fn()

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {retry: false},
            },
        })

        // Mock window.confirm and window.alert
        confirmSpy = vi.spyOn(window, 'confirm')
        alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

        // Mock useTestsStore
        vi.mocked(testsStore.useTestsStore).mockReturnValue({
            fetchTests: mockFetchTests,
        } as any)

        // Reset mocks
        vi.clearAllMocks()
    })

    afterEach(() => {
        confirmSpy.mockRestore()
        alertSpy.mockRestore()
    })

    const wrapper = ({children}: {children: React.ReactNode}) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    describe('clearAllData', () => {
        it('should invalidate storage-stats query after successful data clear', async () => {
            // Arrange
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: {
                        statsBefore: {
                            totalRuns: 10,
                            totalTests: 50,
                            totalAttachments: 100,
                        },
                    },
                }),
            }

            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            // Spy on queryClient.invalidateQueries
            const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

            // Act
            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData()

            // Assert
            await waitFor(() => {
                expect(invalidateQueriesSpy).toHaveBeenCalledWith({
                    queryKey: ['storage-stats'],
                })
            })
        })

        it('should call fetchTests after successful data clear', async () => {
            // Arrange
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: {
                        statsBefore: {
                            totalRuns: 5,
                            totalTests: 25,
                            totalAttachments: 50,
                        },
                    },
                }),
            }

            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            // Act
            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData()

            // Assert
            await waitFor(() => {
                expect(mockFetchTests).toHaveBeenCalled()
            })
        })

        it('should show success alert with statistics', async () => {
            // Arrange
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: {
                        statsBefore: {
                            totalRuns: 3,
                            totalTests: 15,
                            totalAttachments: 30,
                        },
                    },
                }),
            }

            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            // Act
            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData()

            // Assert
            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(
                    '✅ Success! Cleared 3 runs, 15 results, 30 attachments'
                )
            })
        })

        it('should not clear data if user cancels confirmation', async () => {
            // Arrange
            confirmSpy.mockReturnValue(false)

            const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

            // Act
            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData()

            // Assert
            expect(authFetch.authFetch).not.toHaveBeenCalled()
            expect(invalidateQueriesSpy).not.toHaveBeenCalled()
            expect(mockFetchTests).not.toHaveBeenCalled()
        })

        it('should not invalidate cache on API error', async () => {
            // Arrange
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: false,
                status: 500,
            }

            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

            // Act
            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData()

            // Assert
            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(
                    expect.stringContaining('❌ Failed to clear data')
                )
            })

            expect(invalidateQueriesSpy).not.toHaveBeenCalled()
            expect(mockFetchTests).not.toHaveBeenCalled()
        })

        it('should handle network errors gracefully', async () => {
            // Arrange
            confirmSpy.mockReturnValue(true)

            vi.mocked(authFetch.authFetch).mockRejectedValue(new Error('Network error'))

            const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

            // Act
            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData()

            // Assert
            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith('❌ Failed to clear data: Network error')
            })

            expect(invalidateQueriesSpy).not.toHaveBeenCalled()
            expect(mockFetchTests).not.toHaveBeenCalled()
        })

        it('should reset clearingData state after operation completes', async () => {
            // Arrange
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: {
                        statsBefore: {
                            totalRuns: 1,
                            totalTests: 5,
                            totalAttachments: 10,
                        },
                    },
                }),
            }

            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            // Act
            const {result} = renderHook(() => useDashboardActions(), {wrapper})

            expect(result.current.clearingData).toBe(false)

            await result.current.clearAllData()

            // Assert - should be false after completion
            await waitFor(() => {
                expect(result.current.clearingData).toBe(false)
            })
        })

        it('should handle missing statsBefore in response', async () => {
            // Arrange
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: {},
                }),
            }

            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

            // Act
            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData()

            // Assert
            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(
                    '✅ Success! Cleared 0 runs, 0 results, 0 attachments'
                )
                expect(invalidateQueriesSpy).toHaveBeenCalled()
            })
        })
    })

    describe('clearAllData with a project', () => {
        it('should confirm with a project-specific message and call the scoped endpoint', async () => {
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: true,
                json: async () => ({data: {deletedExecutions: 30}}),
            }
            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData('API_Tests')

            expect(confirmSpy).toHaveBeenCalledWith(
                expect.stringContaining('clear ALL test data for project "API_Tests"')
            )
            const [url] = vi.mocked(authFetch.authFetch).mock.calls[0]
            expect(url).toBe(`${config.api.baseUrl}/tests/all?project=API_Tests`)
        })

        it('should show a project-scoped success alert using deletedExecutions', async () => {
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: true,
                json: async () => ({data: {deletedExecutions: 30}}),
            }
            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData('API_Tests')

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(
                    '✅ Success! Cleared 30 executions for project "API_Tests"'
                )
            })
            expect(mockFetchTests).toHaveBeenCalled()
        })

        it('should URL-encode the project name in the request', async () => {
            confirmSpy.mockReturnValue(true)

            const mockResponse = {
                ok: true,
                json: async () => ({data: {deletedExecutions: 1}}),
            }
            vi.mocked(authFetch.authFetch).mockResolvedValue(mockResponse as any)

            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData('Mobile Chrome')

            const [url] = vi.mocked(authFetch.authFetch).mock.calls[0]
            expect(url).toContain('project=Mobile%20Chrome')
        })

        it('should not call the API when the user cancels the scoped confirmation', async () => {
            confirmSpy.mockReturnValue(false)

            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.clearAllData('API_Tests')

            expect(authFetch.authFetch).not.toHaveBeenCalled()
            expect(mockFetchTests).not.toHaveBeenCalled()
        })
    })

    describe('cleanupData', () => {
        const cleanupResponse = (mode: 'strip' | 'full') => ({
            ok: true,
            json: async () => ({
                data: {deletedExecutions: 4, freedSpace: 2 * 1024 * 1024, mode},
            }),
        })

        it('should default to strip mode and send mode in the request body', async () => {
            vi.mocked(authFetch.authFetch).mockResolvedValue(cleanupResponse('strip') as any)

            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.cleanupData('count', 20)

            const [, options] = vi.mocked(authFetch.authFetch).mock.calls[0]
            expect(JSON.parse((options as any).body)).toEqual({
                type: 'count',
                value: 20,
                mode: 'strip',
            })
        })

        it('should show a history-preserving message in strip mode', async () => {
            vi.mocked(authFetch.authFetch).mockResolvedValue(cleanupResponse('strip') as any)

            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.cleanupData('count', 20, 'strip')

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(
                    '✅ Freed 2.00 MB from 4 executions. Test history kept.'
                )
            })
        })

        it('should send full mode and show a deletion message', async () => {
            vi.mocked(authFetch.authFetch).mockResolvedValue(cleanupResponse('full') as any)

            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.cleanupData('date', '2026-01-01T00:00:00.000Z', 'full')

            const [, options] = vi.mocked(authFetch.authFetch).mock.calls[0]
            expect(JSON.parse((options as any).body).mode).toBe('full')

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(
                    '✅ Cleanup complete! Deleted 4 executions and freed 2.00 MB.'
                )
            })
        })

        it('should invalidate storage-stats after a successful cleanup', async () => {
            vi.mocked(authFetch.authFetch).mockResolvedValue(cleanupResponse('strip') as any)
            const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

            const {result} = renderHook(() => useDashboardActions(), {wrapper})
            await result.current.cleanupData('count', 20)

            await waitFor(() => {
                expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: ['storage-stats']})
                expect(mockFetchTests).toHaveBeenCalled()
            })
        })
    })
})
