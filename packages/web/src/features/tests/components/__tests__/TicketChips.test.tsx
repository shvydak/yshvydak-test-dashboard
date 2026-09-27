import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {TicketChips} from '../TicketChips'
import {JIRA_SETTINGS_QUERY_KEY, JiraSettings} from '@features/dashboard/hooks/useJiraSettings'
import {JiraTicketInfoContext} from '../JiraTicketInfoContext'
import type {JiraTicketInfo} from '../../hooks/useJiraTicketInfo'
import type {DisplayTag} from '../../utils/jiraTags'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPut: vi.fn(),
}))

import {authGet} from '@features/authentication/utils/authFetch'

const renderChips = (
    ui: React.ReactElement,
    settings?: JiraSettings
): ReturnType<typeof render> => {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
    if (settings) queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, settings)
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

const renderChipsWithJiraInfo = (
    ui: React.ReactElement,
    ticketInfo: Map<string, JiraTicketInfo>,
    settings: JiraSettings = withUrl
): ReturnType<typeof render> => {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
    queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, settings)
    return render(
        <QueryClientProvider client={queryClient}>
            <JiraTicketInfoContext.Provider value={ticketInfo}>{ui}</JiraTicketInfoContext.Provider>
        </QueryClientProvider>
    )
}

const jiraInfo = (overrides: Partial<JiraTicketInfo> = {}): JiraTicketInfo => ({
    key: 'ABC-816',
    issueType: 'Bug',
    statusName: 'To Do',
    statusCategory: 'new',
    summary: 'Some ticket summary',
    assignee: 'Someone',
    fetchedAt: '2026-09-24T10:00:00.000Z',
    ...overrides,
})

const withUrl: JiraSettings = {
    baseUrl: 'https://x.atlassian.net/browse/',
    chipAlignment: 'left',
    tagMode: 'tickets',
}

const ticket = (label: string): DisplayTag => ({label, kind: 'ticket'})
const other = (label: string): DisplayTag => ({label, kind: 'other'})

describe('TicketChips', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders nothing for a test without tags', () => {
        const {container} = renderChips(<TicketChips tags={[]} />, withUrl)

        expect(container).toBeEmptyDOMElement()
    })

    it('renders one link per ticket tag pointing at baseUrl + key, opened in a new tab', () => {
        renderChips(<TicketChips tags={[ticket('ABC-816'), ticket('ABC-4812')]} />, withUrl)

        const first = screen.getByRole('link', {name: 'ABC-816'})
        expect(first).toHaveAttribute('href', 'https://x.atlassian.net/browse/ABC-816')
        expect(first).toHaveAttribute('target', '_blank')
        expect(first).toHaveAttribute('rel', 'noopener noreferrer')
        expect(first).toHaveAttribute('data-kind', 'ticket')
        expect(screen.getByRole('link', {name: 'ABC-4812'})).toHaveAttribute(
            'href',
            'https://x.atlassian.net/browse/ABC-4812'
        )
    })

    it('does not bubble ticket chip clicks to the row', () => {
        const onRowClick = vi.fn()
        renderChips(
            <div onClick={onRowClick}>
                <TicketChips tags={[ticket('ABC-816')]} />
            </div>,
            withUrl
        )

        fireEvent.click(screen.getByRole('link', {name: 'ABC-816'}))

        expect(onRowClick).not.toHaveBeenCalled()
    })

    it('renders plain ticket labels (no links) when the base URL is empty', () => {
        renderChips(<TicketChips tags={[ticket('ABC-816')]} />, {...withUrl, baseUrl: ''})

        expect(screen.getByText('ABC-816')).toHaveAttribute('data-kind', 'ticket')
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('renders plain labels before settings are loaded, and never fetches', () => {
        renderChips(<TicketChips tags={[ticket('ABC-816')]} />)

        expect(screen.getByText('ABC-816')).toBeInTheDocument()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(authGet).not.toHaveBeenCalled()
    })

    it('right-aligns only when align="right"', () => {
        const {unmount} = renderChips(
            <TicketChips tags={[ticket('ABC-1')]} align="right" />,
            withUrl
        )
        expect(screen.getByText('ABC-1').parentElement).toHaveClass('justify-end')
        unmount()

        const second = renderChips(<TicketChips tags={[ticket('ABC-1')]} align="left" />, withUrl)
        expect(screen.getByText('ABC-1').parentElement).not.toHaveClass('justify-end')
        second.unmount()

        renderChips(<TicketChips tags={[ticket('ABC-1')]} />, withUrl)
        expect(screen.getByText('ABC-1').parentElement).not.toHaveClass('justify-end')
    })

    it('has no underline class on hover/focus, and a non-underline hover cue + focus ring', () => {
        renderChips(<TicketChips tags={[ticket('ABC-816')]} />, withUrl)

        const cls = screen.getByRole('link', {name: 'ABC-816'}).className
        expect(cls).not.toMatch(/underline/)
        expect(cls).toContain('hover:border-primary-400')
        expect(cls).toContain('focus-visible:ring-2')
    })

    describe('other (non-ticket) tags', () => {
        it('render as neutral grey labels, never as links, even with a base URL', () => {
            renderChips(<TicketChips tags={[other('sanity')]} />, withUrl)

            const chip = screen.getByText('sanity')
            expect(chip.tagName).toBe('SPAN')
            expect(chip).toHaveAttribute('data-kind', 'other')
            expect(chip).toHaveClass('bg-gray-100', 'text-gray-600')
            expect(chip).not.toHaveClass('bg-primary-50')
            expect(screen.queryByRole('link')).not.toBeInTheDocument()
        })

        it('have no hover cue, focus ring or underline', () => {
            renderChips(<TicketChips tags={[other('sanity')]} />, withUrl)

            expect(screen.getByText('sanity').className).not.toMatch(
                /hover:|focus-visible|underline/
            )
        })

        it('show without a leading @ and keep the given order next to ticket chips', () => {
            renderChips(
                <TicketChips tags={[other('sanity'), ticket('ABC-816'), other('api')]} />,
                withUrl
            )

            const chips = screen.getAllByText(/sanity|ABC-816|api/)
            expect(chips.map((c) => c.textContent)).toEqual(['sanity', 'ABC-816', 'api'])
            expect(chips.map((c) => c.getAttribute('data-kind'))).toEqual([
                'other',
                'ticket',
                'other',
            ])
            expect(screen.getAllByRole('link')).toHaveLength(1)
        })

        it('clicking one does nothing special (no link, nothing to isolate)', () => {
            const onRowClick = vi.fn()
            renderChips(
                <div onClick={onRowClick}>
                    <TicketChips tags={[other('sanity')]} />
                </div>,
                withUrl
            )

            fireEvent.click(screen.getByText('sanity'))

            // the click reaches the row, which is what opens the detail modal
            expect(onRowClick).toHaveBeenCalledTimes(1)
        })
    })

    describe('search highlight', () => {
        const chip = (name: string) => screen.getByRole('link', {name})

        it('highlights only chips whose label matches the query', () => {
            renderChips(
                <TicketChips
                    tags={[ticket('ABC-816'), ticket('ABC-4812')]}
                    searchQuery="ABC-816"
                />,
                withUrl
            )

            expect(chip('ABC-816')).toHaveAttribute('data-hit', 'true')
            expect(chip('ABC-816')).toHaveClass('bg-primary-600', 'text-white')
            expect(chip('ABC-4812')).not.toHaveAttribute('data-hit')
            expect(chip('ABC-4812')).toHaveClass('bg-primary-50')
            expect(chip('ABC-4812')).not.toHaveClass('bg-primary-600')
        })

        it('is case-insensitive and matches partial keys', () => {
            renderChips(
                <TicketChips tags={[ticket('ABC-816'), ticket('ABC-4812')]} searchQuery="abc-8" />,
                withUrl
            )

            expect(chip('ABC-816')).toHaveAttribute('data-hit', 'true')
            expect(chip('ABC-4812')).not.toHaveAttribute('data-hit')
        })

        it.each([undefined, ''])('does not highlight anything for query %j', (searchQuery) => {
            renderChips(
                <TicketChips
                    tags={[ticket('ABC-816'), other('sanity')]}
                    searchQuery={searchQuery}
                />,
                withUrl
            )

            expect(chip('ABC-816')).not.toHaveAttribute('data-hit')
            expect(chip('ABC-816')).toHaveClass('bg-primary-50')
            expect(screen.getByText('sanity')).not.toHaveAttribute('data-hit')
            expect(screen.getByText('sanity')).toHaveClass('bg-gray-100')
        })

        it('does not highlight when the query matches only the test name, not a tag', () => {
            renderChips(<TicketChips tags={[ticket('ABC-816')]} searchQuery="fault" />, withUrl)

            expect(chip('ABC-816')).not.toHaveAttribute('data-hit')
        })

        it('highlights ticket labels without links too (empty base URL)', () => {
            renderChips(<TicketChips tags={[ticket('ABC-816')]} searchQuery="abc-816" />, {
                ...withUrl,
                baseUrl: '',
            })

            expect(screen.getByText('ABC-816')).toHaveAttribute('data-hit', 'true')
            expect(screen.getByText('ABC-816')).toHaveClass('bg-primary-600')
        })

        it('highlights other chips solid grey when they match, ignoring a leading @', () => {
            renderChips(
                <TicketChips tags={[other('sanity'), other('api')]} searchQuery="@SAN" />,
                withUrl
            )

            const hit = screen.getByText('sanity')
            expect(hit).toHaveAttribute('data-hit', 'true')
            expect(hit).toHaveClass('bg-gray-600', 'text-white')
            expect(hit).not.toHaveClass('bg-gray-100')
            expect(screen.getByText('api')).not.toHaveAttribute('data-hit')
        })
    })

    describe('Jira-enriched chip (Option 4: type icon + statusCategory lozenge + tooltip)', () => {
        it('falls back to the plain chip when no ticket info is in context (default empty map)', () => {
            renderChips(<TicketChips tags={[ticket('ABC-816')]} />, withUrl)

            const link = screen.getByRole('link', {name: 'ABC-816'})
            expect(link).toHaveAttribute('data-kind', 'ticket')
            expect(link).toHaveClass('bg-primary-50')
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
        })

        it('renders the statusCategory color and a link to the same URL once info resolves', () => {
            const info = new Map([['ABC-816', jiraInfo({statusCategory: 'new'})]])
            renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)

            const link = screen.getByRole('link', {name: /ABC-816/})
            expect(link).toHaveAttribute('href', 'https://x.atlassian.net/browse/ABC-816')
            expect(link).toHaveAttribute('data-kind', 'ticket')
            expect(link).toHaveClass('bg-gray-100')
            expect(link).not.toHaveClass('bg-primary-50')
        })

        it.each([
            ['new', 'bg-gray-100'],
            ['indeterminate', 'bg-jiraBlue-50'],
            ['done', 'bg-jiraGreen-50'],
        ] as const)(
            'uses a distinct, non-red/green background for category "%s"',
            (category, cls) => {
                const info = new Map([['ABC-816', jiraInfo({statusCategory: category})]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)

                const link = screen.getByRole('link', {name: /ABC-816/})
                expect(link).toHaveClass(cls)
                // Never the pass/fail hues, whatever the category:
                expect(link.className).not.toMatch(/bg-success-|bg-danger-/)
            }
        )

        it('renders a plain (non-link) enriched chip when the base URL is empty', () => {
            const info = new Map([['ABC-816', jiraInfo({statusCategory: 'done'})]])
            const {container} = renderChipsWithJiraInfo(
                <TicketChips tags={[ticket('ABC-816')]} />,
                info,
                {...withUrl, baseUrl: ''}
            )

            expect(screen.queryByRole('link')).not.toBeInTheDocument()
            // getByText('ABC-816') is now ambiguous — the tooltip repeats the key in its own
            // span — so go straight to the chip element instead.
            const chip = container.querySelector('[data-kind="ticket"]')
            expect(chip).toHaveClass('bg-jiraGreen-50')
        })

        it('does not bubble clicks to the row', () => {
            const onRowClick = vi.fn()
            const info = new Map([['ABC-816', jiraInfo()]])
            renderChipsWithJiraInfo(
                <div onClick={onRowClick}>
                    <TicketChips tags={[ticket('ABC-816')]} />
                </div>,
                info
            )

            fireEvent.click(screen.getByRole('link', {name: /ABC-816/}))

            expect(onRowClick).not.toHaveBeenCalled()
        })

        it('shows a tooltip with type, key, summary, status and assignee', () => {
            const info = new Map([
                [
                    'ABC-816',
                    jiraInfo({
                        issueType: 'Task',
                        statusName: 'Completed (In Prod)',
                        statusCategory: 'done',
                        summary: 'Automation - New Test: something',
                        assignee: 'Yurii Shvydak',
                    }),
                ],
            ])
            renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
            fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

            const tooltip = screen.getByRole('tooltip')
            expect(tooltip).toHaveTextContent('ABC-816')
            expect(tooltip).toHaveTextContent('Task')
            expect(tooltip).toHaveTextContent('Automation - New Test: something')
            expect(tooltip).toHaveTextContent('Completed (In Prod)')
            expect(tooltip).toHaveTextContent('Yurii Shvydak')
        })

        it('shows a muted, italic "Unassigned" for assignee when unassigned', () => {
            const info = new Map([['ABC-816', jiraInfo({assignee: null})]])
            renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
            fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

            const unassigned = screen.getByText('Unassigned')
            expect(unassigned).toHaveClass('italic')
            expect(unassigned.className).toMatch(/text-gray-400/)
        })

        it('only enriches the key that has resolved info; a second, unresolved key stays plain', () => {
            const info = new Map([['ABC-816', jiraInfo()]])
            renderChipsWithJiraInfo(
                <TicketChips tags={[ticket('ABC-816'), ticket('ABC-999')]} />,
                info
            )

            expect(screen.getByRole('link', {name: /ABC-816/})).toHaveClass('bg-gray-100')
            expect(screen.getByRole('link', {name: 'ABC-999'})).toHaveClass('bg-primary-50')
        })

        it('"other" (non-ticket) tags are never enriched, even if a matching key exists in context', () => {
            const info = new Map([['sanity', jiraInfo({key: 'sanity'})]])
            renderChipsWithJiraInfo(<TicketChips tags={[other('sanity')]} />, info)

            const chip = screen.getByText('sanity')
            expect(chip.tagName).toBe('SPAN')
            expect(chip).toHaveAttribute('data-kind', 'other')
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
        })

        it('keeps the search-hit signal (a same-hue ring, not the old solid-fill hit color, not a foreign indigo ring)', () => {
            const info = new Map([['ABC-816', jiraInfo({statusCategory: 'done'})]])
            renderChipsWithJiraInfo(
                <TicketChips tags={[ticket('ABC-816')]} searchQuery="ABC-816" />,
                info
            )

            const link = screen.getByRole('link', {name: /ABC-816/})
            expect(link).toHaveAttribute('data-hit', 'true')
            // A same-hue (jiraGreen) ring, not the indigo ring used for the plain-chip hit
            // state — an indigo ring on top of the pale category fill visually drowned it out
            // (client feedback), especially in light theme.
            expect(link).toHaveClass('ring-2', 'ring-jiraGreen-500')
            // (the focus-visible:ring-primary-500/60 token from the base chip class is a
            // different, unrelated utility — this only rules out the old bare hit-ring class)
            expect(link).not.toHaveClass('ring-primary-500')
            // Category color is preserved even when highlighted:
            expect(link).toHaveClass('bg-jiraGreen-50')
        })

        it('falls back to a generic icon wrapper for an unrecognised issue type without throwing', () => {
            const info = new Map([['ABC-816', jiraInfo({issueType: 'Initiative'})]])
            expect(() =>
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
            ).not.toThrow()
            fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))
            expect(screen.getByRole('tooltip')).toHaveTextContent('Initiative')
        })

        describe('tooltip color coding (client feedback: everything read as one color)', () => {
            it.each([
                ['new', 'bg-gray-100'],
                ['indeterminate', 'bg-jiraBlue-50'],
                ['done', 'bg-jiraGreen-50'],
            ] as const)(
                'shows the status as an uppercase lozenge colored like category "%s"',
                (category, cls) => {
                    const info = new Map([
                        [
                            'ABC-816',
                            jiraInfo({statusCategory: category, statusName: 'Some Status'}),
                        ],
                    ])
                    renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                    fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                    const lozenge = screen.getByText('Some Status')
                    expect(lozenge).toHaveClass(cls, 'uppercase')
                }
            )

            it.each([
                ['Bug', 'text-jiraRed-600'],
                ['Task', 'text-jiraBlue-600'],
                ['Story', 'text-jiraGreen-600'],
                ['Epic', 'text-jiraPurple-600'],
            ])('colors the tooltip header type "%s" like Jira does', (issueType, cls) => {
                const info = new Map([['ABC-816', jiraInfo({issueType})]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                expect(screen.getByText(issueType)).toHaveClass(cls)
            })

            it('falls back to a neutral gray for an unrecognised issue type', () => {
                const info = new Map([['ABC-816', jiraInfo({issueType: 'Initiative'})]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                expect(screen.getByText('Initiative')).toHaveClass('text-gray-500')
            })

            it('never colors the chip icon itself by issue type (tooltip-only)', () => {
                const info = new Map([['ABC-816', jiraInfo({issueType: 'Bug'})]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)

                const link = screen.getByRole('link', {name: /ABC-816/})
                expect(link.className).not.toMatch(/jiraRed/)
            })
        })

        describe('tooltip: portaled to document.body, position: fixed from viewport coordinates', () => {
            const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
            const originalInnerHeight = window.innerHeight
            const originalInnerWidth = window.innerWidth

            afterEach(() => {
                HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
                Object.defineProperty(window, 'innerHeight', {
                    value: originalInnerHeight,
                    configurable: true,
                })
                Object.defineProperty(window, 'innerWidth', {
                    value: originalInnerWidth,
                    configurable: true,
                })
            })

            const stubRect = (bottom: number) =>
                ({
                    bottom,
                    top: bottom - 20,
                    left: 0,
                    right: 100,
                    width: 100,
                    height: 20,
                    x: 0,
                    y: bottom - 20,
                    toJSON: () => ({}),
                }) as DOMRect

            it('is absent until hover, and appears on hover', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)

                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))
                expect(screen.getByRole('tooltip')).toBeInTheDocument()
            })

            it('is portaled straight onto document.body — never clipped by an ancestor’s overflow or stacking context (the sticky-header bug)', () => {
                HTMLElement.prototype.getBoundingClientRect = () => stubRect(100)
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(
                    <div data-testid="clipper" style={{overflow: 'hidden'}}>
                        <TicketChips tags={[ticket('ABC-816')]} />
                    </div>,
                    info
                )
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                const tooltip = screen.getByRole('tooltip')
                expect(tooltip.parentElement).toBe(document.body)
                expect(screen.getByTestId('clipper')).not.toContainElement(tooltip)
                expect(tooltip.style.position).toBe('fixed')
            })

            it('positions below the chip, in viewport (fixed) coordinates, when there is room', () => {
                Object.defineProperty(window, 'innerHeight', {value: 2000, configurable: true})
                HTMLElement.prototype.getBoundingClientRect = () => stubRect(100) // top: 80, bottom: 100

                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                const tooltip = screen.getByRole('tooltip')
                expect(tooltip.style.top).toBe('108px') // bottom(100) + 8px gap
                expect(tooltip.style.left).toBe('0px')
                expect(tooltip.style.transform).toBe('')
            })

            it('flips upward (anchored to the chip’s top, translateY(-100%)) when there is no room below', () => {
                Object.defineProperty(window, 'innerHeight', {value: 400, configurable: true})
                HTMLElement.prototype.getBoundingClientRect = () => stubRect(390) // 10px below, need 150

                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                const tooltip = screen.getByRole('tooltip')
                expect(tooltip.style.top).toBe('362px') // top(370) - 8px gap
                expect(tooltip.style.transform).toBe('translateY(-100%)')
            })

            it('opens upward when neither side has enough room but above has more than below', () => {
                Object.defineProperty(window, 'innerHeight', {value: 200, configurable: true})
                HTMLElement.prototype.getBoundingClientRect = () => stubRect(140) // below: 60, above: 120 — both <150

                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                expect(screen.getByRole('tooltip').style.transform).toBe('translateY(-100%)')
            })

            it('stays downward when neither side has enough room but below still has more than above', () => {
                Object.defineProperty(window, 'innerHeight', {value: 100, configurable: true})
                HTMLElement.prototype.getBoundingClientRect = () => stubRect(30) // below: 70, above: 10 — both <150

                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                expect(screen.getByRole('tooltip').style.transform).toBe('')
            })

            it('aligns to the chip’s right edge when a left-aligned tooltip would overflow the viewport', () => {
                Object.defineProperty(window, 'innerWidth', {value: 300, configurable: true})
                HTMLElement.prototype.getBoundingClientRect = () =>
                    ({
                        bottom: 100,
                        top: 80,
                        left: 200, // spaceRight = 300 - 200 = 100, less than the 240px tooltip width
                        right: 300,
                        width: 100,
                        height: 20,
                        x: 200,
                        y: 80,
                        toJSON: () => ({}),
                    }) as DOMRect

                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                expect(screen.getByRole('tooltip').style.left).toBe('60px') // right(300) - 240
            })

            it('stays left-aligned when there is plenty of room to the right', () => {
                HTMLElement.prototype.getBoundingClientRect = () => stubRect(100) // left: 0 (default stub)

                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))

                expect(screen.getByRole('tooltip').style.left).toBe('0px')
            })

            it('closes on mouse leave', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                const link = screen.getByRole('link', {name: /ABC-816/})

                fireEvent.mouseEnter(link)
                expect(screen.getByRole('tooltip')).toBeInTheDocument()

                fireEvent.mouseLeave(link)
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
            })

            it('opens on focus and closes on blur', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                const link = screen.getByRole('link', {name: /ABC-816/})

                fireEvent.focus(link)
                expect(screen.getByRole('tooltip')).toBeInTheDocument()

                fireEvent.blur(link)
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
            })

            it('closes on scroll — a fixed-position tooltip anchored to a stale rect would otherwise drift from its chip', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)

                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))
                expect(screen.getByRole('tooltip')).toBeInTheDocument()

                fireEvent.scroll(window)
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
            })

            it('closes when a nested scrollable ancestor scrolls, not just the window (capture-phase listener)', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(
                    <div data-testid="pane" style={{overflowY: 'auto'}}>
                        <TicketChips tags={[ticket('ABC-816')]} />
                    </div>,
                    info
                )

                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))
                expect(screen.getByRole('tooltip')).toBeInTheDocument()

                fireEvent.scroll(screen.getByTestId('pane'))
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
            })

            it('closes on window resize, same as scroll', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)

                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))
                expect(screen.getByRole('tooltip')).toBeInTheDocument()

                fireEvent.resize(window)
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
            })

            it('closes on Escape (WCAG 1.4.13 dismissible content)', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)

                fireEvent.mouseEnter(screen.getByRole('link', {name: /ABC-816/}))
                expect(screen.getByRole('tooltip')).toBeInTheDocument()

                fireEvent.keyDown(window, {key: 'Escape'})
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
            })

            it('links the chip to the tooltip via aria-describedby only while it is open', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info)
                const link = screen.getByRole('link', {name: /ABC-816/})

                expect(link).not.toHaveAttribute('aria-describedby')

                fireEvent.mouseEnter(link)
                const tooltip = screen.getByRole('tooltip')
                expect(link).toHaveAttribute('aria-describedby', tooltip.id)
                expect(tooltip.id).toBeTruthy()

                fireEvent.mouseLeave(link)
                expect(link).not.toHaveAttribute('aria-describedby')
            })

            it('a chip with no link target (empty base URL) is still keyboard-reachable and opens its tooltip on focus', () => {
                const info = new Map([['ABC-816', jiraInfo()]])
                renderChipsWithJiraInfo(<TicketChips tags={[ticket('ABC-816')]} />, info, {
                    ...withUrl,
                    baseUrl: '',
                })

                const chip = screen.getByText('ABC-816').closest('[data-kind="ticket"]')!
                expect(chip).toHaveAttribute('tabindex', '0')

                fireEvent.focus(chip)
                expect(screen.getByRole('tooltip')).toBeInTheDocument()

                fireEvent.blur(chip)
                expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
            })
        })
    })
})
