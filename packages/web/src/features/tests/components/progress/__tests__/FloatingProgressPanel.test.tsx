/**
 * Tests for FloatingProgressPanel Component
 *
 * Main progress tracking UI displaying real-time test execution status.
 *
 * Test Coverage:
 * - Conditional rendering (only when activeProgress exists)
 * - Minimize/maximize functionality
 * - Progress statistics display
 * - Running tests list
 * - Time estimates
 * - Auto-hide after completion
 * - User interactions (close, minimize)
 *
 * Target Coverage: 85%+
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {FloatingProgressPanel} from '../FloatingProgressPanel'
import {useTestsStore} from '@features/tests/store/testsStore'
import type {TestProgress} from '@yshvydak/core'

// Mock the store
vi.mock('@features/tests/store/testsStore', () => ({
    useTestsStore: vi.fn(),
}))

// Mock TestDetailModal and its dependencies to avoid needing QueryClientProvider
vi.mock('@features/tests/components/testDetail/TestDetailModal', () => ({
    TestDetailModal: vi.fn(() => null),
}))

// Mock useWebSocket hook used by TestDetailModal
vi.mock('@/hooks/useWebSocket', () => ({
    useWebSocket: vi.fn(),
}))

describe('FloatingProgressPanel', () => {
    let mockActiveProgress: TestProgress
    let mockClearProgress: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.useFakeTimers()

        mockClearProgress = vi.fn()

        mockActiveProgress = {
            processId: 'run-123',
            type: 'run-all',
            totalTests: 10,
            completedTests: 5,
            passedTests: 3,
            failedTests: 1,
            skippedTests: 1,
            runningTests: [
                {
                    testId: 'test-1',
                    name: 'Login test',
                    filePath: 'auth/login.spec.ts',
                    currentStep: 'Entering password',
                    stepProgress: {current: 2, total: 4},
                    startedAt: new Date().toISOString(),
                },
            ],
            startTime: Date.now() - 5000, // Started 5 seconds ago
            estimatedEndTime: Date.now() + 10000, // 10 seconds remaining
        }

        vi.mocked(useTestsStore).mockReturnValue({
            activeProgress: mockActiveProgress,
            clearProgress: mockClearProgress,
            tests: [], // Add tests array for test lookup
        } as any)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('Conditional Rendering', () => {
        it('should not render when activeProgress is null', () => {
            vi.mocked(useTestsStore).mockReturnValue({
                activeProgress: null,
                clearProgress: mockClearProgress,
                tests: [],
            } as any)

            render(<FloatingProgressPanel />)

            // TestDetailModal is mocked to return null, so container should be empty
            // The actual panel content should not be rendered
            expect(screen.queryByText('Running Tests')).not.toBeInTheDocument()
        })

        it('should render when activeProgress exists', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText('Running Tests')).toBeInTheDocument()
        })
    })

    describe('Progress Statistics', () => {
        it('should display total and completed tests', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText(/5 of 10 tests/)).toBeInTheDocument()
        })

        it('should display percentage', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText('50%')).toBeInTheDocument()
        })

        it('should display passed tests count', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText('3')).toBeInTheDocument()
        })

        it('should display failed tests count', () => {
            const {container} = render(<FloatingProgressPanel />)

            // Check for failed count in the stats section
            const statsSection = container.querySelector('.grid.grid-cols-2')
            expect(statsSection).toBeInTheDocument()
            expect(statsSection?.textContent).toContain('Failed:')
            expect(statsSection?.textContent).toContain('1')
        })

        it('should display skipped tests count', () => {
            const {container} = render(<FloatingProgressPanel />)

            // Check for skipped count in the stats section
            const statsSection = container.querySelector('.grid.grid-cols-2')
            expect(statsSection).toBeInTheDocument()
            expect(statsSection?.textContent).toContain('Skipped:')
            expect(statsSection?.textContent).toContain('1')
        })

        it('should display pending tests count', () => {
            const {container} = render(<FloatingProgressPanel />)

            // Pending = totalTests - completedTests = 10 - 5 = 5
            const statsSection = container.querySelector('.grid.grid-cols-2')
            expect(statsSection).toBeInTheDocument()
            expect(statsSection?.textContent).toContain('Pending:')
            expect(statsSection?.textContent).toContain('5')
        })
    })

    describe('Running Tests Display', () => {
        it('should display currently running tests', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText('Login test')).toBeInTheDocument()
            expect(screen.getByText('auth/login.spec.ts')).toBeInTheDocument()
        })

        it('should display current step', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText(/Entering password/)).toBeInTheDocument()
        })

        it('should display step progress', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText('(2/4)')).toBeInTheDocument()
        })

        it('should limit display to 3 running tests', () => {
            const manyRunningTests: TestProgress = {
                ...mockActiveProgress,
                runningTests: [
                    {
                        testId: 'test-1',
                        name: 'Test 1',
                        filePath: 'test1.spec.ts',
                        startedAt: new Date().toISOString(),
                    },
                    {
                        testId: 'test-2',
                        name: 'Test 2',
                        filePath: 'test2.spec.ts',
                        startedAt: new Date().toISOString(),
                    },
                    {
                        testId: 'test-3',
                        name: 'Test 3',
                        filePath: 'test3.spec.ts',
                        startedAt: new Date().toISOString(),
                    },
                    {
                        testId: 'test-4',
                        name: 'Test 4',
                        filePath: 'test4.spec.ts',
                        startedAt: new Date().toISOString(),
                    },
                    {
                        testId: 'test-5',
                        name: 'Test 5',
                        filePath: 'test5.spec.ts',
                        startedAt: new Date().toISOString(),
                    },
                ],
            }

            vi.mocked(useTestsStore).mockReturnValue({
                activeProgress: manyRunningTests,
                clearProgress: mockClearProgress,
                tests: [],
            } as any)

            render(<FloatingProgressPanel />)

            expect(screen.getByText('+2 more...')).toBeInTheDocument()
        })

        it('should not display running tests section when no tests running', () => {
            const noRunningTests: TestProgress = {
                ...mockActiveProgress,
                runningTests: [],
            }

            vi.mocked(useTestsStore).mockReturnValue({
                activeProgress: noRunningTests,
                clearProgress: mockClearProgress,
                tests: [],
            } as any)

            render(<FloatingProgressPanel />)

            expect(screen.queryByText('Currently Running:')).not.toBeInTheDocument()
        })
    })

    describe('Minimize/Maximize', () => {
        it('should start in expanded state', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText('Running Tests')).toBeInTheDocument()
            expect(screen.getByRole('button', {name: /minimize/i})).toBeInTheDocument()
        })

        it('should minimize when minimize button is clicked', () => {
            render(<FloatingProgressPanel />)

            const minimizeButton = screen.getByRole('button', {name: /minimize/i})
            fireEvent.click(minimizeButton)

            expect(screen.queryByText('Running Tests')).not.toBeInTheDocument()
            expect(screen.getByText('5/10 tests')).toBeInTheDocument()
        })

        it('should expand when clicked in minimized state', () => {
            render(<FloatingProgressPanel />)

            // Minimize
            const minimizeButton = screen.getByRole('button', {name: /minimize/i})
            fireEvent.click(minimizeButton)

            // Expand by clicking the minimized panel
            const minimizedPanel = screen.getByRole('button', {name: /expand progress panel/i})
            fireEvent.click(minimizedPanel)

            expect(screen.getByText('Running Tests')).toBeInTheDocument()
        })

        it('should show percentage in minimized state', () => {
            render(<FloatingProgressPanel />)

            const minimizeButton = screen.getByRole('button', {name: /minimize/i})
            fireEvent.click(minimizeButton)

            expect(screen.getByText('50%')).toBeInTheDocument()
        })
    })

    describe('Close Functionality', () => {
        it('should call clearProgress when close button is clicked', () => {
            render(<FloatingProgressPanel />)

            const closeButton = screen.getByRole('button', {name: /close/i})
            fireEvent.click(closeButton)

            expect(mockClearProgress).toHaveBeenCalled()
        })
    })

    describe('Auto-hide After Completion', () => {
        it(
            'should auto-hide after 5 seconds when all tests completed',
            async () => {
                const completedProgress: TestProgress = {
                    ...mockActiveProgress,
                    completedTests: 10,
                    totalTests: 10,
                }

                vi.mocked(useTestsStore).mockReturnValue({
                    activeProgress: completedProgress,
                    clearProgress: mockClearProgress,
                    tests: [],
                } as any)

                render(<FloatingProgressPanel />)

                // Fast-forward time by 5 seconds + fade animation
                await vi.advanceTimersByTimeAsync(5300)

                // Check if clearProgress was called
                expect(mockClearProgress).toHaveBeenCalled()
            },
            {timeout: 15000}
        )

        it('should not auto-hide if tests are still running', async () => {
            render(<FloatingProgressPanel />)

            // Fast-forward time by 10 seconds
            await vi.advanceTimersByTimeAsync(10000)

            expect(mockClearProgress).not.toHaveBeenCalled()
        })
    })

    describe('Time Display', () => {
        it('should format elapsed time correctly', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText(/Elapsed:/)).toBeInTheDocument()
            expect(screen.getByText(/5s/)).toBeInTheDocument()
        })

        it('should format estimated remaining time correctly', () => {
            render(<FloatingProgressPanel />)

            expect(screen.getByText(/Est\. remaining:/)).toBeInTheDocument()
            expect(screen.getByText(/~10s/)).toBeInTheDocument()
        })

        it('should not show estimated time if not available', () => {
            const noEstimate: TestProgress = {
                ...mockActiveProgress,
                estimatedEndTime: undefined,
            }

            vi.mocked(useTestsStore).mockReturnValue({
                activeProgress: noEstimate,
                clearProgress: mockClearProgress,
                tests: [],
            } as any)

            render(<FloatingProgressPanel />)

            expect(screen.queryByText(/Est\. remaining:/)).not.toBeInTheDocument()
        })

        it('should not show negative estimated time', () => {
            const pastEstimate: TestProgress = {
                ...mockActiveProgress,
                estimatedEndTime: Date.now() - 1000, // 1 second in the past
            }

            vi.mocked(useTestsStore).mockReturnValue({
                activeProgress: pastEstimate,
                clearProgress: mockClearProgress,
                tests: [],
            } as any)

            render(<FloatingProgressPanel />)

            expect(screen.queryByText(/Est\. remaining:/)).not.toBeInTheDocument()
        })
    })

    describe('Edge Cases', () => {
        it('should handle 0% progress', () => {
            const zeroProgress: TestProgress = {
                ...mockActiveProgress,
                completedTests: 0,
            }

            vi.mocked(useTestsStore).mockReturnValue({
                activeProgress: zeroProgress,
                clearProgress: mockClearProgress,
                tests: [],
            } as any)

            render(<FloatingProgressPanel />)

            expect(screen.getByText('0%')).toBeInTheDocument()
        })

        it('should handle 100% progress', () => {
            const fullProgress: TestProgress = {
                ...mockActiveProgress,
                completedTests: 10,
            }

            vi.mocked(useTestsStore).mockReturnValue({
                activeProgress: fullProgress,
                clearProgress: mockClearProgress,
                tests: [],
            } as any)

            render(<FloatingProgressPanel />)

            expect(screen.getByText('100%')).toBeInTheDocument()
        })

        it('should handle division by zero (no totalTests)', () => {
            const noTotalTests: TestProgress = {
                ...mockActiveProgress,
                totalTests: 0,
                completedTests: 0,
            }

            vi.mocked(useTestsStore).mockReturnValue({
                activeProgress: noTotalTests,
                clearProgress: mockClearProgress,
                tests: [],
            } as any)

            const {container} = render(<FloatingProgressPanel />)

            // Should not crash
            expect(container).toBeInTheDocument()
        })
    })
})
