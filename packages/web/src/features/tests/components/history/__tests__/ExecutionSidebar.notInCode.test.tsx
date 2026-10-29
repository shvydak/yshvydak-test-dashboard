import {describe, it, expect, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import {ExecutionSidebar} from '../ExecutionSidebar'

vi.mock('../../../store/testsStore', () => ({
    useTestsStore: vi.fn(() => ({
        runningTests: new Set<string>(),
        getIsAnyTestRunning: () => false,
        activeProgress: null,
    })),
}))

const renderSidebar = (notInCode?: boolean) =>
    render(
        <ExecutionSidebar
            executions={[]}
            currentExecutionId="r1"
            onSelectExecution={vi.fn()}
            onDeleteExecution={vi.fn()}
            testId="r1"
            onRerun={vi.fn()}
            notInCode={notInCode}
        />
    )

describe('ExecutionSidebar Run button', () => {
    it('is disabled for a test that is no longer in the code', () => {
        renderSidebar(true)

        expect(screen.getByRole('button', {name: /run/i})).toBeDisabled()
    })

    it('is enabled otherwise', () => {
        renderSidebar()

        expect(screen.getByRole('button', {name: /run/i})).toBeEnabled()
    })
})
