import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import {TestsListFilters} from '../TestsListFilters'
import {useTestsStore} from '../../store/testsStore'

vi.mock('../../store/testsStore', () => ({
    useTestsStore: vi.fn(),
}))

const counts = {all: 0, passed: 0, failed: 0, skipped: 0, pending: 0, noted: 0}

// The store folds the CI flags into getIsAnyTestRunning; getCIBusyReason supplies the tooltip.
function mockStore(overrides: {ciRunQueued?: boolean; ciPipelineRunning?: boolean} = {}) {
    const reason = overrides.ciPipelineRunning
        ? 'A CI pipeline is running'
        : overrides.ciRunQueued
          ? 'A CI run is queued'
          : null
    vi.mocked(useTestsStore).mockReturnValue({
        runAllTests: vi.fn(),
        discoverTests: vi.fn(),
        isRunningAllTests: false,
        isDiscovering: false,
        getIsAnyTestRunning: () => reason !== null,
        getCIBusyReason: () => reason,
    } as any)
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

    it('disables Run All while a CI pipeline is running, with its own tooltip', () => {
        mockStore({ciPipelineRunning: true})
        const {container} = renderFilters()

        expect(screen.getByRole('button', {name: /run all/i})).toBeDisabled()
        expect(screen.getByRole('button', {name: /discovery options/i})).toBeDisabled()
        expect(container.querySelector('[title="A CI pipeline is running"]')).not.toBeNull()
    })
})
