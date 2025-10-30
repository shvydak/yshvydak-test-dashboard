import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import Header from '../Header'

// Mock useTheme hook
vi.mock('@/hooks/useTheme', () => ({
    useTheme: () => ({isDark: false}),
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom')
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    }
})

describe('Header - Filter Preservation', () => {
    const mockOnViewChange = vi.fn()
    const mockOnOpenSettings = vi.fn()

    beforeEach(() => {
        mockNavigate.mockClear()
        mockOnViewChange.mockClear()
        mockOnOpenSettings.mockClear()
    })

    const renderWithRouter = (ui: React.ReactElement, initialEntries = ['/']) => {
        return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>)
    }

    describe('Navigation - Dashboard', () => {
        it('should navigate to /dashboard when Dashboard button is clicked', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header currentView="tests" onViewChange={mockOnViewChange} wsConnected={true} />
            )

            const dashboardButton = screen.getByText('Dashboard')
            await user.click(dashboardButton)

            expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
            expect(mockOnViewChange).toHaveBeenCalledWith('dashboard')
        })

        it('should not preserve filter when navigating to dashboard', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header currentView="tests" onViewChange={mockOnViewChange} wsConnected={true} />,
                ['/?filter=failed']
            )

            const dashboardButton = screen.getByText('Dashboard')
            await user.click(dashboardButton)

            expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
            expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('filter'))
        })
    })

    describe('Navigation - Tests', () => {
        it('should navigate to /tests when Tests button is clicked', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests')
            expect(mockOnViewChange).toHaveBeenCalledWith('tests')
        })

        it('should preserve filter parameter when navigating to tests', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/?filter=failed']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')
            expect(mockOnViewChange).toHaveBeenCalledWith('tests')
        })

        it('should preserve "passed" filter when navigating to tests', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/?filter=passed']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=passed')
        })

        it('should preserve "skipped" filter when navigating to tests', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/?filter=skipped']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=skipped')
        })

        it('should preserve "pending" filter when navigating to tests', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/?filter=pending']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=pending')
        })

        it('should navigate to /tests without filter when no filter is present', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests')
            expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('filter'))
        })
    })

    describe('Visual States', () => {
        it('should highlight Dashboard button when on dashboard view', () => {
            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />
            )

            const dashboardButton = screen.getByText('Dashboard')
            expect(dashboardButton).toHaveClass('bg-primary-100')
        })

        it('should highlight Tests button when on tests view', () => {
            renderWithRouter(
                <Header currentView="tests" onViewChange={mockOnViewChange} wsConnected={true} />
            )

            const testsButton = screen.getByText('Tests')
            expect(testsButton).toHaveClass('bg-primary-100')
        })

        it('should not highlight Dashboard button when on tests view', () => {
            renderWithRouter(
                <Header currentView="tests" onViewChange={mockOnViewChange} wsConnected={true} />
            )

            const dashboardButton = screen.getByText('Dashboard')
            expect(dashboardButton).not.toHaveClass('bg-primary-100')
        })

        it('should not highlight Tests button when on dashboard view', () => {
            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />
            )

            const testsButton = screen.getByText('Tests')
            expect(testsButton).not.toHaveClass('bg-primary-100')
        })
    })

    describe('WebSocket Connection Status', () => {
        it('should show connected status when wsConnected is true', () => {
            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />
            )

            expect(screen.getByText('Live Updates')).toBeInTheDocument()
        })

        it('should show disconnected status when wsConnected is false', () => {
            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={false}
                />
            )

            expect(screen.getByText('Disconnected')).toBeInTheDocument()
        })
    })

    describe('User Menu', () => {
        it('should display user email when user is provided', () => {
            const user = {email: 'test@example.com', role: 'admin'}

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                    user={user}
                />
            )

            expect(screen.getByText('test@example.com')).toBeInTheDocument()
        })

        it('should open settings modal when Settings is clicked', async () => {
            const user = userEvent.setup()
            const testUser = {email: 'test@example.com', role: 'admin'}

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                    user={testUser}
                    onOpenSettings={mockOnOpenSettings}
                />
            )

            // Click on user menu button
            const userButton = screen.getByText('test@example.com')
            await user.click(userButton)

            // Click on Settings option
            const settingsButton = screen.getByText('⚙️ Settings')
            await user.click(settingsButton)

            expect(mockOnOpenSettings).toHaveBeenCalledTimes(1)
        })
    })

    describe('Multiple Navigation Actions', () => {
        it('should handle multiple navigation clicks', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/?filter=failed']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledTimes(2)
            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')
        })

        it('should handle switching between views', async () => {
            const user = userEvent.setup()

            const {rerender} = renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/?filter=failed']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')

            // Switch to tests view and then back to dashboard
            rerender(
                <MemoryRouter initialEntries={['/?filter=failed']}>
                    <Header
                        currentView="tests"
                        onViewChange={mockOnViewChange}
                        wsConnected={true}
                    />
                </MemoryRouter>
            )

            const dashboardButton = screen.getByText('Dashboard')
            await user.click(dashboardButton)

            expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
        })
    })

    describe('Edge Cases', () => {
        it('should handle navigation with multiple query parameters', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/?filter=failed&testId=test-123']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            // Should preserve filter but navigation will handle testId separately
            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')
        })

        it('should handle navigation from tests back to tests', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header currentView="tests" onViewChange={mockOnViewChange} wsConnected={true} />,
                ['/?filter=passed']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=passed')
        })

        it('should handle navigation with special characters in filter', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header
                    currentView="dashboard"
                    onViewChange={mockOnViewChange}
                    wsConnected={true}
                />,
                ['/?filter=failed&other=value%20with%20spaces']
            )

            const testsButton = screen.getByText('Tests')
            await user.click(testsButton)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?filter=failed')
        })
    })
})
