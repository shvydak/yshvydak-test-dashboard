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
    {
        project: 'All_Tests',
        displayName: 'All Tests',
        visible: true,
        inPipeline: false,
        stopPipelineOnFailure: false,
    },
    {
        project: 'Frontend',
        displayName: 'Frontend',
        visible: true,
        inPipeline: false,
        stopPipelineOnFailure: false,
    },
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

            const activeTab = screen.getAllByText('All Tests')[0].closest('button')
            expect(activeTab).toHaveClass('bg-primary-50')
        })

        it('should not highlight inactive project tab', () => {
            renderWithRouter(
                <Header activeProject="All_Tests" projectTabs={sampleTabs} wsConnected={true} />,
                ['/tests?project=All_Tests']
            )

            const inactiveTab = screen.getAllByText('Frontend')[0].closest('button')
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

    describe('Project status badge (general, any trigger)', () => {
        it('should render no badge when there is no summary data', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    projectStatusSummary={[]}
                />
            )

            expect(screen.queryByText(/passed|failed/)).not.toBeInTheDocument()
        })

        it('should show a green passed badge when nothing has failed', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    projectStatusSummary={[
                        {project: 'All_Tests', total: 62, passed: 62, failed: 0},
                    ]}
                />
            )

            expect(screen.getAllByText('62 passed').length).toBeGreaterThan(0)
        })

        it('should show only the failed count (not passed) when at least one test failed', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    projectStatusSummary={[{project: 'All_Tests', total: 8, passed: 5, failed: 3}]}
                />
            )

            expect(screen.getAllByText('3 failed').length).toBeGreaterThan(0)
            expect(screen.queryByText(/5 passed/)).not.toBeInTheDocument()
        })

        it('should not show a badge for a tab with no matching summary entry', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    projectStatusSummary={[
                        {project: 'Some_Other_Project', total: 10, passed: 10, failed: 0},
                    ]}
                />
            )

            expect(screen.queryByText(/passed|failed/)).not.toBeInTheDocument()
        })

        it('should update the badge when the same project gets a new summary (e.g. after a manual rerun)', () => {
            const {rerender} = renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    projectStatusSummary={[
                        {project: 'All_Tests', total: 68, passed: 63, failed: 5},
                    ]}
                />
            )
            expect(screen.getAllByText('5 failed').length).toBeGreaterThan(0)

            rerender(
                <MemoryRouter initialEntries={['/']}>
                    <Header
                        activeProject=""
                        projectTabs={sampleTabs}
                        wsConnected={true}
                        projectStatusSummary={[
                            {project: 'All_Tests', total: 68, passed: 64, failed: 4},
                        ]}
                    />
                </MemoryRouter>
            )
            expect(screen.getAllByText('4 failed').length).toBeGreaterThan(0)
            expect(screen.queryByText(/5 failed/)).not.toBeInTheDocument()
        })
    })

    describe('Running/queued dot (shared across manual runs and the pipeline)', () => {
        it('should show a running dot for a project in runningProjects, with no pipeline at all', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    pipeline={null}
                    runningProjects={new Set(['All_Tests'])}
                />
            )

            const tab = screen.getAllByText('All Tests')[0].closest('button')
            expect(tab?.querySelector('[data-testid="tab-status-running"]')).toBeTruthy()
        })

        it('should show a queued dot only for a project waiting in an actively running pipeline', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    pipeline={{
                        pipelineRunId: 'p1',
                        status: 'running',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        steps: [
                            {
                                project: 'All_Tests',
                                displayName: 'All Tests',
                                stopOnFailure: false,
                                status: 'queued',
                            },
                        ],
                    }}
                    runningProjects={new Set()}
                />
            )

            const tab = screen.getAllByText('All Tests')[0].closest('button')
            expect(tab?.querySelector('[data-testid="tab-status-queued"]')).toBeTruthy()
        })

        it('should not show a queued dot once the pipeline has finished', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    pipeline={{
                        pipelineRunId: 'p2',
                        status: 'stopped_early',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        steps: [
                            {
                                project: 'All_Tests',
                                displayName: 'All Tests',
                                stopOnFailure: false,
                                status: 'queued',
                            },
                        ],
                    }}
                    runningProjects={new Set()}
                />
            )

            const tab = screen.getAllByText('All Tests')[0].closest('button')
            expect(tab?.querySelector('[data-testid="tab-status-queued"]')).toBeFalsy()
        })

        it('should prefer the running dot over the queued dot when both would apply', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    pipeline={{
                        pipelineRunId: 'p3',
                        status: 'running',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        steps: [
                            {
                                project: 'All_Tests',
                                displayName: 'All Tests',
                                stopOnFailure: false,
                                status: 'queued',
                            },
                        ],
                    }}
                    runningProjects={new Set(['All_Tests'])}
                />
            )

            const tab = screen.getAllByText('All Tests')[0].closest('button')
            expect(tab?.querySelector('[data-testid="tab-status-running"]')).toBeTruthy()
            expect(tab?.querySelector('[data-testid="tab-status-queued"]')).toBeFalsy()
        })

        it('labels the queued icon with its position in the pipeline', () => {
            renderWithRouter(
                <Header
                    activeProject=""
                    projectTabs={sampleTabs}
                    wsConnected={true}
                    pipeline={{
                        pipelineRunId: 'p4',
                        status: 'running',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        steps: [
                            {
                                project: 'Frontend',
                                displayName: 'Frontend',
                                stopOnFailure: false,
                                status: 'running',
                            },
                            {
                                project: 'All_Tests',
                                displayName: 'All Tests',
                                stopOnFailure: false,
                                status: 'queued',
                            },
                        ],
                    }}
                    runningProjects={new Set()}
                />
            )

            const tab = screen.getAllByText('All Tests')[0].closest('button')
            const queuedIcon = tab?.querySelector('[data-testid="tab-status-queued"]')
            expect(queuedIcon).toHaveAttribute('aria-label', 'Queued — step 2 of 2')
        })
    })
})
