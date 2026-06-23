import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import Header from '../Header'
import {ProjectTabConfig} from '@/hooks/useProjectTabs'

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

const sampleTabs: ProjectTabConfig[] = [
    {project: 'All_Tests', displayName: 'All Tests', visible: true},
    {project: 'Frontend', displayName: 'Frontend', visible: true},
]

describe('Header', () => {
    const mockOnOpenSettings = vi.fn()

    beforeEach(() => {
        mockNavigate.mockClear()
        mockOnOpenSettings.mockClear()
    })

    const renderWithRouter = (ui: React.ReactElement, initialEntries = ['/']) => {
        return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>)
    }

    describe('Navigation - Dashboard icon', () => {
        it('should navigate to /dashboard when Dashboard button is clicked', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header activeProject="" projectTabs={sampleTabs} wsConnected={true} />
            )

            const dashboardButton = screen.getByTitle('Dashboard')
            await user.click(dashboardButton)

            expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
        })
    })

    describe('Navigation - Project tabs', () => {
        it('should navigate to /tests?project=<name> when a project tab is clicked', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header activeProject="" projectTabs={sampleTabs} wsConnected={true} />
            )

            const allTestsTab = screen.getAllByText('All Tests')[0]
            await user.click(allTestsTab)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?project=All_Tests')
        })

        it('should preserve filter parameter when clicking a project tab', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header activeProject="" projectTabs={sampleTabs} wsConnected={true} />,
                ['/tests?filter=failed']
            )

            const frontendTab = screen.getAllByText('Frontend')[0]
            await user.click(frontendTab)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?project=Frontend&filter=failed')
        })

        it('should not include filter param if none is present', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header activeProject="" projectTabs={sampleTabs} wsConnected={true} />,
                ['/tests']
            )

            const allTestsTab = screen.getAllByText('All Tests')[0]
            await user.click(allTestsTab)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?project=All_Tests')
            expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('filter'))
        })
    })

    describe('Navigation - Fallback Tests button', () => {
        it('should show "Tests" button when projectTabs is empty', () => {
            renderWithRouter(<Header activeProject="" projectTabs={[]} wsConnected={true} />)

            expect(screen.getByText('Tests')).toBeInTheDocument()
        })

        it('should navigate to /tests when fallback Tests button is clicked', async () => {
            const user = userEvent.setup()

            renderWithRouter(<Header activeProject="" projectTabs={[]} wsConnected={true} />)

            await user.click(screen.getByText('Tests'))

            expect(mockNavigate).toHaveBeenCalledWith('/tests')
        })
    })

    describe('Visual States', () => {
        it('should highlight active project tab', () => {
            renderWithRouter(
                <Header activeProject="All_Tests" projectTabs={sampleTabs} wsConnected={true} />,
                ['/tests?project=All_Tests']
            )

            const activeTab = screen.getAllByText('All Tests')[0]
            expect(activeTab).toHaveClass('bg-primary-50')
        })

        it('should not highlight inactive project tab', () => {
            renderWithRouter(
                <Header activeProject="All_Tests" projectTabs={sampleTabs} wsConnected={true} />,
                ['/tests?project=All_Tests']
            )

            const inactiveTab = screen.getAllByText('Frontend')[0]
            expect(inactiveTab).not.toHaveClass('bg-primary-50')
        })

        it('should highlight Tests fallback button when on tests page with no tabs', () => {
            renderWithRouter(<Header activeProject="" projectTabs={[]} wsConnected={true} />, [
                '/tests',
            ])

            expect(screen.getByText('Tests')).toHaveClass('bg-primary-50')
        })
    })

    describe('WebSocket Connection Status', () => {
        it('should show connected status when wsConnected is true', () => {
            renderWithRouter(<Header activeProject="" projectTabs={[]} wsConnected={true} />)

            expect(screen.getByText('Live')).toBeInTheDocument()
        })

        it('should show disconnected status when wsConnected is false', () => {
            renderWithRouter(<Header activeProject="" projectTabs={[]} wsConnected={false} />)

            expect(screen.getByText('Offline')).toBeInTheDocument()
        })
    })

    describe('User Menu', () => {
        it('should display user email when user is provided', () => {
            const testUser = {email: 'test@example.com', role: 'admin'}

            renderWithRouter(
                <Header activeProject="" projectTabs={[]} wsConnected={true} user={testUser} />
            )

            expect(screen.getByText('test@example.com')).toBeInTheDocument()
        })

        it('should open settings modal when Settings is clicked', async () => {
            const user = userEvent.setup()
            const testUser = {email: 'test@example.com', role: 'admin'}

            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={[]}
                    wsConnected={true}
                    user={testUser}
                    onOpenSettings={mockOnOpenSettings}
                />
            )

            await user.click(screen.getByText('test@example.com'))
            await user.click(screen.getByText('Settings'))

            expect(mockOnOpenSettings).toHaveBeenCalledTimes(1)
        })
    })

    describe('Multiple navigation clicks', () => {
        it('should handle clicking the same tab twice', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header activeProject="" projectTabs={sampleTabs} wsConnected={true} />,
                ['/tests?filter=failed']
            )

            const tab = screen.getAllByText('All Tests')[0]
            await user.click(tab)
            await user.click(tab)

            expect(mockNavigate).toHaveBeenCalledTimes(2)
            expect(mockNavigate).toHaveBeenCalledWith('/tests?project=All_Tests&filter=failed')
        })
    })

    describe('Edge Cases', () => {
        it('should ignore non-filter query params when building project tab URL', async () => {
            const user = userEvent.setup()

            renderWithRouter(
                <Header activeProject="" projectTabs={sampleTabs} wsConnected={true} />,
                ['/tests?filter=failed&testId=test-123']
            )

            const tab = screen.getAllByText('Frontend')[0]
            await user.click(tab)

            expect(mockNavigate).toHaveBeenCalledWith('/tests?project=Frontend&filter=failed')
        })

        it('should render all provided project tab labels', () => {
            renderWithRouter(
                <Header activeProject="" projectTabs={sampleTabs} wsConnected={true} />
            )

            expect(screen.getAllByText('All Tests').length).toBeGreaterThan(0)
            expect(screen.getAllByText('Frontend').length).toBeGreaterThan(0)
        })
    })
})
