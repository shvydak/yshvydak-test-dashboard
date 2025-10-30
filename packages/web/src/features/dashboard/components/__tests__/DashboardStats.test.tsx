import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {BrowserRouter} from 'react-router-dom'
import {DashboardStats} from '../DashboardStats'
import type {TestResult} from '@yshvydak/core'

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom')
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    }
})

const createTestResult = (overrides?: Partial<TestResult>): TestResult => ({
    id: '1',
    testId: 'test-1',
    name: 'Test 1',
    status: 'passed',
    duration: 1000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    filePath: '/tests/test.spec.ts',
    runId: 'run-1',
    attachments: [],
    ...overrides,
})

describe('DashboardStats', () => {
    beforeEach(() => {
        mockNavigate.mockClear()
    })

    const renderWithRouter = (ui: React.ReactElement) => {
        return render(<BrowserRouter>{ui}</BrowserRouter>)
    }

    describe('Rendering', () => {
        it('should render all stats cards', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'passed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'failed'}),
                createTestResult({id: '3', testId: 'test-3', status: 'skipped'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            expect(
                screen.getByText('Total Tests (not include "skipped" status)')
            ).toBeInTheDocument()
            expect(screen.getByText('Passed')).toBeInTheDocument()
            expect(screen.getByText('Failed')).toBeInTheDocument()
            expect(screen.getByText('Success Rate')).toBeInTheDocument()
        })

        it('should calculate stats correctly from tests', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'passed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'passed'}),
                createTestResult({id: '3', testId: 'test-3', status: 'failed'}),
                createTestResult({id: '4', testId: 'test-4', status: 'skipped'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            // Total tests (excluding skipped): 4 - 1 = 3
            expect(screen.getByText('3')).toBeInTheDocument()
            // Passed: 2
            expect(screen.getByText('2')).toBeInTheDocument()
            // Failed: 1
            expect(screen.getByText('1')).toBeInTheDocument()
            // Success rate: 2/3 = 66.67% rounded to 67%
            expect(screen.getByText('67%')).toBeInTheDocument()
        })

        it('should use provided stats when available', () => {
            const stats = {
                totalTests: 100,
                passedTests: 90,
                failedTests: 5,
                skippedTests: 5,
                successRate: 94.7,
                totalRuns: 10,
                recentRuns: [],
            }

            renderWithRouter(<DashboardStats stats={stats} tests={[]} loading={false} />)

            expect(screen.getByText('95')).toBeInTheDocument() // 100 - 5 (skipped)
            expect(screen.getByText('90')).toBeInTheDocument()
            expect(screen.getByText('5')).toBeInTheDocument()
            expect(screen.getByText('95%')).toBeInTheDocument() // Rounded from 94.7
        })

        it('should show loading state', () => {
            renderWithRouter(<DashboardStats tests={[]} loading={true} />)

            expect(
                screen.getByText('Total Tests (not include "skipped" status)')
            ).toBeInTheDocument()
            expect(screen.getByText('Passed')).toBeInTheDocument()
            expect(screen.getByText('Failed')).toBeInTheDocument()
            expect(screen.getByText('Success Rate')).toBeInTheDocument()
        })
    })

    describe('Navigation - Total Tests Card', () => {
        it('should navigate to /tests?filter=all when Total Tests card is clicked', async () => {
            const user = userEvent.setup()
            const tests: TestResult[] = [createTestResult()]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            const totalCard = screen
                .getByText('Total Tests (not include "skipped" status)')
                .closest('[role="button"]')
            expect(totalCard).toBeInTheDocument()

            if (totalCard) {
                await user.click(totalCard)
            }

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=all')
        })
    })

    describe('Navigation - Passed Card', () => {
        it('should navigate to /tests?filter=passed when Passed card is clicked', async () => {
            const user = userEvent.setup()
            const tests: TestResult[] = [createTestResult({status: 'passed'})]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            const passedCard = screen.getByText('Passed').closest('[role="button"]')
            expect(passedCard).toBeInTheDocument()

            if (passedCard) {
                await user.click(passedCard)
            }

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=passed')
        })
    })

    describe('Navigation - Failed Card', () => {
        it('should navigate to /tests?filter=failed when Failed card is clicked', async () => {
            const user = userEvent.setup()
            const tests: TestResult[] = [createTestResult({status: 'failed'})]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            const failedCard = screen.getByText('Failed').closest('[role="button"]')
            expect(failedCard).toBeInTheDocument()

            if (failedCard) {
                await user.click(failedCard)
            }

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')
        })

        it('should handle clicking Failed card with 0 failures', async () => {
            const user = userEvent.setup()
            const tests: TestResult[] = [createTestResult({status: 'passed'})]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            const failedCard = screen.getByText('Failed').closest('[role="button"]')
            expect(failedCard).toBeInTheDocument()

            if (failedCard) {
                await user.click(failedCard)
            }

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')
        })
    })

    describe('Success Rate Card', () => {
        it('should not be clickable', () => {
            const tests: TestResult[] = [createTestResult()]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            const successRateCard = screen.getByText('Success Rate').closest('div')
            expect(successRateCard?.parentElement).not.toHaveAttribute('role', 'button')
        })

        it('should calculate success rate correctly', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'passed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'passed'}),
                createTestResult({id: '3', testId: 'test-3', status: 'passed'}),
                createTestResult({id: '4', testId: 'test-4', status: 'failed'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            // Success rate: 3/4 = 75%
            expect(screen.getByText('75%')).toBeInTheDocument()
        })

        it('should handle 100% success rate', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'passed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'passed'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            expect(screen.getByText('100%')).toBeInTheDocument()
        })

        it('should handle 0% success rate', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'failed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'failed'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            expect(screen.getByText('0%')).toBeInTheDocument()
        })

        it('should exclude pending tests from success rate calculation', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'passed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'passed'}),
                createTestResult({id: '3', testId: 'test-3', status: 'passed'}),
                createTestResult({id: '4', testId: 'test-4', status: 'passed'}),
                createTestResult({id: '5', testId: 'test-5', status: 'passed'}),
                createTestResult({id: '6', testId: 'test-6', status: 'passed'}),
                createTestResult({id: '7', testId: 'test-7', status: 'passed'}),
                createTestResult({id: '8', testId: 'test-8', status: 'passed'}),
                createTestResult({id: '9', testId: 'test-9', status: 'passed'}),
                createTestResult({id: '10', testId: 'test-10', status: 'passed'}),
                createTestResult({id: '11', testId: 'test-11', status: 'passed'}),
                createTestResult({id: '12', testId: 'test-12', status: 'passed'}),
                createTestResult({id: '13', testId: 'test-13', status: 'passed'}),
                createTestResult({id: '14', testId: 'test-14', status: 'passed'}),
                createTestResult({id: '15', testId: 'test-15', status: 'passed'}),
                createTestResult({id: '16', testId: 'test-16', status: 'failed'}),
                // Add 62 pending tests (should be excluded from success rate)
                ...Array.from({length: 62}, (_, i) =>
                    createTestResult({
                        id: `pending-${i}`,
                        testId: `pending-${i}`,
                        status: 'pending',
                    })
                ),
                // Add 1 skipped test (should also be excluded)
                createTestResult({id: 'skipped-1', testId: 'skipped-1', status: 'skipped'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            // Success rate should be: 15 passed / (15 passed + 1 failed) = 15/16 = 93.75% ≈ 94%
            // NOT 15 / (79 - 1 skipped) = 15/78 = 19%
            expect(screen.getByText('94%')).toBeInTheDocument()
        })

        it('should exclude skipped tests from success rate calculation', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'passed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'passed'}),
                createTestResult({id: '3', testId: 'test-3', status: 'failed'}),
                createTestResult({id: '4', testId: 'test-4', status: 'skipped'}),
                createTestResult({id: '5', testId: 'test-5', status: 'skipped'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            // Success rate: 2 passed / (2 passed + 1 failed) = 2/3 = 66.67% ≈ 67%
            // Skipped tests should NOT be included in denominator
            expect(screen.getByText('67%')).toBeInTheDocument()
        })
    })

    describe('Edge Cases', () => {
        it('should handle empty tests array', () => {
            renderWithRouter(<DashboardStats tests={[]} loading={false} />)

            // Multiple cards show "0", so use getAllByText
            const zeroElements = screen.getAllByText('0')
            expect(zeroElements.length).toBeGreaterThanOrEqual(3) // Total, Passed, Failed all show 0

            expect(screen.getByText('0%')).toBeInTheDocument() // Success rate
        })

        it('should handle only skipped tests', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'skipped'}),
                createTestResult({id: '2', testId: 'test-2', status: 'skipped'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            // Multiple cards show "0", so check that at least one exists
            const zeroElements = screen.getAllByText('0')
            expect(zeroElements.length).toBeGreaterThanOrEqual(1)
        })

        it('should handle mixed test statuses', () => {
            const tests: TestResult[] = [
                createTestResult({status: 'passed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'failed'}),
                createTestResult({id: '3', testId: 'test-3', status: 'skipped'}),
                createTestResult({id: '4', testId: 'test-4', status: 'pending'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            // Total: 4 - 1 (skipped) = 3
            expect(screen.getByText('3')).toBeInTheDocument()

            // Both Passed and Failed show "1", so use getAllByText
            const oneElements = screen.getAllByText('1')
            expect(oneElements.length).toBe(2) // Passed: 1, Failed: 1
        })
    })

    describe('Multiple Clicks', () => {
        it('should handle multiple clicks on the same card', async () => {
            const user = userEvent.setup()
            const tests: TestResult[] = [createTestResult({status: 'failed'})]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            const failedCard = screen.getByText('Failed').closest('[role="button"]')

            if (failedCard) {
                await user.click(failedCard)
                await user.click(failedCard)
            }

            expect(mockNavigate).toHaveBeenCalledTimes(2)
            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')
        })

        it('should handle clicks on different cards', async () => {
            const user = userEvent.setup()
            const tests: TestResult[] = [
                createTestResult({status: 'passed'}),
                createTestResult({id: '2', testId: 'test-2', status: 'failed'}),
            ]

            renderWithRouter(<DashboardStats tests={tests} loading={false} />)

            const passedCard = screen.getByText('Passed').closest('[role="button"]')
            const failedCard = screen.getByText('Failed').closest('[role="button"]')

            if (passedCard) {
                await user.click(passedCard)
            }
            if (failedCard) {
                await user.click(failedCard)
            }

            expect(mockNavigate).toHaveBeenCalledTimes(2)
            expect(mockNavigate).toHaveBeenNthCalledWith(1, '/tests?filter=passed')
            expect(mockNavigate).toHaveBeenNthCalledWith(2, '/tests?filter=failed')
        })
    })
})
