import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, act, fireEvent} from '@testing-library/react'
import {MemoryRouter, useLocation} from 'react-router-dom'
import {CommandPalette, buildTestLinkPath} from '../CommandPalette'
import type {TestSearchHit} from '@/services/testSearch.service'
import type {ProjectTabConfig} from '@/hooks/useProjectTabs'
import {SEARCH_DEBOUNCE_MS} from '../../hooks/useTestSearch'

const mockSearch = vi.fn()
vi.mock('@/services/testSearch.service', () => ({
    testSearchService: {search: (q: string) => mockSearch(q)},
}))

const tabs: ProjectTabConfig[] = [
    {
        project: 'To_Fix',
        displayName: 'Open Bugs',
        visible: true,
        pipelines: [],
        stopPipelineOnFailure: false,
    },
]

const hit = (over: Partial<TestSearchHit>): TestSearchHit => ({
    testId: 'id-1',
    name: 'Create order with 2 items',
    filePath: 'orders/create-order.spec.ts',
    project: 'web',
    status: 'passed',
    tickets: [],
    createdAt: '',
    updatedAt: '',
    ...over,
})

const HITS = [
    hit({testId: 'id-1', tickets: ['ABC-12']}),
    hit({testId: 'id-2', name: 'Create order as supplier', project: 'To_Fix', status: 'failed'}),
    hit({testId: 'id-3', name: 'Create order draft', notInCode: true}),
]

function Where() {
    const loc = useLocation()
    return <div data-testid="where">{loc.pathname + loc.search}</div>
}

const setup = (onClose = vi.fn()) => {
    render(
        <MemoryRouter initialEntries={['/dashboard']}>
            <button>opener</button>
            <CommandPalette isOpen onClose={onClose} projectTabs={tabs} />
            <Where />
        </MemoryRouter>
    )
    return onClose
}

const type = async (value: string) => {
    fireEvent.change(screen.getByRole('combobox'), {target: {value}})
    await act(async () => {
        await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    })
}

describe('CommandPalette', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        mockSearch.mockReset()
        mockSearch.mockResolvedValue(HITS)
    })

    it('renders nothing when closed', () => {
        render(
            <MemoryRouter>
                <CommandPalette isOpen={false} onClose={vi.fn()} projectTabs={tabs} />
            </MemoryRouter>
        )
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('is an aria-modal dialog with a focused combobox and a hint below 2 chars', () => {
        setup()
        expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
        expect(document.activeElement).toBe(screen.getByRole('combobox'))
        expect(screen.getByText(/at least 2 characters/)).toBeTruthy()
        expect(mockSearch).not.toHaveBeenCalled()
    })

    it('shows rows: title, path, tab label (fallback project), tickets, not-in-code', async () => {
        setup()
        await type('create order')
        const options = screen.getAllByRole('option')
        expect(options).toHaveLength(3)
        expect(options[0].textContent).toContain('Create order with 2 items')
        expect(options[0].textContent).toContain('orders/create-order.spec.ts')
        expect(options[0].textContent).toContain('web')
        expect(options[0].textContent).toContain('ABC-12')
        expect(options[1].textContent).toContain('Open Bugs')
        expect(options[1].textContent).not.toContain('To_Fix')
        expect(options[2].querySelector('[aria-label="Not in code"]')).toBeTruthy()
    })

    it('arrows move with wrap, aria-activedescendant follows', async () => {
        setup()
        await type('create')
        const input = screen.getByRole('combobox')
        const options = () => screen.getAllByRole('option')
        expect(input.getAttribute('aria-activedescendant')).toBe(options()[0].id)
        fireEvent.keyDown(input, {key: 'ArrowDown'})
        expect(options()[1].getAttribute('aria-selected')).toBe('true')
        expect(input.getAttribute('aria-activedescendant')).toBe(options()[1].id)
        fireEvent.keyDown(input, {key: 'ArrowUp'})
        fireEvent.keyDown(input, {key: 'ArrowUp'})
        expect(options()[2].getAttribute('aria-selected')).toBe('true')
        fireEvent.keyDown(input, {key: 'ArrowDown'})
        expect(options()[0].getAttribute('aria-selected')).toBe('true')
    })

    it('Enter opens the active test through the shared link URL and closes', async () => {
        const onClose = setup()
        await type('create')
        const input = screen.getByRole('combobox')
        fireEvent.keyDown(input, {key: 'ArrowDown'})
        fireEvent.keyDown(input, {key: 'Enter'})
        expect(screen.getByTestId('where').textContent).toBe('/tests?project=To_Fix&testId=id-2')
        expect(onClose).toHaveBeenCalled()
    })

    it('click opens a test; hover moves the highlight', async () => {
        const onClose = setup()
        await type('create')
        const options = screen.getAllByRole('option')
        fireEvent.mouseEnter(options[2])
        expect(options[2].getAttribute('aria-selected')).toBe('true')
        fireEvent.click(options[0])
        expect(screen.getByTestId('where').textContent).toBe('/tests?project=web&testId=id-1')
        expect(onClose).toHaveBeenCalled()
    })

    it('Enter does nothing while a newer query is still loading', async () => {
        const onClose = setup()
        await type('create')
        fireEvent.change(screen.getByRole('combobox'), {target: {value: 'create o'}})
        fireEvent.keyDown(screen.getByRole('combobox'), {key: 'Enter'})
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByTestId('where').textContent).toBe('/dashboard')
    })

    it('Esc does not reach document listeners (modal underneath stays open)', () => {
        const documentEscape = vi.fn()
        document.addEventListener('keydown', documentEscape)
        const onClose = setup()
        fireEvent.keyDown(screen.getByRole('combobox'), {key: 'Escape'})
        document.removeEventListener('keydown', documentEscape)
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(documentEscape).not.toHaveBeenCalled()
    })

    it('resets the highlight to the first row when new results arrive', async () => {
        setup()
        await type('create')
        const input = screen.getByRole('combobox')
        fireEvent.keyDown(input, {key: 'ArrowDown'})
        fireEvent.keyDown(input, {key: 'ArrowDown'})
        expect(screen.getAllByRole('option')[2].getAttribute('aria-selected')).toBe('true')
        mockSearch.mockResolvedValueOnce([hit({testId: 'only'})])
        await type('create or')
        const options = screen.getAllByRole('option')
        expect(options).toHaveLength(1)
        expect(options[0].getAttribute('aria-selected')).toBe('true')
        expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
    })

    it('scrolls the highlighted row into view on arrow keys', async () => {
        const scroll = vi.fn()
        const original = Element.prototype.scrollIntoView
        Element.prototype.scrollIntoView = scroll
        try {
            setup()
            await type('create')
            scroll.mockClear()
            fireEvent.keyDown(screen.getByRole('combobox'), {key: 'ArrowDown'})
            expect(scroll).toHaveBeenCalledWith({block: 'nearest'})
            expect(scroll.mock.instances[0]).toBe(screen.getAllByRole('option')[1])
        } finally {
            Element.prototype.scrollIntoView = original
        }
    })

    it('Esc closes; a backdrop click closes', () => {
        const onClose = setup()
        fireEvent.keyDown(screen.getByRole('combobox'), {key: 'Escape'})
        expect(onClose).toHaveBeenCalledTimes(1)
        fireEvent.click(document.querySelector('[aria-hidden="true"].fixed')!)
        expect(onClose).toHaveBeenCalledTimes(2)
    })

    it('shows loading, empty and error states', async () => {
        setup()
        mockSearch.mockResolvedValueOnce([])
        fireEvent.change(screen.getByRole('combobox'), {target: {value: 'zzz'}})
        expect(screen.getByText('Searching...')).toBeTruthy()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
        })
        expect(screen.getByText('No tests match')).toBeTruthy()

        mockSearch.mockRejectedValueOnce(new Error('x'))
        await type('yyy')
        expect(screen.getByRole('alert').textContent).toContain('Search failed')
    })

    it('returns focus to the previously focused element on close', () => {
        const {unmount} = render(
            <MemoryRouter>
                <button>opener</button>
            </MemoryRouter>
        )
        const opener = screen.getByText('opener')
        opener.focus()
        const view = render(
            <MemoryRouter>
                <CommandPalette isOpen onClose={vi.fn()} projectTabs={tabs} />
            </MemoryRouter>
        )
        expect(document.activeElement).toBe(screen.getByRole('combobox'))
        view.unmount()
        expect(document.activeElement).toBe(opener)
        unmount()
    })
})

describe('buildTestLinkPath', () => {
    it('matches the shared link format, without project when empty', () => {
        expect(buildTestLinkPath({project: 'web', testId: 'a b'})).toBe(
            '/tests?project=web&testId=a+b'
        )
        expect(buildTestLinkPath({project: '', testId: 'x'})).toBe('/tests?testId=x')
    })
})
