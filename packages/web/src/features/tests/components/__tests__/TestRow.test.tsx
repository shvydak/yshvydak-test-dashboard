import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, within} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {TestResult} from '@yshvydak/core'
import {TestRow} from '../TestRow'
import {TestsTable} from '../TestsTable'
import {TicketSearchContext} from '../TicketSearchContext'
import {
    JIRA_SETTINGS_QUERY_KEY,
    JiraSettings,
    ChipAlignment,
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

const settings: JiraSettings = {
    baseUrl: 'https://x.atlassian.net/browse/',
    chipAlignment: 'left',
    tagMode: 'tickets',
}

const makeTest = (tags?: string[]): TestResult => ({
    id: 'r1',
    testId: 'test-1',
    name: 'Open fault allows only "Complete with fault"',
    filePath: 'ui-tests/05_Actions/002_actionStatus.test.ts',
    status: 'passed',
    duration: 1200,
    runId: 'run-1',
    timestamp: '2026-09-01T10:00:00Z',
    ...(tags ? {metadata: {tags}} : {}),
})

// Mirrors what TestsTable does: the row gets position and mode from the same settings
const renderRow = (
    test: TestResult,
    jira: JiraSettings | null = settings,
    onSelect = vi.fn(),
    searchQuery = ''
) => {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
    if (jira) queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, jira)
    const utils = render(
        <QueryClientProvider client={queryClient}>
            <table>
                <tbody>
                    <TicketSearchContext.Provider value={searchQuery}>
                        <TestRow
                            test={test}
                            selected={false}
                            onSelect={onSelect}
                            onRerun={vi.fn()}
                            chipAlignment={jira?.chipAlignment}
                            tagMode={jira?.tagMode}
                        />
                    </TicketSearchContext.Provider>
                </tbody>
            </table>
        </QueryClientProvider>
    )
    return {...utils, onSelect}
}

describe("TestRow ticket chips (tagMode 'tickets')", () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows a chip per ticket tag in the tags column and under the name', () => {
        renderRow(makeTest(['@ABC-816', '@sanity', '@ABC-4812']))

        // Two render places (lg column + below-lg under the name), css decides which shows
        expect(screen.getAllByRole('link', {name: 'ABC-816'})).toHaveLength(2)
        expect(screen.getAllByRole('link', {name: 'ABC-4812'})).toHaveLength(2)
        expect(screen.queryByText('sanity')).not.toBeInTheDocument()
        expect(screen.queryByText('@sanity')).not.toBeInTheDocument()
    })

    it('marks the under-name chips lg:hidden and the column cell lg-only', () => {
        const {container} = renderRow(makeTest(['@ABC-816']))

        const cells = container.querySelectorAll('td')
        const nameChips = within(cells[1]).getByRole('link', {name: 'ABC-816'}).parentElement
        expect(nameChips).toHaveClass('lg:hidden')
        expect(cells[2]).toHaveClass('hidden', 'lg:table-cell', 'w-60')
        expect(within(cells[2]).getByRole('link', {name: 'ABC-816'})).toBeInTheDocument()
    })

    it('right-aligns chips in the column when chipAlignment is right', () => {
        const {container} = renderRow(makeTest(['@ABC-816']), {...settings, chipAlignment: 'right'})

        const column = container.querySelectorAll('td')[2]
        expect(within(column).getByRole('link').parentElement).toHaveClass('justify-end')
        // under-name chips stay left
        const nameCell = container.querySelectorAll('td')[1]
        expect(within(nameCell).getByRole('link').parentElement).not.toHaveClass('justify-end')
    })

    it('renders non-clickable labels when the Jira base URL is empty', () => {
        renderRow(makeTest(['@ABC-816']), {...settings, baseUrl: ''})

        expect(screen.getAllByText('ABC-816')).toHaveLength(2)
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('renders an empty tags cell (keeps the column width) for tests without ticket tags', () => {
        const {container} = renderRow(makeTest(['@sanity']))

        const cells = container.querySelectorAll('td')
        expect(cells).toHaveLength(6)
        expect(cells[2]).toBeEmptyDOMElement()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('renders an empty tags cell when metadata is missing', () => {
        const {container} = renderRow(makeTest())

        expect(container.querySelectorAll('td')[2]).toBeEmptyDOMElement()
    })

    it('opening a chip does not select the row, clicking the row does', () => {
        const {container, onSelect} = renderRow(makeTest(['@ABC-816']))

        fireEvent.click(screen.getAllByRole('link', {name: 'ABC-816'})[0])
        expect(onSelect).not.toHaveBeenCalled()

        fireEvent.click(container.querySelector('tr')!)
        expect(onSelect).toHaveBeenCalledTimes(1)
    })
})

describe('TestRow tag mode x chip position matrix', () => {
    const positions: ChipAlignment[] = ['left', 'right', 'below']
    const jira = (tagMode: TagMode, chipAlignment: ChipAlignment): JiraSettings => ({
        ...settings,
        tagMode,
        chipAlignment,
    })
    const tags = ['@sanity', '@ABC-816', '@api']

    describe.each(positions)("position '%s'", (position) => {
        const columnCount = position === 'below' ? 5 : 6

        it("'tickets' mode shows only the ticket chip", () => {
            const {container} = renderRow(makeTest(tags), jira('tickets', position))

            expect(container.querySelectorAll('td')).toHaveLength(columnCount)
            expect(screen.getAllByText('ABC-816').length).toBe(position === 'below' ? 1 : 2)
            expect(screen.queryByText('sanity')).not.toBeInTheDocument()
            expect(screen.queryByText('api')).not.toBeInTheDocument()
        })

        it("'all' mode shows every tag: ticket link + grey non-clickable others", () => {
            const {container} = renderRow(makeTest(tags), jira('all', position))
            const copies = position === 'below' ? 1 : 2

            expect(container.querySelectorAll('td')).toHaveLength(columnCount)
            expect(screen.getAllByRole('link', {name: 'ABC-816'})).toHaveLength(copies)
            expect(screen.getAllByText('sanity')).toHaveLength(copies)
            expect(screen.getAllByText('api')).toHaveLength(copies)
            screen.getAllByText('sanity').forEach((chip) => {
                expect(chip.tagName).toBe('SPAN')
                expect(chip).toHaveAttribute('data-kind', 'other')
            })
            // only the ticket chips are links
            expect(screen.getAllByRole('link')).toHaveLength(copies)
            expect(screen.queryByText('@sanity')).not.toBeInTheDocument()
        })

        it("'all' mode keeps the tag order under the name", () => {
            const {container} = renderRow(makeTest(tags), jira('all', position))

            const nameCell = container.querySelectorAll('td')[1]
            const labels = within(nameCell)
                .getAllByText(/^(sanity|ABC-816|api)$/)
                .map((el) => el.textContent)
            expect(labels).toEqual(['sanity', 'ABC-816', 'api'])
        })

        it('a test without tags renders the same as before in both modes', () => {
            for (const mode of ['tickets', 'all'] as TagMode[]) {
                const {container, unmount} = renderRow(makeTest(), jira(mode, position))

                expect(container.querySelectorAll('td')).toHaveLength(columnCount)
                expect(screen.queryByRole('link')).not.toBeInTheDocument()
                expect(container.querySelector('[data-kind]')).toBeNull()
                unmount()
            }
        })
    })

    it("a test with only non-ticket tags: empty cell in 'tickets' mode, chips in 'all' mode", () => {
        const only = makeTest(['@sanity'])

        const tickets = renderRow(only, jira('tickets', 'left'))
        expect(tickets.container.querySelectorAll('td')[2]).toBeEmptyDOMElement()
        tickets.unmount()

        const all = renderRow(only, jira('all', 'left'))
        expect(
            within(all.container.querySelectorAll('td')[2]).getByText('sanity')
        ).toBeInTheDocument()
    })

    it("'all' mode right-aligns the column chips, other chips included", () => {
        const {container} = renderRow(makeTest(tags), jira('all', 'right'))

        const column = container.querySelectorAll('td')[2]
        expect(within(column).getByText('sanity').parentElement).toHaveClass('justify-end')
    })

    it("'all' mode with an empty base URL: ticket and other chips are all plain labels", () => {
        renderRow(makeTest(tags), {...jira('all', 'left'), baseUrl: ''})

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(screen.getAllByText('ABC-816')).toHaveLength(2)
        expect(screen.getAllByText('sanity')).toHaveLength(2)
    })

    it('clicking a non-ticket chip selects the row (nothing to open)', () => {
        const {onSelect} = renderRow(makeTest(tags), jira('all', 'below'))

        fireEvent.click(screen.getByText('sanity'))

        expect(onSelect).toHaveBeenCalledTimes(1)
    })
})

describe("TestRow chip position 'below'", () => {
    const below: JiraSettings = {...settings, chipAlignment: 'below'}

    it('renders no tags cell, even for tests without tags', () => {
        const withTickets = renderRow(makeTest(['@ABC-816']), below)
        expect(withTickets.container.querySelectorAll('td')).toHaveLength(5)
        withTickets.unmount()

        const without = renderRow(makeTest(), below)
        expect(without.container.querySelectorAll('td')).toHaveLength(5)
    })

    it('shows chips once, under the name, at every width (no lg:hidden)', () => {
        const {container} = renderRow(makeTest(['@ABC-816', '@sanity']), below)

        const links = screen.getAllByRole('link')
        expect(links).toHaveLength(1)
        expect(links[0]).toHaveAttribute('href', 'https://x.atlassian.net/browse/ABC-816')
        const nameCell = container.querySelectorAll('td')[1]
        expect(within(nameCell).getByRole('link', {name: 'ABC-816'})).toBeInTheDocument()
        expect(links[0].parentElement).not.toHaveClass('lg:hidden')
    })

    it('keeps search highlight, click isolation and empty-URL labels working', () => {
        const hit = renderRow(makeTest(['@ABC-816', '@ABC-4812']), below, vi.fn(), 'abc-816')
        expect(screen.getByRole('link', {name: 'ABC-816'})).toHaveAttribute('data-hit', 'true')
        expect(screen.getByRole('link', {name: 'ABC-4812'})).not.toHaveAttribute('data-hit')
        fireEvent.click(screen.getByRole('link', {name: 'ABC-816'}))
        expect(hit.onSelect).not.toHaveBeenCalled()
        hit.unmount()

        renderRow(makeTest(['@ABC-816']), {...below, baseUrl: ''})
        expect(screen.getByText('ABC-816')).toBeInTheDocument()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
})

describe('TestRow search highlight', () => {
    it('highlights matching chips in both the under-name and tags-column variants', () => {
        renderRow(makeTest(['@ABC-816', '@ABC-4812']), settings, vi.fn(), 'abc-816')

        const hits = screen.getAllByRole('link', {name: 'ABC-816'})
        expect(hits).toHaveLength(2)
        hits.forEach((chip) => expect(chip).toHaveAttribute('data-hit', 'true'))
        screen
            .getAllByRole('link', {name: 'ABC-4812'})
            .forEach((chip) => expect(chip).not.toHaveAttribute('data-hit'))
    })

    it('highlights nothing without a search query', () => {
        renderRow(makeTest(['@ABC-816']))

        screen
            .getAllByRole('link', {name: 'ABC-816'})
            .forEach((chip) => expect(chip).not.toHaveAttribute('data-hit'))
    })

    it("highlights matching other chips in 'all' mode (leading @ in the query ignored)", () => {
        renderRow(
            makeTest(['@sanity', '@api', '@ABC-1']),
            {...settings, tagMode: 'all'},
            vi.fn(),
            '@sanity'
        )

        screen.getAllByText('sanity').forEach((chip) => {
            expect(chip).toHaveAttribute('data-hit', 'true')
        })
        screen.getAllByText('api').forEach((chip) => expect(chip).not.toHaveAttribute('data-hit'))
        screen
            .getAllByRole('link', {name: 'ABC-1'})
            .forEach((chip) => expect(chip).not.toHaveAttribute('data-hit'))
    })

    it("does not highlight a hidden non-ticket tag in 'tickets' mode (it is not displayed)", () => {
        const {container} = renderRow(makeTest(['@sanity', '@ABC-1']), settings, vi.fn(), 'sanity')

        expect(container.querySelector('[data-hit]')).toBeNull()
    })
})

describe('TestsTable', () => {
    const renderTable = (jira: JiraSettings, tags = ['@ABC-816', '@sanity']) => {
        const queryClient = new QueryClient()
        queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, jira)
        return render(
            <QueryClientProvider client={queryClient}>
                <TestsTable
                    tests={[makeTest(tags)]}
                    selectedTest={null}
                    onTestSelect={vi.fn()}
                    onTestRerun={vi.fn()}
                />
            </QueryClientProvider>
        )
    }

    it("has a 'Tickets' column header visible from lg in 'tickets' mode", () => {
        renderTable(settings)

        expect(screen.getByRole('columnheader', {name: 'Tickets'})).toHaveClass(
            'hidden',
            'lg:table-cell',
            'w-60'
        )
        expect(screen.queryByRole('columnheader', {name: 'Tags'})).not.toBeInTheDocument()
        // column mode: chips in the column + under the name (lg:hidden); 'sanity' hidden
        expect(screen.getAllByRole('link', {name: 'ABC-816'})).toHaveLength(2)
        expect(screen.queryByText('sanity')).not.toBeInTheDocument()
    })

    it.each(['left', 'right'] as ChipAlignment[])(
        "header reads 'Tags' in 'all' mode (position %s) and other tags are shown",
        (chipAlignment) => {
            renderTable({...settings, tagMode: 'all', chipAlignment})

            expect(screen.getByRole('columnheader', {name: 'Tags'})).toHaveClass('lg:table-cell')
            expect(screen.queryByRole('columnheader', {name: 'Tickets'})).not.toBeInTheDocument()
            expect(screen.getAllByText('sanity')).toHaveLength(2)
        }
    )

    it.each(['tickets', 'all'] as TagMode[])(
        "has no tags header and no column in 'below' mode (tagMode %s)",
        (tagMode) => {
            const {container} = renderTable({...settings, chipAlignment: 'below', tagMode})

            expect(
                screen.queryByRole('columnheader', {name: /Tickets|Tags/})
            ).not.toBeInTheDocument()
            expect(container.querySelectorAll('th')).toHaveLength(5)
            expect(container.querySelectorAll('tbody td')).toHaveLength(5)
            expect(screen.getAllByRole('link', {name: 'ABC-816'})).toHaveLength(1)
            expect(screen.queryAllByText('sanity')).toHaveLength(tagMode === 'all' ? 1 : 0)
        }
    )
})
