import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {TestsListFilters} from '../TestsListFilters'
import {useTestsStore} from '../../store/testsStore'
import type {StopTarget} from '../../utils/stopTarget'

vi.mock('../../store/testsStore', () => ({
    useTestsStore: vi.fn(),
}))

const counts = {all: 0, passed: 0, failed: 0, skipped: 0, pending: 0, noted: 0}

interface StoreOverrides {
    ciRunQueued?: boolean
    ciPipelineRunning?: boolean
    isRunningAllTests?: boolean
    isDiscovering?: boolean
    ciStopping?: boolean
    stopError?: string | null
    stopTarget?: StopTarget
}

const stopRun = vi.fn()
const PIPELINE_TARGET: StopTarget = {id: 'pipe-1', kind: 'pipeline', name: 'develop'}
const discoverTests = vi.fn()
const clearStopError = vi.fn()

// The store folds the CI flags into getIsAnyTestRunning / getIsStoppable; getCIBusyReason supplies the tooltip.
function mockStore(overrides: StoreOverrides = {}) {
    const reason = overrides.ciPipelineRunning
        ? 'A CI pipeline is running'
        : overrides.ciRunQueued
          ? 'A CI run is queued'
          : null
    const stoppable = Boolean(overrides.ciPipelineRunning || overrides.isRunningAllTests)
    // The component reads through selectors: apply them to the fake state
    const state = {
        runAllTests: vi.fn(),
        discoverTests,
        stopRun,
        getStopTarget: () => overrides.stopTarget ?? PIPELINE_TARGET,
        clearStopError,
        stopError: overrides.stopError ?? null,
        isRunningAllTests: overrides.isRunningAllTests ?? false,
        isDiscovering: overrides.isDiscovering ?? false,
        ciStopping: overrides.ciStopping ?? false,
        getIsAnyTestRunning: () => reason !== null || stoppable || Boolean(overrides.isDiscovering),
        getIsStoppable: () => stoppable,
        getCIBusyReason: () => reason,
    }
    vi.mocked(useTestsStore).mockImplementation(((selector: (s: unknown) => unknown) =>
        selector(state)) as any)
}

function renderFilters() {
    return render(
        <TestsListFilters
            filter="all"
            onFilterChange={vi.fn()}
            counts={counts}
            searchQuery=""
            onSearchChange={vi.fn()}
            activeProject="API_Tests"
        />
    )
}

describe('TestsListFilters Run All', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('is enabled with no tooltip when nothing is queued', () => {
        mockStore()
        const {container} = renderFilters()

        expect(screen.getByRole('button', {name: /run all/i})).not.toBeDisabled()
        expect(screen.getByRole('button', {name: /discovery options/i})).not.toBeDisabled()
        expect(container.querySelector('[title="A CI run is queued"]')).toBeNull()
    })

    it('disables Run All and the discovery split button while a CI run is queued', () => {
        mockStore({ciRunQueued: true})
        renderFilters()

        expect(screen.getByRole('button', {name: /run all/i})).toBeDisabled()
        expect(screen.getByRole('button', {name: /discovery options/i})).toBeDisabled()
    })

    it('explains the disabled state with a title tooltip on the button group', () => {
        mockStore({ciRunQueued: true})
        const {container} = renderFilters()

        const wrapper = container.querySelector('[title="A CI run is queued"]')
        expect(wrapper).not.toBeNull()
        expect(wrapper?.querySelector('button')).not.toBeNull()
    })

    it('keeps the CI pipeline tooltip on the button group while a pipeline runs', () => {
        mockStore({ciPipelineRunning: true})
        const {container} = renderFilters()

        expect(container.querySelector('[title="A CI pipeline is running"]')).not.toBeNull()
    })

    it('stays a disabled Run All during a bare discovery (nothing to stop)', () => {
        mockStore({isDiscovering: true})
        renderFilters()

        expect(screen.getByRole('button', {name: /run all/i})).toBeDisabled()
        expect(screen.queryByRole('button', {name: /^stop/i})).toBeNull()
    })
})

describe('TestsListFilters Discover', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('the Discover Tests menu entry asks for an incremental discovery of the active project', () => {
        mockStore()
        renderFilters()

        fireEvent.click(screen.getByRole('button', {name: /discovery options/i}))
        fireEvent.click(screen.getByRole('button', {name: /discover tests/i}))

        expect(discoverTests).toHaveBeenCalledWith('API_Tests', 'incremental')
    })
})

describe('TestsListFilters Stop', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it.each([
        ['a CI pipeline is running', {ciPipelineRunning: true}],
        ['a manual Run All is running', {isRunningAllTests: true}],
    ])('Run All turns into a Stop button when %s', (_name, overrides) => {
        mockStore(overrides)
        renderFilters()

        expect(screen.getByRole('button', {name: /^stop$/i})).toBeEnabled()
        expect(screen.queryByRole('button', {name: /run all/i})).toBeNull()
        expect(screen.queryByRole('button', {name: /discovery options/i})).toBeNull()
    })

    it('is red (the danger button variant)', () => {
        mockStore({ciPipelineRunning: true})
        renderFilters()

        expect(screen.getByRole('button', {name: /^stop$/i}).className).toContain('bg-danger-500')
    })

    it('asks before stopping and does nothing until confirmed', () => {
        mockStore({ciPipelineRunning: true})
        renderFilters()

        fireEvent.click(screen.getByRole('button', {name: /^stop$/i}))

        expect(screen.getByText('Stop the develop pipeline?')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Tests that already finished keep their results. Unfinished tests keep their previous result.'
            )
        ).toBeInTheDocument()
        expect(stopRun).not.toHaveBeenCalled()
    })

    it('stops the run when the dialog is confirmed, and closes it', () => {
        mockStore({ciPipelineRunning: true})
        renderFilters()

        fireEvent.click(screen.getByRole('button', {name: /^stop$/i}))
        fireEvent.click(screen.getAllByRole('button', {name: /^stop$/i}).at(-1)!)

        expect(stopRun).toHaveBeenCalledTimes(1)
        expect(stopRun).toHaveBeenCalledWith('pipe-1')
        expect(screen.queryByText('Stop the develop pipeline?')).toBeNull()
    })

    it('keeps running when the dialog is cancelled', () => {
        mockStore({ciPipelineRunning: true})
        renderFilters()

        fireEvent.click(screen.getByRole('button', {name: /^stop$/i}))
        fireEvent.click(screen.getByRole('button', {name: /keep running/i}))

        expect(stopRun).not.toHaveBeenCalled()
        expect(screen.queryByText('Stop the develop pipeline?')).toBeNull()
    })

    it.each<[string, StopTarget, string]>([
        ['a pipeline', {id: 'p1', kind: 'pipeline', name: 'develop'}, 'Stop the develop pipeline?'],
        ['a Run All', {id: 'r1', kind: 'run-all', name: 'Smoke'}, 'Stop Run All — Smoke?'],
        [
            'a group run',
            {id: 'r2', kind: 'run-group', name: 'login.spec.ts'},
            'Stop the run of login.spec.ts?',
        ],
        [
            'a rerun',
            {id: 'r3', kind: 'rerun', name: 'user can log in'},
            'Stop the rerun of user can log in?',
        ],
        ['a run the web has no name for', {id: null, kind: 'run'}, 'Stop the run?'],
    ])('the dialog title names the target: %s', (_name, stopTarget, title) => {
        mockStore({ciPipelineRunning: true, stopTarget})
        renderFilters()

        fireEvent.click(screen.getByRole('button', {name: /^stop$/i}))

        expect(screen.getByText(title)).toBeInTheDocument()
    })

    it('Stop sends the id the dialog named when it opened, not whatever runs at the click', () => {
        mockStore({ciPipelineRunning: true, stopTarget: {id: 'run-A', kind: 'run-all'}})
        const view = renderFilters()
        fireEvent.click(screen.getByRole('button', {name: /^stop$/i}))

        // A CI pipeline starts while the dialog is open.
        mockStore({ciPipelineRunning: true, stopTarget: {id: 'pipe-B', kind: 'pipeline'}})
        view.rerender(
            <TestsListFilters
                filter="all"
                onFilterChange={vi.fn()}
                counts={counts}
                searchQuery=""
                onSearchChange={vi.fn()}
                activeProject="API_Tests"
            />
        )
        fireEvent.click(screen.getAllByRole('button', {name: /^stop$/i}).at(-1)!)

        expect(stopRun).toHaveBeenCalledWith('run-A')
    })

    it('with no id known the dialog confirms the global stop (id null)', () => {
        mockStore({ciPipelineRunning: true, stopTarget: {id: null, kind: 'run-all'}})
        renderFilters()

        fireEvent.click(screen.getByRole('button', {name: /^stop$/i}))
        fireEvent.click(screen.getAllByRole('button', {name: /^stop$/i}).at(-1)!)

        expect(stopRun).toHaveBeenCalledWith(null)
    })

    it('shows "Stopping..." and cannot be clicked again while a stop is in progress', () => {
        mockStore({ciPipelineRunning: true, ciStopping: true})
        renderFilters()

        const button = screen.getByRole('button', {name: /stopping/i})
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(screen.queryByText('Stop the run?')).toBeNull()
    })

    it('goes back to Run All once nothing runs', () => {
        mockStore()
        renderFilters()

        expect(screen.getByRole('button', {name: /run all/i})).toBeEnabled()
        expect(screen.queryByRole('button', {name: /^stop/i})).toBeNull()
    })

    describe('TestsListFilters while a stop cleans up', () => {
        it('keeps showing a disabled "Stopping..." even after the run flags cleared (reporter process-end, reload)', () => {
            // Nothing stoppable any more, but the server is still deleting the run's data.
            mockStore({ciStopping: true})
            renderFilters()

            expect(screen.getByRole('button', {name: /stopping/i})).toBeDisabled()
            expect(screen.queryByRole('button', {name: /run all/i})).toBeNull()
        })
    })

    describe('TestsListFilters when a stop fails', () => {
        beforeEach(() => {
            vi.clearAllMocks()
        })

        it('shows the reason next to the Stop button while the run goes on, and keeps Stop clickable', () => {
            mockStore({ciPipelineRunning: true, stopError: 'Sign-in is required to stop a run'})
            renderFilters()

            expect(screen.getByRole('alert')).toHaveTextContent('Sign-in is required to stop a run')
            expect(screen.getByRole('button', {name: /^stop$/i})).toBeEnabled()
        })

        it('a click on the message dismisses it', () => {
            mockStore({ciPipelineRunning: true, stopError: 'Failed to stop the run'})
            renderFilters()

            fireEvent.click(screen.getByRole('alert'))

            expect(clearStopError).toHaveBeenCalledTimes(1)
        })

        it('shows no message when there is none, or when nothing runs any more', () => {
            mockStore({ciPipelineRunning: true})
            const {unmount} = renderFilters()
            expect(screen.queryByRole('alert')).toBeNull()
            unmount()

            mockStore({stopError: 'stale'})
            renderFilters()
            expect(screen.queryByRole('alert')).toBeNull()
        })
    })
})
