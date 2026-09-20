import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {SettingsJiraSection} from '../settings/SettingsJiraSection'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPut: vi.fn(),
}))

import {authGet, authPut} from '@features/authentication/utils/authFetch'

const jsonResponse = (ok: boolean, body: unknown) =>
    ({ok, json: async () => body}) as unknown as Response

const saved = {
    baseUrl: 'https://x.atlassian.net/browse/',
    chipAlignment: 'left',
    tagMode: 'tickets',
}

const renderSection = () => {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(
        <QueryClientProvider client={queryClient}>
            <SettingsJiraSection />
        </QueryClientProvider>
    )
}

const loaded = async () => {
    renderSection()
    const input = await screen.findByLabelText('Jira base URL')
    await waitFor(() => expect(input).not.toHaveValue(''))
    return input
}

describe('SettingsJiraSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(authGet).mockResolvedValue(jsonResponse(true, {data: saved}))
    })

    it('is titled "Tags & tickets" and uses generic example texts', async () => {
        await loaded()

        expect(screen.getByText('Tags & tickets')).toBeInTheDocument()
        expect(screen.getByLabelText('Jira base URL')).toHaveAttribute(
            'placeholder',
            'https://your-company.atlassian.net/browse/'
        )
    })

    it('loads saved settings and shows the live preview', async () => {
        const input = await loaded()

        expect(input).toHaveValue('https://x.atlassian.net/browse/')
        expect(screen.getByText('https://x.atlassian.net/browse/ABC-123')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()
    })

    it('updates the preview while typing and adds the missing slash', async () => {
        const input = await loaded()

        fireEvent.change(input, {target: {value: 'https://jira.example.com/browse'}})

        expect(screen.getByText('https://jira.example.com/browse/ABC-123')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled()
    })

    it('says links are off when the URL is empty', async () => {
        const input = await loaded()

        fireEvent.change(input, {target: {value: ''}})

        expect(screen.getByText(/plain labels/)).toBeInTheDocument()
    })

    it('saves base URL, position and tag mode with one PUT', async () => {
        vi.mocked(authPut).mockResolvedValue(
            jsonResponse(true, {
                data: {
                    baseUrl: 'https://jira.example.com/browse/',
                    chipAlignment: 'right',
                    tagMode: 'all',
                },
            })
        )
        const input = await loaded()

        fireEvent.change(input, {target: {value: ' https://jira.example.com/browse '}})
        fireEvent.click(screen.getByRole('button', {name: /Column, right/}))
        fireEvent.click(screen.getByRole('button', {name: 'All tags'}))
        fireEvent.click(screen.getByRole('button', {name: 'Save'}))

        await waitFor(() =>
            expect(authPut).toHaveBeenCalledWith(expect.stringContaining('/settings/jira'), {
                baseUrl: 'https://jira.example.com/browse',
                chipAlignment: 'right',
                tagMode: 'all',
            })
        )
        // after save the server-normalised value is shown and Save is clean again
        await waitFor(() => expect(input).toHaveValue('https://jira.example.com/browse/'))
        expect(screen.getByRole('button', {name: /Column, right/})).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(screen.getByRole('button', {name: 'All tags'})).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()
    })

    it('offers three positions and saves "below"', async () => {
        vi.mocked(authPut).mockResolvedValue(
            jsonResponse(true, {data: {...saved, chipAlignment: 'below'}})
        )
        await loaded()

        expect(screen.getByRole('group', {name: 'Chip position'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: /Column, left/})).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(screen.getByRole('button', {name: /Column, right/})).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', {name: /Under test name/}))
        expect(screen.getByRole('button', {name: /Under test name/})).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        fireEvent.click(screen.getByRole('button', {name: 'Save'}))

        await waitFor(() =>
            expect(authPut).toHaveBeenCalledWith(expect.stringContaining('/settings/jira'), {
                baseUrl: 'https://x.atlassian.net/browse/',
                chipAlignment: 'below',
                tagMode: 'tickets',
            })
        )
    })

    describe('Tags to show', () => {
        it('offers "Ticket keys only" / "All tags", reflecting the saved mode, with a hint', async () => {
            await loaded()

            expect(screen.getByRole('group', {name: 'Tags to show'})).toBeInTheDocument()
            expect(screen.getByRole('button', {name: 'Ticket keys only'})).toHaveAttribute(
                'aria-pressed',
                'true'
            )
            expect(screen.getByRole('button', {name: 'All tags'})).toHaveAttribute(
                'aria-pressed',
                'false'
            )
            expect(screen.getByText(/grey and not clickable/)).toBeInTheDocument()
        })

        it('shows a saved "all" mode as selected', async () => {
            vi.mocked(authGet).mockResolvedValue(
                jsonResponse(true, {data: {...saved, tagMode: 'all'}})
            )
            renderSection()

            await waitFor(() =>
                expect(screen.getByRole('button', {name: 'All tags'})).toHaveAttribute(
                    'aria-pressed',
                    'true'
                )
            )
        })

        it('changing only the tag mode enables Save and sends tagMode', async () => {
            vi.mocked(authPut).mockResolvedValue(
                jsonResponse(true, {data: {...saved, tagMode: 'all'}})
            )
            await loaded()
            expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()

            fireEvent.click(screen.getByRole('button', {name: 'All tags'}))

            expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled()
            fireEvent.click(screen.getByRole('button', {name: 'Save'}))
            await waitFor(() =>
                expect(authPut).toHaveBeenCalledWith(expect.stringContaining('/settings/jira'), {
                    baseUrl: 'https://x.atlassian.net/browse/',
                    chipAlignment: 'left',
                    tagMode: 'all',
                })
            )
        })

        it('switching back to the saved value makes Save disabled again', async () => {
            await loaded()

            fireEvent.click(screen.getByRole('button', {name: 'All tags'}))
            fireEvent.click(screen.getByRole('button', {name: 'Ticket keys only'}))

            expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()
        })

        it('shows the server 400 message for a rejected tag mode and keeps the draft', async () => {
            vi.mocked(authPut).mockResolvedValue(
                jsonResponse(false, {message: "tagMode must be 'tickets' or 'all'"})
            )
            await loaded()

            fireEvent.click(screen.getByRole('button', {name: 'All tags'}))
            fireEvent.click(screen.getByRole('button', {name: 'Save'}))

            expect(
                await screen.findByText("tagMode must be 'tickets' or 'all'")
            ).toBeInTheDocument()
            expect(screen.getByRole('button', {name: 'All tags'})).toHaveAttribute(
                'aria-pressed',
                'true'
            )
        })
    })

    it('shows the server 400 message', async () => {
        vi.mocked(authPut).mockResolvedValue(
            jsonResponse(false, {message: 'baseUrl must be empty or a valid http(s) URL'})
        )
        const input = await loaded()

        fireEvent.change(input, {target: {value: 'nope'}})
        fireEvent.click(screen.getByRole('button', {name: 'Save'}))

        expect(
            await screen.findByText('baseUrl must be empty or a valid http(s) URL')
        ).toBeInTheDocument()
    })
})
