import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, waitFor} from '@testing-library/react'
import {MemoryRouter, useSearchParams} from 'react-router-dom'
import {TestResult} from '@yshvydak/core'
import Dashboard from '../Dashboard'

const mockGetLatestByTestId = vi.fn()
vi.mock('@/services/testLink.service', () => ({
    testLinkService: {getLatestByTestId: (id: string) => mockGetLatestByTestId(id)},
}))

const fetchTests = vi.fn()
let storeTests: TestResult[] = []
vi.mock('@features/tests/store/testsStore', () => ({
    useTestsStore: () => ({tests: storeTests, fetchTests, lastUpdated: null}),
}))
vi.mock('@features/tests/hooks/useTestStatusCounts', () => ({
    useTestStatusCounts: () => ({
        counts: {total: 0, passed: 0, failed: 0, skipped: 0, pending: 0, noted: 0},
        isLoading: false,
        error: null,
    }),
}))
vi.mock('../../hooks', () => ({
    useFlakyTests: () => ({
        data: [],
        isLoading: false,
        days: 7,
        threshold: 2,
        updateDays: vi.fn(),
        updateThreshold: vi.fn(),
    }),
    useTestTimeline: () => ({data: [], isLoading: false}),
}))
vi.mock('../DashboardStats', () => ({DashboardStats: () => <div />}))
vi.mock('recharts', () => ({
    AreaChart: () => null,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: () => null,
}))
vi.mock('@tanstack/react-query', () => ({useQueryClient: () => ({invalidateQueries: vi.fn()})}))
vi.mock('@/hooks/useWebSocket', () => ({useWebSocket: vi.fn()}))
vi.mock('@features/authentication/utils/webSocketUrl', () => ({getWebSocketUrl: () => null}))
vi.mock('@features/tests/components/testDetail', () => ({
    TestDetailModal: ({isOpen, test}: {isOpen: boolean; test: TestResult | null}) => (
        <div data-testid="modal" data-open={isOpen} data-test-id={test?.testId} />
    ),
}))

const UrlProbe = () => {
    const [params, setParams] = useSearchParams()
    return (
        <div>
            <div data-testid="test-id-param">{params.get('testId') || 'none'}</div>
            <button onClick={() => setParams({testId: 'good'})}>open good</button>
        </div>
    )
}

describe('Dashboard - ?testId= link', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeTests = []
    })

    const renderAt = (url: string) =>
        render(
            <MemoryRouter initialEntries={[url]}>
                <UrlProbe />
                <Dashboard />
            </MemoryRouter>
        )

    it('opens a test that is outside the loaded rows by asking the server', async () => {
        mockGetLatestByTestId.mockResolvedValue({id: 'r-1', testId: 'far-away'})

        renderAt('/dashboard?testId=far-away')

        await waitFor(() => {
            expect(screen.getByTestId('modal')).toHaveAttribute('data-open', 'true')
        })
        expect(screen.getByTestId('modal')).toHaveAttribute('data-test-id', 'far-away')
    })

    it('shows "Test not found" for an unknown test', async () => {
        mockGetLatestByTestId.mockResolvedValue(null)

        renderAt('/dashboard?testId=gone')

        expect(await screen.findByText('Test not found')).toBeInTheDocument()
        expect(screen.getByTestId('modal')).toHaveAttribute('data-open', 'false')
    })

    it('keeps the testId and shows a message when the server cannot be reached', async () => {
        mockGetLatestByTestId.mockRejectedValue(new Error('down'))

        renderAt('/dashboard?testId=abc')

        expect(await screen.findByText('Could not open the test link')).toBeInTheDocument()
        expect(screen.getByTestId('modal')).toHaveAttribute('data-open', 'false')
        expect(screen.getByTestId('test-id-param')).toHaveTextContent('abc')
    })

    it('clears an old notice when a later link opens', async () => {
        mockGetLatestByTestId.mockImplementation(async (id: string) =>
            id === 'gone' ? null : {id: 'r-2', testId: id}
        )

        renderAt('/dashboard?testId=gone')
        expect(await screen.findByText('Test not found')).toBeInTheDocument()

        screen.getByText('open good').click()

        await waitFor(() => {
            expect(screen.getByTestId('modal')).toHaveAttribute('data-test-id', 'good')
        })
        expect(screen.queryByText('Test not found')).not.toBeInTheDocument()
    })
})
