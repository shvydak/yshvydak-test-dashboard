/**
 * TestGroupHeader Component Tests
 *
 * Tests the filter-based test name extraction logic:
 * 1. When filter is "failed", extracts test names from group
 * 2. When filter is not "failed", testNames is undefined
 * 3. Integration with runTestsGroup action
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {TestGroupHeader} from '../TestGroupHeader'
import {useTestsStore} from '../../store/testsStore'
import type {TestGroupData} from '../../hooks/useTestGroups'

// Mock the store
vi.mock('../../store/testsStore', () => ({
    useTestsStore: vi.fn(),
}))

describe('TestGroupHeader', () => {
    const mockRunTestsGroup = vi.fn()
    const mockGetIsAnyTestRunning = vi.fn()

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
            // Arrange & Act
            render(
                <TestGroupHeader
                    group={mockGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter="failed"
                />
            )

            const button = screen.getByText('Run Tests Group')
            fireEvent.click(button)

            // Assert
            expect(mockRunTestsGroup).toHaveBeenCalledWith('e2e/tests/auth.spec.ts', [
                'Login Test',
                'Logout Test',
            ])
        })

        it('should not extract test names when filter is "all"', () => {
            // Arrange & Act
            render(
                <TestGroupHeader
                    group={mockGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter="all"
                />
            )

            const button = screen.getByText('Run Tests Group')
            fireEvent.click(button)

            // Assert
            expect(mockRunTestsGroup).toHaveBeenCalledWith('e2e/tests/auth.spec.ts', undefined)
        })

        it('should not extract test names when filter is "passed"', () => {
            // Arrange & Act
            render(
                <TestGroupHeader
                    group={mockGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter="passed"
                />
            )

            const button = screen.getByText('Run Tests Group')
            fireEvent.click(button)

            // Assert
            expect(mockRunTestsGroup).toHaveBeenCalledWith('e2e/tests/auth.spec.ts', undefined)
        })

        it('should not extract test names when filter is undefined', () => {
            // Arrange & Act
            render(
                <TestGroupHeader
                    group={mockGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter={undefined}
                />
            )

            const button = screen.getByText('Run Tests Group')
            fireEvent.click(button)

            // Assert
            expect(mockRunTestsGroup).toHaveBeenCalledWith('e2e/tests/auth.spec.ts', undefined)
        })
    })

    describe('Edge cases', () => {
        it('should handle empty test list in failed filter', () => {
            // Arrange
            const emptyGroup: TestGroupData = {
                ...mockGroup,
                tests: [],
                total: 0,
                failed: 0,
            }

            // Act
            render(
                <TestGroupHeader
                    group={emptyGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter="failed"
                />
            )

            const button = screen.getByText('Run Tests Group')
            fireEvent.click(button)

            // Assert
            expect(mockRunTestsGroup).toHaveBeenCalledWith('e2e/tests/auth.spec.ts', [])
        })

        it('should not run tests when any test is already running', () => {
            // Arrange
            mockGetIsAnyTestRunning.mockReturnValue(true)

            // Act
            render(
                <TestGroupHeader
                    group={mockGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter="failed"
                />
            )

            const button = screen.getByText('Run Tests Group')
            fireEvent.click(button)

            // Assert
            expect(mockRunTestsGroup).not.toHaveBeenCalled()
        })
    })

    describe('UI rendering', () => {
        it('should display file path', () => {
            // Act
            render(
                <TestGroupHeader
                    group={mockGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter="all"
                />
            )

            // Assert
            expect(screen.getByText('e2e/tests/auth.spec.ts')).toBeInTheDocument()
        })

        it('should display test counts', () => {
            // Act
            render(
                <TestGroupHeader
                    group={mockGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter="all"
                />
            )

            // Assert
            expect(screen.getByText('2 tests')).toBeInTheDocument()
            expect(screen.getByText('❌ 2')).toBeInTheDocument()
        })

        it('should show running state when group is running', () => {
            // Arrange
            ;(useTestsStore as any).mockReturnValue({
                runningGroups: new Set(['e2e/tests/auth.spec.ts']),
                getIsAnyTestRunning: mockGetIsAnyTestRunning,
                runTestsGroup: mockRunTestsGroup,
            })

            // Act
            render(
                <TestGroupHeader
                    group={mockGroup}
                    expanded={true}
                    onToggle={() => {}}
                    filter="all"
                />
            )

            // Assert - ActionButton shows "Running..." when isRunning is true
            expect(screen.getByText('Running...')).toBeInTheDocument()
        })
    })
})
