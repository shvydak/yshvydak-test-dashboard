import {describe, it, expect, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {TestDetailHeader} from '../TestDetailHeader'
import {JIRA_SETTINGS_QUERY_KEY} from '@features/dashboard/hooks/useJiraSettings'
import {getDisplayTags} from '../../../utils/jiraTags'
import type {DisplayTag} from '../../../utils/jiraTags'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPut: vi.fn(),
}))

const renderHeader = (tags?: DisplayTag[]) => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, {
        baseUrl: 'https://x.atlassian.net/browse/',
        chipAlignment: 'right',
        tagMode: 'all',
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <TestDetailHeader
                testName="Open fault allows only Complete with fault"
                testStatus="passed"
                tags={tags}
                isLatest
                onClose={vi.fn()}
                onBackToLatest={vi.fn()}
            />
        </QueryClientProvider>
    )
}

const raw = ['@ABC-816', '@sanity', '@ABC-4812']

describe('TestDetailHeader tag chips', () => {
    it('tickets mode: shows ticket chips under the title as links, no other tags', () => {
        renderHeader(getDisplayTags(raw, 'tickets'))

        expect(screen.getByRole('link', {name: 'ABC-816'})).toHaveAttribute(
            'href',
            'https://x.atlassian.net/browse/ABC-816'
        )
        expect(screen.getByRole('link', {name: 'ABC-4812'})).toBeInTheDocument()
        expect(screen.queryByText('sanity')).not.toBeInTheDocument()
    })

    it('all mode: also shows other tags as grey non-clickable chips, in order', () => {
        renderHeader(getDisplayTags(raw, 'all'))

        expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
            'ABC-816',
            'ABC-4812',
        ])
        const other = screen.getByText('sanity')
        expect(other.tagName).toBe('SPAN')
        expect(other).toHaveAttribute('data-kind', 'other')
        expect(
            screen.getAllByText(/^(ABC-816|sanity|ABC-4812)$/).map((el) => el.textContent)
        ).toEqual(['ABC-816', 'sanity', 'ABC-4812'])
    })

    it('ignores the list column alignment (chips stay left) and never highlights', () => {
        renderHeader(getDisplayTags(raw, 'all'))

        expect(screen.getByText('sanity').parentElement).not.toHaveClass('justify-end')
        expect(document.querySelector('[data-hit]')).toBeNull()
    })

    it('renders no chips without tags', () => {
        renderHeader()

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(document.querySelector('[data-kind]')).toBeNull()
    })
})

describe('TestDetailHeader not in code', () => {
    const renderOrphan = (notInCode: boolean) => {
        const queryClient = new QueryClient()
        queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, {
            baseUrl: 'https://x.atlassian.net/browse/',
            chipAlignment: 'right',
            tagMode: 'all',
        })
        return render(
            <QueryClientProvider client={queryClient}>
                <TestDetailHeader
                    testName="Gone test"
                    testStatus="passed"
                    isLatest
                    onClose={vi.fn()}
                    onBackToLatest={vi.fn()}
                    onDelete={vi.fn()}
                    onRerun={vi.fn()}
                    notInCode={notInCode}
                    project="UI_Tests"
                />
            </QueryClientProvider>
        )
    }

    it('says Delete removes the whole history in every project, and turns Run off', () => {
        renderOrphan(true)

        expect(
            screen.getByText(
                /Not found in UI_Tests's latest Discover\. Delete removes this test's whole history in every project\./
            )
        ).toBeInTheDocument()
        expect(screen.getByRole('button', {name: /run/i})).toBeDisabled()
    })

    it('keeps Delete visible at every width for a not-in-code test, desktop-only otherwise', () => {
        const {unmount} = renderOrphan(true)
        expect(screen.getByRole('button', {name: /delete test/i}).className).not.toContain('hidden')
        unmount()

        renderOrphan(false)
        expect(screen.getByRole('button', {name: /delete test/i}).className).toContain('hidden')
    })

    it('shows no notice for a test that is in code', () => {
        renderOrphan(false)

        expect(screen.queryByText(/latest Discover/)).toBeNull()
        expect(screen.getByRole('button', {name: /run/i})).toBeEnabled()
    })
})
