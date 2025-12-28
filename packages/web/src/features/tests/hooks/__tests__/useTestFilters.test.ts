import {renderHook} from '@testing-library/react'
import {describe, it, expect} from 'vitest'
import {useTestFilters} from '../useTestFilters'
import {TestResult} from '@yshvydak/core'

const createMockTest = (
    id: string,
    status: 'passed' | 'failed' | 'skipped' | 'pending',
    name: string,
    hasNote: boolean = false
): TestResult => ({
    id,
    testId: `test-${id}`,
    name,
    filePath: `/path/to/${name}.spec.ts`,
    status,
    duration: 100,
    timestamp: new Date().toISOString(),
    runId: 'run-1',
    ...(hasNote && {
        note: {
            testId: `test-${id}`,
            content: 'This is a test note',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    }),
})

describe('useTestFilters', () => {
    const mockTests: TestResult[] = [
        createMockTest('1', 'passed', 'Test 1', true),
        createMockTest('2', 'failed', 'Test 2', false),
        createMockTest('3', 'passed', 'Test 3', false),
        createMockTest('4', 'skipped', 'Test 4', true),
        createMockTest('5', 'pending', 'Test 5', false),
        createMockTest('6', 'failed', 'Test 6', true),
    ]

    describe('Filter by status', () => {
        it('should return all tests when filter is "all"', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'all', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(6)
        })

        it('should filter passed tests', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'passed', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(2)
            expect(result.current.filteredTests.every((t) => t.status === 'passed')).toBe(true)
        })

        it('should filter failed tests', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'failed', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(2)
            expect(result.current.filteredTests.every((t) => t.status === 'failed')).toBe(true)
        })

        it('should filter skipped tests', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'skipped', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].status).toBe('skipped')
        })

        it('should filter pending tests', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'pending', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].status).toBe('pending')
        })
    })

    describe('Filter by noted', () => {
        it('should filter tests with notes when filter is "noted"', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'noted', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(3)
            expect(result.current.filteredTests.every((t) => t.note && t.note.content)).toBe(true)
        })

        it('should return only tests with non-empty notes', () => {
            const testsWithEmptyNote: TestResult[] = [
                createMockTest('1', 'passed', 'Test 1', true),
                {
                    ...createMockTest('2', 'failed', 'Test 2', false),
                    note: {
                        testId: 'test-2',
                        content: '',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                },
                {
                    ...createMockTest('3', 'passed', 'Test 3', false),
                    note: {
                        testId: 'test-3',
                        content: '   ',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                },
            ]

            const {result} = renderHook(() =>
                useTestFilters({tests: testsWithEmptyNote, filter: 'noted', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].id).toBe('1')
        })

        it('should combine noted filter with search query', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'noted', searchQuery: 'Test 1'})
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].name).toBe('Test 1')
        })
    })

    describe('Search functionality', () => {
        it('should filter by test name', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'all', searchQuery: 'Test 1'})
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].name).toBe('Test 1')
        })

        it('should filter by file path', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'all', searchQuery: 'Test 2.spec'})
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].name).toBe('Test 2')
        })

        it('should be case insensitive', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'all', searchQuery: 'test 3'})
            )

            expect(result.current.filteredTests).toHaveLength(1)
        })

        it('should combine filter and search', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'passed', searchQuery: 'Test 1'})
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].name).toBe('Test 1')
            expect(result.current.filteredTests[0].status).toBe('passed')
        })
    })

    describe('Counts', () => {
        it('should correctly count all test statuses', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'all', searchQuery: ''})
            )

            expect(result.current.counts).toEqual({
                all: 6,
                passed: 2,
                failed: 2,
                skipped: 1,
                pending: 1,
                noted: 3,
            })
        })

        it('should count tests with notes', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'all', searchQuery: ''})
            )

            expect(result.current.counts.noted).toBe(3)
        })

        it('should not count tests with empty notes', () => {
            const testsWithEmptyNotes: TestResult[] = [
                createMockTest('1', 'passed', 'Test 1', true),
                {
                    ...createMockTest('2', 'failed', 'Test 2', false),
                    note: {
                        testId: 'test-2',
                        content: '',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                },
            ]

            const {result} = renderHook(() =>
                useTestFilters({tests: testsWithEmptyNotes, filter: 'all', searchQuery: ''})
            )

            expect(result.current.counts.noted).toBe(1)
        })

        it('should update counts when tests change', () => {
            const {result, rerender} = renderHook(
                ({tests}) => useTestFilters({tests, filter: 'all', searchQuery: ''}),
                {initialProps: {tests: mockTests}}
            )

            expect(result.current.counts.noted).toBe(3)

            const newTests = [...mockTests, createMockTest('7', 'passed', 'Test 7', true)]
            rerender({tests: newTests})

            expect(result.current.counts.noted).toBe(4)
        })
    })

    describe('Edge cases', () => {
        it('should handle empty test array', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: [], filter: 'all', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(0)
            expect(result.current.counts.all).toBe(0)
            expect(result.current.counts.noted).toBe(0)
        })

        it('should handle tests without notes field', () => {
            const testsWithoutNotes: TestResult[] = [
                createMockTest('1', 'passed', 'Test 1', false),
                createMockTest('2', 'failed', 'Test 2', false),
            ]

            const {result} = renderHook(() =>
                useTestFilters({tests: testsWithoutNotes, filter: 'noted', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(0)
            expect(result.current.counts.noted).toBe(0)
        })

        it('should handle empty search query', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'all', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(6)
        })
    })
})
