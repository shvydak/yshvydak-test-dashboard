import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {render, screen, waitFor, cleanup} from '@testing-library/react'
import {BrowserRouter, MemoryRouter, useSearchParams} from 'react-router-dom'
import TestsList from '../TestsList'
import {useTestsStore} from '../../store/testsStore'
import {TestResult} from '@yshvydak/core'

// Mock the store
vi.mock('../../store/testsStore', () => ({
    useTestsStore: vi.fn(),
}))

// Mock the server-side status-counts hook (react-query) — these tests focus on
// URL/modal/filter wiring and don't need a QueryClientProvider wrapper.
vi.mock('../../hooks/useTestStatusCounts', () => ({
    useTestStatusCounts: () => ({
        counts: {total: 0, passed: 0, failed: 0, skipped: 0, pending: 0, noted: 0},
        isLoading: false,
    }),
}))

// Mock the server-side status-filtered list hook (react-query). Defaults to
// "nothing loaded yet" — individual tests override this to simulate the server
// returning rows the store's (capped) `tests` array doesn't have.
const mockUseFilteredTestsByStatus = vi.fn(
    (_filter?: string, _project?: string, _isAuthenticated?: boolean) => ({
        tests: [] as TestResult[],
        isLoading: false,
    })
)
vi.mock('../../hooks/useFilteredTestsByStatus', () => ({
    useFilteredTestsByStatus: (filter: string, project?: string, isAuthenticated?: boolean) =>
        mockUseFilteredTestsByStatus(filter, project, isAuthenticated),
}))

// Tag mode comes from the shared jira-settings cache (react-query); mocked like the hooks above.
let mockTagMode: 'tickets' | 'all' = 'tickets'
vi.mock('@features/dashboard/hooks/useJiraSettings', () => ({
    useJiraSettings: () => ({
        settings: {baseUrl: '', chipAlignment: 'left', tagMode: mockTagMode},
    }),
}))

// Mock child components to simplify testing
vi.mock('../TestsListFilters', () => ({
    TestsListFilters: () => <div data-testid="filters">Filters</div>,
}))

vi.mock('../TestsContent', () => ({
    TestsContent: ({tests}: {tests: TestResult[]}) => (
        <div data-testid="content" data-count={tests.length}>
            {tests.map((t) => (
                <div key={t.testId} data-testid="content-test">
                    {t.name}
                </div>
            ))}
        </div>
    ),
}))

vi.mock('../testDetail', () => ({
    TestDetailModal: ({isOpen, test}: {isOpen: boolean; test: TestResult | null}) => (
        <div data-testid="modal" data-open={isOpen} data-test-id={test?.testId}>
            {isOpen && test ? `Modal: ${test.name}` : 'Modal closed'}
        </div>
    ),
}))

const mockTests: TestResult[] = [
    {
        id: 'exec-1',
        testId: 'test-abc123',
        name: 'Test 1',
        filePath: '/test1.spec.ts',
        status: 'passed',
        duration: 1000,
        createdAt: '2025-01-01T00:00:00Z',
        runId: 'run-1',
    },
    {
        id: 'exec-2',
        testId: 'test-xyz789',
        name: 'Test 2',
        filePath: '/test2.spec.ts',
        status: 'failed',
        duration: 2000,
        createdAt: '2025-01-01T00:01:00Z',
        runId: 'run-1',
    },
]

describe('TestsList - Shareable URLs', () => {
    const mockOnTestSelect = vi.fn()
    const mockOnTestRerun = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useTestsStore).mockReturnValue({
            tests: mockTests,
            error: null,
        } as any)
        mockUseFilteredTestsByStatus.mockReturnValue({tests: [], isLoading: false})
    })

    describe('Deep Linking - Opening modal from URL', () => {
        it('should open modal automatically when testId is in URL', async () => {
            render(
                <MemoryRouter initialEntries={['/?testId=test-abc123']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            await waitFor(() => {
                const modal = screen.getByTestId('modal')
                expect(modal).toHaveAttribute('data-open', 'true')
                expect(modal).toHaveAttribute('data-test-id', 'test-abc123')
            })

            expect(mockOnTestSelect).toHaveBeenCalledWith(
                expect.objectContaining({testId: 'test-abc123'})
            )
        })

        it('should handle URL with testId that does not exist', async () => {
            render(
                <MemoryRouter initialEntries={['/?testId=nonexistent']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            await waitFor(() => {
                const modal = screen.getByTestId('modal')
                expect(modal).toHaveAttribute('data-open', 'false')
            })

            expect(mockOnTestSelect).not.toHaveBeenCalled()
        })

        it('should not process URL parameters when tests are not loaded yet', () => {
            vi.mocked(useTestsStore).mockReturnValue({
                tests: [],
                error: null,
            } as any)

            render(
                <MemoryRouter initialEntries={['/?testId=test-abc123']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={true}
                    />
                </MemoryRouter>
            )

            expect(mockOnTestSelect).not.toHaveBeenCalled()
        })

        it('should process URL only once to avoid infinite loops', async () => {
            const {rerender} = render(
                <MemoryRouter initialEntries={['/?testId=test-abc123']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            await waitFor(() => {
                expect(mockOnTestSelect).toHaveBeenCalledTimes(1)
            })

            // Rerender should not trigger another call
            rerender(
                <MemoryRouter initialEntries={['/?testId=test-abc123']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            await waitFor(() => {
                expect(mockOnTestSelect).toHaveBeenCalledTimes(1) // Still only 1 call
            })
        })
    })

    describe('Loading and Error States', () => {
        it('should show loading spinner when loading and no tests', () => {
            vi.mocked(useTestsStore).mockReturnValue({
                tests: [],
                error: null,
            } as any)

            render(
                <BrowserRouter>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={true}
                    />
                </BrowserRouter>
            )

            expect(screen.getByText('Loading tests...')).toBeInTheDocument()
        })

        it('should show error message when there is an error', () => {
            vi.mocked(useTestsStore).mockReturnValue({
                tests: [],
                error: 'Failed to load tests',
            } as any)

            render(
                <BrowserRouter>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </BrowserRouter>
            )

            expect(screen.getByText('Error loading tests')).toBeInTheDocument()
            expect(screen.getByText('Failed to load tests')).toBeInTheDocument()
        })

        it('should render content when tests are loaded', () => {
            render(
                <BrowserRouter>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </BrowserRouter>
            )

            expect(screen.getByTestId('filters')).toBeInTheDocument()
            expect(screen.getByTestId('content')).toBeInTheDocument()
        })
    })

    describe('URL Parameter Handling', () => {
        it('should handle URL with testId', async () => {
            render(
                <MemoryRouter initialEntries={['/?testId=test-xyz789']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            await waitFor(() => {
                expect(mockOnTestSelect).toHaveBeenCalledWith(
                    expect.objectContaining({testId: 'test-xyz789'})
                )
            })
        })

        it('should ignore URL when no testId is present', () => {
            render(
                <MemoryRouter initialEntries={['/?someParam=value']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            expect(mockOnTestSelect).not.toHaveBeenCalled()
        })

        it('should handle URL with hyphenated testId', async () => {
            const hyphenatedTest: TestResult = {
                id: 'exec-hyphen',
                testId: 'test-with-many-hyphens',
                name: 'Hyphenated Test',
                filePath: '/hyphen.spec.ts',
                status: 'passed',
                duration: 500,
                createdAt: '2025-01-01T00:00:00Z',
                runId: 'run-1',
            }

            vi.mocked(useTestsStore).mockReturnValue({
                tests: [...mockTests, hyphenatedTest],
                error: null,
            } as any)

            render(
                <MemoryRouter initialEntries={['/?testId=test-with-many-hyphens']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            await waitFor(() => {
                expect(mockOnTestSelect).toHaveBeenCalledWith(
                    expect.objectContaining({testId: 'test-with-many-hyphens'})
                )
            })
        })
    })

    describe('URL Filter Parameter Handling', () => {
        it('should initialize filter from URL parameter', async () => {
            render(
                <MemoryRouter initialEntries={['/?filter=failed']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            // Component should render without errors and filters should be initialized
            expect(screen.getByTestId('filters')).toBeInTheDocument()
        })

        it('should handle valid filter values from URL', async () => {
            const validFilters = ['all', 'passed', 'failed', 'skipped', 'pending']

            for (const filter of validFilters) {
                const {unmount} = render(
                    <MemoryRouter initialEntries={[`/?filter=${filter}`]}>
                        <TestsList
                            onTestSelect={mockOnTestSelect}
                            onTestRerun={mockOnTestRerun}
                            selectedTest={null}
                            loading={false}
                        />
                    </MemoryRouter>
                )

                expect(screen.getByTestId('filters')).toBeInTheDocument()
                unmount()
            }
        })

        it('should ignore invalid filter values in URL', () => {
            render(
                <MemoryRouter initialEntries={['/?filter=invalid']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            // Should still render without errors, defaulting to 'all'
            expect(screen.getByTestId('filters')).toBeInTheDocument()
        })

        it('should handle URL with both filter and testId parameters', async () => {
            render(
                <MemoryRouter initialEntries={['/?filter=failed&testId=test-abc123']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            await waitFor(() => {
                const modal = screen.getByTestId('modal')
                expect(modal).toHaveAttribute('data-open', 'true')
            })

            expect(mockOnTestSelect).toHaveBeenCalledWith(
                expect.objectContaining({testId: 'test-abc123'})
            )
        })

        it('should preserve filter when testId is not found in URL', async () => {
            const TestWrapper = () => {
                const [searchParams] = useSearchParams()
                return (
                    <div>
                        <div data-testid="filter-param">{searchParams.get('filter') || 'none'}</div>
                        <TestsList
                            onTestSelect={mockOnTestSelect}
                            onTestRerun={mockOnTestRerun}
                            selectedTest={null}
                            loading={false}
                        />
                    </div>
                )
            }

            render(
                <MemoryRouter initialEntries={['/?filter=failed&testId=nonexistent']}>
                    <TestWrapper />
                </MemoryRouter>
            )

            // Filter should be preserved even when testId is not found
            await waitFor(() => {
                const filterParam = screen.getByTestId('filter-param')
                expect(filterParam).toHaveTextContent('failed')
            })
        })

        it('should preserve filter when both filter and testId are present', async () => {
            const TestWrapper = () => {
                const [searchParams] = useSearchParams()
                return (
                    <div>
                        <div data-testid="filter-param">{searchParams.get('filter') || 'none'}</div>
                        <div data-testid="test-id-param">
                            {searchParams.get('testId') || 'none'}
                        </div>
                        <TestsList
                            onTestSelect={mockOnTestSelect}
                            onTestRerun={mockOnTestRerun}
                            selectedTest={null}
                            loading={false}
                        />
                    </div>
                )
            }

            render(
                <MemoryRouter initialEntries={['/?filter=failed&testId=test-abc123']}>
                    <TestWrapper />
                </MemoryRouter>
            )

            // Both filter and testId should be in URL
            await waitFor(() => {
                const filterParam = screen.getByTestId('filter-param')
                const testIdParam = screen.getByTestId('test-id-param')
                expect(filterParam).toHaveTextContent('failed')
                expect(testIdParam).toHaveTextContent('test-abc123')
            })

            // Modal should be open
            await waitFor(() => {
                const modal = screen.getByTestId('modal')
                expect(modal).toHaveAttribute('data-open', 'true')
            })
        })

        it('should default to "all" filter when no filter parameter is present', () => {
            render(
                <MemoryRouter initialEntries={['/']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            expect(screen.getByTestId('filters')).toBeInTheDocument()
            expect(screen.getByTestId('content')).toBeInTheDocument()
        })

        it('should handle filter parameter case-sensitively', () => {
            render(
                <MemoryRouter initialEntries={['/?filter=Failed']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            // Invalid filter (capital F), should default to 'all'
            expect(screen.getByTestId('filters')).toBeInTheDocument()
        })

        it('should update filter when URL parameter changes', async () => {
            const {rerender} = render(
                <MemoryRouter initialEntries={['/?filter=passed']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            expect(screen.getByTestId('filters')).toBeInTheDocument()

            // Simulate URL change
            rerender(
                <MemoryRouter initialEntries={['/?filter=failed']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            expect(screen.getByTestId('filters')).toBeInTheDocument()
        })
    })

    describe('Status filter resolves from the server, not the capped store list', () => {
        it('shows a failed test that is absent from the store but present in the server-filtered result', async () => {
            // Reproduces the production bug: the status-counts badge (unlimited
            // aggregate) reports failures the store's capped `tests` array doesn't
            // contain, because that array is paginated/ordered by recency.
            const ghostFailedTest: TestResult = {
                id: 'exec-ghost',
                testId: 'test-ghost',
                name: 'Ghost failed test outside the store window',
                filePath: '/ghost.spec.ts',
                status: 'failed',
                duration: 500,
                createdAt: '2025-01-01T00:00:00Z',
                runId: 'run-ghost',
            }
            mockUseFilteredTestsByStatus.mockReturnValue({
                tests: [ghostFailedTest],
                isLoading: false,
            })

            render(
                <MemoryRouter initialEntries={['/?filter=failed']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            await waitFor(() => {
                expect(
                    screen.getByText('Ghost failed test outside the store window')
                ).toBeInTheDocument()
            })
        })

        it('shows a loading state while the server-filtered result is in flight', () => {
            mockUseFilteredTestsByStatus.mockReturnValue({tests: [], isLoading: true})

            render(
                <MemoryRouter initialEntries={['/?filter=failed']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            expect(screen.queryByTestId('content')).not.toBeInTheDocument()
        })

        it('uses the store list directly for filter "all" (no server round-trip needed)', () => {
            render(
                <BrowserRouter>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </BrowserRouter>
            )

            const content = screen.getByTestId('content')
            expect(content).toHaveAttribute('data-count', String(mockTests.length))
        })
    })

    describe('Search query URL persistence (?q=)', () => {
        it('should render without errors when ?q= param is present', () => {
            render(
                <MemoryRouter initialEntries={['/?q=login']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            expect(screen.getByTestId('filters')).toBeInTheDocument()
            expect(screen.getByTestId('content')).toBeInTheDocument()
        })

        it('should render without errors when ?q= is combined with ?filter=', () => {
            render(
                <MemoryRouter initialEntries={['/?q=login&filter=failed']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            expect(screen.getByTestId('filters')).toBeInTheDocument()
        })

        it('should render without errors when ?q= is empty', () => {
            render(
                <MemoryRouter initialEntries={['/?q=']}>
                    <TestsList
                        onTestSelect={mockOnTestSelect}
                        onTestRerun={mockOnTestRerun}
                        selectedTest={null}
                        loading={false}
                    />
                </MemoryRouter>
            )

            expect(screen.getByTestId('filters')).toBeInTheDocument()
        })
    })
})

describe('TestsList - search by displayed tags', () => {
    const tagged: TestResult[] = [
        {
            id: 'e1',
            testId: 't1',
            name: 'Login works',
            filePath: '/a.spec.ts',
            status: 'passed',
            duration: 1,
            runId: 'r',
            metadata: {tags: ['@ABC-123', '@sanity']},
        },
        {
            id: 'e2',
            testId: 't2',
            name: 'Logout works',
            filePath: '/b.spec.ts',
            status: 'passed',
            duration: 1,
            runId: 'r',
            metadata: {tags: ['@api']},
        },
    ]

    const renderList = (query: string) =>
        render(
            <MemoryRouter initialEntries={[`/?q=${query}`]}>
                <TestsList
                    onTestSelect={vi.fn()}
                    onTestRerun={vi.fn()}
                    selectedTest={null}
                    loading={false}
                />
            </MemoryRouter>
        )

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useTestsStore).mockReturnValue({tests: tagged, error: null} as any)
        mockUseFilteredTestsByStatus.mockReturnValue({tests: [], isLoading: false})
    })

    afterEach(() => {
        mockTagMode = 'tickets'
    })

    it("'tickets' mode: a ticket key finds the test, a non-ticket tag does not", () => {
        renderList('abc-123')
        expect(screen.getAllByTestId('content-test').map((el) => el.textContent)).toEqual([
            'Login works',
        ])
        cleanup()

        renderList('sanity')
        expect(screen.queryAllByTestId('content-test')).toHaveLength(0)
    })

    it("'all' mode: non-ticket tags are searchable too (leading @ ignored)", () => {
        mockTagMode = 'all'

        renderList('%40sanity')

        expect(screen.getAllByTestId('content-test').map((el) => el.textContent)).toEqual([
            'Login works',
        ])
    })
})
