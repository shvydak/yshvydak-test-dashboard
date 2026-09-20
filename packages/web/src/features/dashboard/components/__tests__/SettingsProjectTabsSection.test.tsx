import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor, within} from '@testing-library/react'
import {SettingsProjectTabsSection} from '../settings/SettingsProjectTabsSection'

vi.mock('@features/authentication/utils/authFetch', () => ({
    authGet: vi.fn(),
    authPut: vi.fn(),
}))

vi.mock('@config/environment.config', () => ({
    config: {api: {baseUrl: 'http://localhost:3000/api'}},
}))

import {authGet, authPut} from '@features/authentication/utils/authFetch'

const mockAuthGet = authGet as ReturnType<typeof vi.fn>
const mockAuthPut = authPut as ReturnType<typeof vi.fn>

const response = (body: unknown, ok = true) =>
    ({ok, json: () => Promise.resolve(body)}) as unknown as Response

const tab = (project: string, extra: Record<string, unknown> = {}) => ({
    project,
    displayName: project,
    visible: true,
    pipelines: ['develop'],
    stopPipelineOnFailure: false,
    ...extra,
})

function mockLoad(saved: unknown[], available: string[], defaultProject = '') {
    mockAuthGet.mockImplementation((url: string) => {
        if (url.includes('/settings/project-tabs')) return Promise.resolve(response({data: saved}))
        if (url.includes('/tests/projects')) return Promise.resolve(response({data: available}))
        if (url.includes('/settings/default-project-tab')) {
            return Promise.resolve(response({data: {project: defaultProject}}))
        }
        return Promise.resolve(response({}, false))
    })
    // Echo tab saves like the server; default-tab PUT returns the cleared default
    mockAuthPut.mockImplementation((url: string, body: any) => {
        if (url.includes('/settings/project-tabs')) {
            return Promise.resolve(response({data: body.configs}))
        }
        return Promise.resolve(response({data: {project: body.project}}))
    })
}

const putCalls = (path: string): any[][] =>
    (mockAuthPut.mock.calls as any[][]).filter(([url]) => String(url).includes(path))
const tabsPutCalls = () => putCalls('/settings/project-tabs')
const defaultPutCalls = () => putCalls('/settings/default-project-tab')

describe('SettingsProjectTabsSection - removing stale tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows the label and Remove only for stale tabs, never for live ones', async () => {
        mockLoad([tab('UI_Tests'), tab('All_Tests')], ['UI_Tests'])
        render(<SettingsProjectTabsSection />)

        await screen.findByLabelText('Remove stale tab All_Tests')

        expect(screen.getAllByText('Not in config')).toHaveLength(1)
        expect(screen.queryByLabelText('Remove stale tab UI_Tests')).not.toBeInTheDocument()
    })

    it('shows no Remove button when the live project list is empty (cannot tell stale from failed)', async () => {
        mockLoad([tab('UI_Tests'), tab('All_Tests')], [])
        render(<SettingsProjectTabsSection />)

        await screen.findByDisplayValue('All_Tests')

        expect(screen.queryByText('Not in config')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: /Remove stale tab/})).not.toBeInTheDocument()
    })

    it('needs a second click: Remove -> Confirm remove / Cancel, nothing saved before confirming', async () => {
        mockLoad([tab('UI_Tests'), tab('All_Tests')], ['UI_Tests'])
        render(<SettingsProjectTabsSection />)

        fireEvent.click(await screen.findByLabelText('Remove stale tab All_Tests'))

        expect(screen.getByLabelText('Confirm remove All_Tests')).toBeInTheDocument()
        expect(screen.getByLabelText('Cancel remove All_Tests')).toBeInTheDocument()
        expect(screen.queryByLabelText('Remove stale tab All_Tests')).not.toBeInTheDocument()
        expect(tabsPutCalls()).toHaveLength(0)
    })

    it('Cancel restores the Remove button and saves nothing', async () => {
        mockLoad([tab('UI_Tests'), tab('All_Tests')], ['UI_Tests'])
        render(<SettingsProjectTabsSection />)

        fireEvent.click(await screen.findByLabelText('Remove stale tab All_Tests'))
        fireEvent.click(screen.getByLabelText('Cancel remove All_Tests'))

        expect(screen.getByLabelText('Remove stale tab All_Tests')).toBeInTheDocument()
        expect(screen.queryByLabelText('Confirm remove All_Tests')).not.toBeInTheDocument()
        expect(screen.getByDisplayValue('All_Tests')).toBeInTheDocument()
        expect(tabsPutCalls()).toHaveLength(0)
    })

    it('Confirm saves the list without the removed tab and drops its row', async () => {
        mockLoad(
            [tab('UI_Tests', {workers: 3}), tab('All_Tests'), tab('API_Tests')],
            ['UI_Tests', 'API_Tests']
        )
        render(<SettingsProjectTabsSection />)

        fireEvent.click(await screen.findByLabelText('Remove stale tab All_Tests'))
        fireEvent.click(screen.getByLabelText('Confirm remove All_Tests'))

        await waitFor(() => expect(tabsPutCalls()).toHaveLength(1))
        const [url, body] = tabsPutCalls()[0]
        expect(url).toBe('http://localhost:3000/api/settings/project-tabs')
        expect(body.configs.map((c: {project: string}) => c.project)).toEqual([
            'UI_Tests',
            'API_Tests',
        ])
        expect(body.configs[0]).toMatchObject({project: 'UI_Tests', workers: 3})

        await waitFor(() =>
            expect(screen.queryByLabelText('Remove stale tab All_Tests')).not.toBeInTheDocument()
        )
        expect(screen.queryByDisplayValue('All_Tests')).not.toBeInTheDocument()
        expect(defaultPutCalls()).toHaveLength(0)
    })

    it('clears the default tab when the removed tab was the default', async () => {
        mockLoad([tab('UI_Tests'), tab('All_Tests')], ['UI_Tests'], 'All_Tests')
        render(<SettingsProjectTabsSection />)

        await waitFor(() =>
            expect(screen.getByLabelText('Default tab on open')).toHaveValue('All_Tests')
        )
        fireEvent.click(screen.getByLabelText('Remove stale tab All_Tests'))
        fireEvent.click(screen.getByLabelText('Confirm remove All_Tests'))

        await waitFor(() => expect(defaultPutCalls()).toHaveLength(1))
        expect(defaultPutCalls()[0]).toEqual([
            'http://localhost:3000/api/settings/default-project-tab',
            {project: ''},
        ])
        await waitFor(() => expect(screen.getByLabelText('Default tab on open')).toHaveValue(''))
    })

    it('keeps the default untouched when a different tab is removed', async () => {
        mockLoad([tab('UI_Tests'), tab('All_Tests')], ['UI_Tests'], 'UI_Tests')
        render(<SettingsProjectTabsSection />)

        fireEvent.click(await screen.findByLabelText('Remove stale tab All_Tests'))
        fireEvent.click(screen.getByLabelText('Confirm remove All_Tests'))

        await waitFor(() => expect(tabsPutCalls()).toHaveLength(1))
        expect(defaultPutCalls()).toHaveLength(0)
        expect(screen.getByLabelText('Default tab on open')).toHaveValue('UI_Tests')
    })

    it('restores the tab and shows the error when saving fails', async () => {
        mockLoad([tab('UI_Tests'), tab('All_Tests')], ['UI_Tests'])
        render(<SettingsProjectTabsSection />)
        await screen.findByLabelText('Remove stale tab All_Tests')
        mockAuthPut.mockResolvedValue(response({message: 'Save failed'}, false))

        fireEvent.click(screen.getByLabelText('Remove stale tab All_Tests'))
        fireEvent.click(screen.getByLabelText('Confirm remove All_Tests'))

        expect(await screen.findByText('Save failed')).toBeInTheDocument()
        expect(screen.getByDisplayValue('All_Tests')).toBeInTheDocument()
        const list = screen.getByLabelText('Remove stale tab All_Tests')
        expect(within(list.parentElement as HTMLElement).getByText('Remove')).toBeInTheDocument()
    })
})
