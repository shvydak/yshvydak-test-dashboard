import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {TicketChips} from '../TicketChips'
import {JIRA_SETTINGS_QUERY_KEY, JiraSettings} from '@features/dashboard/hooks/useJiraSettings'
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
})
