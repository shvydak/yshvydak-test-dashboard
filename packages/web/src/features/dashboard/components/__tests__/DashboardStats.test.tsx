import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {BrowserRouter} from 'react-router-dom'
import {DashboardStats} from '../DashboardStats'
import type {TestStatusCounts} from '@features/tests/hooks/useTestStatusCounts'

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom')
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    }
})

const createCounts = (overrides?: Partial<TestStatusCounts>): TestStatusCounts => ({
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    noted: 0,
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
            const counts = createCounts({total: 3, passed: 1, failed: 1, skipped: 1})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

            expect(screen.getByText('Total Tests')).toBeInTheDocument()
            expect(screen.getByText('Passed')).toBeInTheDocument()
            expect(screen.getByText('Failed')).toBeInTheDocument()
            expect(screen.getByText('Success Rate')).toBeInTheDocument()
        })

        it('should display the unlimited counts as given, unaltered', () => {
            const counts = createCounts({total: 100, passed: 90, failed: 5, skipped: 5})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

            expect(screen.getByText('95')).toBeInTheDocument() // 100 - 5 (skipped)
            expect(screen.getByText('90')).toBeInTheDocument()
            expect(screen.getByText('5')).toBeInTheDocument()
            expect(screen.getByText('95%')).toBeInTheDocument() // 90 / (90 + 5) ≈ 94.7 → 95
        })

        it('should show loading skeletons instead of values while loading', () => {
            renderWithRouter(<DashboardStats counts={createCounts()} loading={true} />)

            expect(screen.getByText('Total Tests')).toBeInTheDocument()
            expect(screen.getByText('Passed')).toBeInTheDocument()
            expect(screen.getByText('Failed')).toBeInTheDocument()
            expect(screen.getByText('Success Rate')).toBeInTheDocument()
            expect(screen.queryByText('0%')).not.toBeInTheDocument()
        })
    })

    describe('Navigation - Total Tests Card', () => {
        it('should navigate to /tests?filter=all when Total Tests card is clicked', async () => {
            const user = userEvent.setup()
            renderWithRouter(
                <DashboardStats counts={createCounts({total: 1, passed: 1})} loading={false} />
            )

            const totalCard = screen.getByText('Total Tests').closest('[role="button"]')
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
            renderWithRouter(
                <DashboardStats counts={createCounts({total: 1, passed: 1})} loading={false} />
            )

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
            renderWithRouter(
                <DashboardStats counts={createCounts({total: 1, failed: 1})} loading={false} />
            )

            const failedCard = screen.getByText('Failed').closest('[role="button"]')
            expect(failedCard).toBeInTheDocument()

            if (failedCard) {
                await user.click(failedCard)
            }

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')
        })

        it('should handle clicking Failed card with 0 failures', async () => {
            const user = userEvent.setup()
            renderWithRouter(
                <DashboardStats counts={createCounts({total: 1, passed: 1})} loading={false} />
            )

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
            renderWithRouter(
                <DashboardStats counts={createCounts({total: 1, passed: 1})} loading={false} />
            )

            const successRateCard = screen.getByText('Success Rate').closest('div')
            expect(successRateCard?.parentElement).not.toHaveAttribute('role', 'button')
        })

        it('should calculate success rate correctly', () => {
            const counts = createCounts({total: 4, passed: 3, failed: 1})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

            // Success rate: 3/4 = 75%
            expect(screen.getByText('75%')).toBeInTheDocument()
        })

        it('should handle 100% success rate', () => {
            const counts = createCounts({total: 2, passed: 2})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

            expect(screen.getByText('100%')).toBeInTheDocument()
        })

        it('should handle 0% success rate', () => {
            const counts = createCounts({total: 2, failed: 2})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

            expect(screen.getByText('0%')).toBeInTheDocument()
        })

        it('should exclude pending tests from success rate calculation', () => {
            // 15 passed, 1 failed, 62 pending, 1 skipped — pending/skipped must not
            // dilute the denominator (would otherwise read 15/78 ≈ 19% instead of 94%)
            const counts = createCounts({
                total: 79,
                passed: 15,
                failed: 1,
                pending: 62,
                skipped: 1,
            })

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

            expect(screen.getByText('94%')).toBeInTheDocument()
        })

        it('should exclude skipped tests from success rate calculation', () => {
            const counts = createCounts({total: 5, passed: 2, failed: 1, skipped: 2})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

            // Success rate: 2 passed / (2 passed + 1 failed) = 2/3 ≈ 67%
            expect(screen.getByText('67%')).toBeInTheDocument()
        })
    })

    describe('Edge Cases', () => {
        it('should handle all-zero counts', () => {
            renderWithRouter(<DashboardStats counts={createCounts()} loading={false} />)

            // Multiple cards show "0", so use getAllByText
            const zeroElements = screen.getAllByText('0')
            expect(zeroElements.length).toBeGreaterThanOrEqual(3) // Total, Passed, Failed all show 0

            expect(screen.getByText('0%')).toBeInTheDocument() // Success rate
        })

        it('should handle only skipped tests', () => {
            const counts = createCounts({total: 2, skipped: 2})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

            // Multiple cards show "0", so check that at least one exists
            const zeroElements = screen.getAllByText('0')
            expect(zeroElements.length).toBeGreaterThanOrEqual(1)
        })

        it('should handle mixed test statuses', () => {
            const counts = createCounts({total: 4, passed: 1, failed: 1, skipped: 1, pending: 1})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

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
            renderWithRouter(
                <DashboardStats counts={createCounts({total: 1, failed: 1})} loading={false} />
            )

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
            const counts = createCounts({total: 2, passed: 1, failed: 1})

            renderWithRouter(<DashboardStats counts={counts} loading={false} />)

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
