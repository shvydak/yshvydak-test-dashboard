import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, waitFor, act} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import App from '../App'

const mockVerifyToken = vi.fn()
vi.mock('@features/authentication/utils/tokenValidator', () => ({
    verifyToken: () => mockVerifyToken(),
}))
vi.mock('@features/authentication', () => ({
    LoginPage: () => <div>login page</div>,
    setGlobalLogout: vi.fn(),
}))

// Everything else is out of scope here: stubs keep this a test of the token check only
vi.mock('@shared/components', () => ({Header: () => <div>app shell</div>}))
vi.mock('@features/dashboard', () => ({Dashboard: () => null}))
vi.mock('@features/dashboard/components/settings', () => ({SettingsModal: () => null}))
vi.mock('@features/dashboard/components/DiskSpaceWarningBanner', () => ({
    DiskSpaceWarningBanner: () => null,
}))
vi.mock('@features/dashboard/components/CIAutoRunPauseBanner', () => ({
    CIAutoRunPauseBanner: () => null,
}))
vi.mock('@features/dashboard/components/PipelineSkippedBanner', () => ({
    PipelineSkippedBanner: () => null,
}))
vi.mock('@features/dashboard/hooks', () => ({
    useDiskSpaceWarning: () => ({triggerCheck: vi.fn()}),
    useJiraSettings: () => ({}),
}))
vi.mock('@/hooks/useCIAutoRun', () => ({useCIAutoRun: () => ({reload: vi.fn()})}))
vi.mock('@features/tests', () => ({
    TestsList: () => null,
    CommandPalette: () => null,
    useCommandPalette: () => ({isOpen: false, open: vi.fn(), close: vi.fn()}),
}))
vi.mock('@features/tests/components/progress/FloatingProgressPanel', () => ({
    FloatingProgressPanel: () => null,
}))
vi.mock('@features/tests/store/testsStore', () => ({
    useTestsStore: () => ({
        fetchTests: vi.fn(),
        setListProject: vi.fn(),
        isLoading: false,
        rerunTest: vi.fn(),
        checkAndRestoreActiveStates: vi.fn(async () => {}),
        setCIRunQueued: vi.fn(),
        setCIPipelineRunning: vi.fn(),
        setCIStopping: vi.fn(),
    }),
}))
vi.mock('@/hooks/useProjectTabs', () => ({
    useProjectTabs: () => ({
        tabs: [],
        visibleTabs: [],
        isLoading: false,
        reload: vi.fn(),
    }),
    resolveDefaultProjectTab: () => null,
}))
vi.mock('@/hooks/usePipelineStatus', () => ({
    usePipelineStatus: () => ({
        pipeline: null,
        queue: [],
        stopping: false,
        applyPipelineEvent: vi.fn(),
        resync: vi.fn(),
    }),
}))
vi.mock('@/hooks/useProjectStatusSummary', () => ({
    useProjectStatusSummary: () => ({summary: null}),
}))
vi.mock('@/hooks/useProjectRunStatus', () => ({
    useProjectRunStatus: () => ({runningProjects: [], applyRunStatusEvent: vi.fn()}),
}))
vi.mock('../hooks/useWebSocket', () => ({useWebSocket: () => ({isConnected: false})}))

const storeSession = () =>
    localStorage.setItem(
        '_auth',
        JSON.stringify({auth: {token: 't'}, user: {email: 'a@b.c'}, expiresAt: Date.now() + 1e9})
    )

const renderApp = () =>
    render(
        <MemoryRouter initialEntries={['/tests']}>
            <App />
        </MemoryRouter>
    )

describe('App - token check logs out only on a real rejection', () => {
    beforeEach(() => {
        localStorage.clear()
        mockVerifyToken.mockReset()
        storeSession()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('keeps the session when the server cannot answer at startup', async () => {
        mockVerifyToken.mockResolvedValue({valid: false, unknown: true, message: 'boom'})

        renderApp()

        expect(await screen.findByText('app shell')).toBeInTheDocument()
        expect(localStorage.getItem('_auth')).not.toBeNull()
    })

    it('logs out and clears the token when the token is rejected at startup', async () => {
        mockVerifyToken.mockResolvedValue({valid: false, message: 'Token expired or invalid'})

        renderApp()

        expect(await screen.findByText('login page')).toBeInTheDocument()
        expect(localStorage.getItem('_auth')).toBeNull()
    })

    it('keeps the session when the 5-minute check cannot reach the server', async () => {
        mockVerifyToken.mockResolvedValueOnce({valid: true})
        vi.useFakeTimers({shouldAdvanceTime: true})
        renderApp()
        await screen.findByText('app shell')

        mockVerifyToken.mockResolvedValue({valid: false, unknown: true})
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100)
        })

        expect(mockVerifyToken).toHaveBeenCalledTimes(2)
        expect(screen.getByText('app shell')).toBeInTheDocument()
        expect(localStorage.getItem('_auth')).not.toBeNull()
    })

    it('logs out when the 5-minute check finds the token rejected', async () => {
        mockVerifyToken.mockResolvedValueOnce({valid: true})
        vi.useFakeTimers({shouldAdvanceTime: true})
        renderApp()
        await screen.findByText('app shell')

        mockVerifyToken.mockResolvedValue({valid: false, message: 'Token expired or invalid'})
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100)
        })

        await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument())
        expect(localStorage.getItem('_auth')).toBeNull()
    })
})
