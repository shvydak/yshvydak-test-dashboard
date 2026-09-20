import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, within} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {TestResult} from '@yshvydak/core'
import {TestsTable} from '../TestsTable'
import {TicketSearchContext} from '../TicketSearchContext'
import {useTestFilters} from '../../hooks/useTestFilters'
import {
    JIRA_SETTINGS_QUERY_KEY,
    useJiraSettings,
    TagMode,
} from '@features/dashboard/hooks/useJiraSettings'

vi.mock('../../store/testsStore', () => ({
    useTestsStore: vi.fn(() => ({
        runningTests: new Set<string>(),
        getIsAnyTestRunning: () => false,
        activeProgress: null,
    })),
}))

vi.mock('../../hooks/useNoteImages', () => ({
    useNoteImages: () => ({images: []}),
}))

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPut: vi.fn(),
    createProtectedFileURL: vi.fn(),
}))

const makeTest = (id: string, name: string, tags: string[]): TestResult => ({
    id,
    testId: `test-${id}`,
    name,
    filePath: `ui/${id}.spec.ts`,
    status: 'passed',
    duration: 100,
    runId: 'run-1',
    timestamp: '2026-09-01T10:00:00Z',
    metadata: {tags},
})

const tests = [
    makeTest('a', 'Alpha flow', ['@ABC-1', '@sanity']),
    makeTest('b', 'Beta flow', ['@ABC-2']),
    makeTest('c', 'Gamma flow', ['@api']),
]

// Same wiring as TestsList: shared filter + search-query context feeding the real table
function List({query}: {query: string}) {
    const {settings} = useJiraSettings(false)
    const {filteredTests} = useTestFilters({
        tests,
        filter: 'all',
        searchQuery: query,
        tagMode: settings.tagMode,
    })
    return (
        <TicketSearchContext.Provider value={query}>
            <TestsTable
                tests={filteredTests}
                selectedTest={null}
                onTestSelect={vi.fn()}
                onTestRerun={vi.fn()}
            />
        </TicketSearchContext.Provider>
    )
}

const renderList = (query: string, tagMode: TagMode) => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, {
        baseUrl: 'https://x.atlassian.net/browse/',
        chipAlignment: 'left',
        tagMode,
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <List query={query} />
        </QueryClientProvider>
    )
}

const rowNames = () =>
    screen
        .queryAllByRole('row')
        .slice(1) // header row
        .map((row) => within(row).getByText(/ flow$/).textContent)

const hits = () => Array.from(document.querySelectorAll('[data-hit]')).map((el) => el.textContent)

describe('list filter and chip highlight act on the same query', () => {
    beforeEach(() => vi.clearAllMocks())

    it("'all' mode, 'sanity': only the matching row stays and its grey chip is highlighted", () => {
        renderList('sanity', 'all')

        expect(rowNames()).toEqual(['Alpha flow'])
        // the tag shows in the tags column and under the name; both copies highlight
        expect(hits()).toEqual(['sanity', 'sanity'])
        // the row's other (ticket) chip is displayed but not highlighted
        screen
            .getAllByRole('link', {name: 'ABC-1'})
            .forEach((chip) => expect(chip).not.toHaveAttribute('data-hit'))
        screen.getAllByText('sanity').forEach((chip) => {
            expect(chip).toHaveAttribute('data-kind', 'other')
            expect(chip).toHaveClass('bg-gray-600')
        })
    })

    it("'tickets' mode, 'sanity': the tag is not displayed, so the row is filtered out", () => {
        renderList('sanity', 'tickets')

        expect(rowNames()).toEqual([])
        expect(hits()).toEqual([])
        expect(screen.queryByText('sanity')).not.toBeInTheDocument()
    })

    it.each(['tickets', 'all'] as TagMode[])(
        "'%s' mode, 'abc-1': matching row kept, only its ABC-1 chip highlighted, other rows dropped",
        (tagMode) => {
            renderList('abc-1', tagMode)

            expect(rowNames()).toEqual(['Alpha flow'])
            expect(hits()).toEqual(['ABC-1', 'ABC-1'])
            screen.getAllByRole('link', {name: 'ABC-1'}).forEach((chip) => {
                expect(chip).toHaveAttribute('data-hit', 'true')
                expect(chip).toHaveClass('bg-primary-600')
            })
            expect(screen.queryByText('ABC-2')).not.toBeInTheDocument()
            if (tagMode === 'all') {
                screen
                    .getAllByText('sanity')
                    .forEach((chip) => expect(chip).not.toHaveAttribute('data-hit'))
            }
        }
    )

    it("'all' mode ignores a leading @ in the query for both filter and highlight", () => {
        renderList('@sanity', 'all')

        expect(rowNames()).toEqual(['Alpha flow'])
        expect(hits()).toEqual(['sanity', 'sanity'])
    })

    it('no query: every row is kept and nothing is highlighted', () => {
        renderList('', 'all')

        expect(rowNames()).toEqual(['Alpha flow', 'Beta flow', 'Gamma flow'])
        expect(hits()).toEqual([])
    })
})
