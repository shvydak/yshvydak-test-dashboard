/**
 * TestGroupHeader Component Tests
 *
 * 1. Filter-based test name extraction (failed / other filters)
 * 2. Project-aware run behaviour (disabled without project, passes project on click)
 * 3. Edge cases and UI rendering
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {TestGroupHeader} from '../TestGroupHeader'
import {useTestsStore} from '../../store/testsStore'
import type {TestGroupData} from '../../hooks/useTestGroups'

vi.mock('../../store/testsStore', () => ({
    useTestsStore: vi.fn(),
}))

const mockGroup: TestGroupData = {
    filePath: 'e2e/tests/auth.spec.ts',
    tests: [
        {
            id: '1',
            testId: 'test-1',
            name: 'Login Test',
            filePath: 'e2e/tests/auth.spec.ts',
            status: 'failed',
            duration: 100,
            runId: 'run-1',
            timestamp: '2025-01-01T00:00:00Z',
        },
        {
            id: '2',
            testId: 'test-2',
            name: 'Logout Test',
            filePath: 'e2e/tests/auth.spec.ts',
            status: 'failed',
            duration: 150,
            runId: 'run-1',
            timestamp: '2025-01-01T00:00:00Z',
        },
    ],
    total: 2,
    passed: 0,
    failed: 2,
    skipped: 0,
    pending: 0,
}

const renderHeader = (
    props: Partial<Parameters<typeof TestGroupHeader>[0]> = {},
    url = '/?project=All_Tests'
) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <TestGroupHeader group={mockGroup} expanded={true} onToggle={() => {}} {...props} />
        </MemoryRouter>
    )

describe('TestGroupHeader', () => {
    const mockRunTestsGroup = vi.fn()
    const mockGetIsAnyTestRunning = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        mockGetIsAnyTestRunning.mockReturnValue(false)
        ;(useTestsStore as any).mockReturnValue({
            runningGroups: new Set(),
            getIsAnyTestRunning: mockGetIsAnyTestRunning,
            runTestsGroup: mockRunTestsGroup,
        })
    })

    describe('Filter-based test name extraction', () => {
        it('should extract test names when filter is "failed"', () => {
            renderHeader({filter: 'failed'})

            fireEvent.click(screen.getByText('Run Tests Group'))

            expect(mockRunTestsGroup).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                ['Login Test', 'Logout Test'],
                'All_Tests'
            )
        })

        it('should not extract test names when filter is "all"', () => {
            renderHeader({filter: 'all'})

            fireEvent.click(screen.getByText('Run Tests Group'))

            expect(mockRunTestsGroup).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                undefined,
                'All_Tests'
            )
        })

        it('should not extract test names when filter is "passed"', () => {
            renderHeader({filter: 'passed'})

            fireEvent.click(screen.getByText('Run Tests Group'))

            expect(mockRunTestsGroup).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                undefined,
                'All_Tests'
            )
        })

        it('should not extract test names when filter is undefined', () => {
            renderHeader({filter: undefined})

            fireEvent.click(screen.getByText('Run Tests Group'))

            expect(mockRunTestsGroup).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                undefined,
                'All_Tests'
            )
        })
    })

    describe('Project-aware run behaviour', () => {
        it('should disable the button when no project is in the URL', () => {
            renderHeader({filter: 'all'}, '/')

            const button = screen.getByRole('button', {name: /run tests group/i})
            expect(button).toBeDisabled()
        })

        it('should enable the button when a project is in the URL', () => {
            renderHeader({filter: 'all'}, '/?project=All_Tests')

            const button = screen.getByRole('button', {name: /run tests group/i})
            expect(button).not.toBeDisabled()
        })

        it('should not call runTestsGroup when no project is in the URL', () => {
            renderHeader({filter: 'all'}, '/')

            fireEvent.click(screen.getByText('Run Tests Group'))

            expect(mockRunTestsGroup).not.toHaveBeenCalled()
        })

        it('should pass the active project from the URL to runTestsGroup', () => {
            renderHeader({filter: 'all'}, '/?project=Staging')

            fireEvent.click(screen.getByText('Run Tests Group'))

            expect(mockRunTestsGroup).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                undefined,
                'Staging'
            )
        })

        it('should show tooltip text when no project is selected', () => {
            renderHeader({filter: 'all'}, '/')

            expect(screen.getByText('Select a project tab to run tests')).toBeInTheDocument()
        })

        it('should not show tooltip text when a project is selected', () => {
            renderHeader({filter: 'all'}, '/?project=All_Tests')

            expect(screen.queryByText('Select a project tab to run tests')).not.toBeInTheDocument()
        })
    })

    describe('Edge cases', () => {
        it('should handle empty test list in failed filter', () => {
            const emptyGroup: TestGroupData = {...mockGroup, tests: [], total: 0, failed: 0}

            render(
                <MemoryRouter initialEntries={['/?project=All_Tests']}>
                    <TestGroupHeader
                        group={emptyGroup}
                        expanded={true}
                        onToggle={() => {}}
                        filter="failed"
                    />
                </MemoryRouter>
            )

            fireEvent.click(screen.getByText('Run Tests Group'))

            expect(mockRunTestsGroup).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                [],
                'All_Tests'
            )
        })

        it('should not run tests when any test is already running', () => {
            mockGetIsAnyTestRunning.mockReturnValue(true)

            renderHeader({filter: 'failed'})

            fireEvent.click(screen.getByText('Run Tests Group'))

            expect(mockRunTestsGroup).not.toHaveBeenCalled()
        })
    })

    describe('UI rendering', () => {
        it('should display file path', () => {
            renderHeader({filter: 'all'})

            expect(screen.getByText('e2e/tests/auth.spec.ts')).toBeInTheDocument()
        })

        it('should display test counts', () => {
            renderHeader({filter: 'all'})

            expect(screen.getByText('2 tests')).toBeInTheDocument()
            expect(screen.getAllByText('2', {exact: false}).length).toBeGreaterThan(0)
        })

        it('should show running state when group is running', () => {
            ;(useTestsStore as any).mockReturnValue({
                runningGroups: new Set(['e2e/tests/auth.spec.ts']),
                getIsAnyTestRunning: mockGetIsAnyTestRunning,
                runTestsGroup: mockRunTestsGroup,
            })

            renderHeader({filter: 'all'})

            expect(screen.getByText('Running...')).toBeInTheDocument()
        })
    })
})
