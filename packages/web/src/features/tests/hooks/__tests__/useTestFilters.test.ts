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

    describe('projectFilter', () => {
        const createMockTestWithProject = (
            id: string,
            status: 'passed' | 'failed' | 'skipped' | 'pending',
            name: string,
            project: string | undefined
        ): TestResult => ({
            id,
            testId: `test-${id}`,
            name,
            filePath: `/path/to/${name}.spec.ts`,
            status,
            duration: 100,
            timestamp: new Date().toISOString(),
            runId: 'run-1',
            project,
        })

        const mixedProjectTests: TestResult[] = [
            createMockTestWithProject('1', 'passed', 'FE Test 1', 'Frontend'),
            createMockTestWithProject('2', 'failed', 'FE Test 2', 'Frontend'),
            createMockTestWithProject('3', 'passed', 'BE Test 1', 'Backend'),
            createMockTestWithProject('4', 'skipped', 'BE Test 2', 'Backend'),
            createMockTestWithProject('5', 'pending', 'No Project Test', undefined),
        ]

        it('should show only tests matching projectFilter', () => {
            const {result} = renderHook(() =>
                useTestFilters({
                    tests: mixedProjectTests,
                    filter: 'all',
                    searchQuery: '',
                    projectFilter: 'Frontend',
                })
            )

            expect(result.current.filteredTests).toHaveLength(2)
            expect(result.current.filteredTests.every((t) => t.project === 'Frontend')).toBe(true)
        })

        it('should apply intersection of projectFilter and status filter', () => {
            const {result} = renderHook(() =>
                useTestFilters({
                    tests: mixedProjectTests,
                    filter: 'failed',
                    searchQuery: '',
                    projectFilter: 'Frontend',
                })
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].id).toBe('2')
            expect(result.current.filteredTests[0].status).toBe('failed')
            expect(result.current.filteredTests[0].project).toBe('Frontend')
        })

        it('should apply intersection of projectFilter and searchQuery', () => {
            const {result} = renderHook(() =>
                useTestFilters({
                    tests: mixedProjectTests,
                    filter: 'all',
                    searchQuery: 'FE Test 1',
                    projectFilter: 'Frontend',
                })
            )

            expect(result.current.filteredTests).toHaveLength(1)
            expect(result.current.filteredTests[0].name).toBe('FE Test 1')
        })

        it('should treat test with undefined project as empty string — does not appear for projectFilter=Frontend', () => {
            const {result} = renderHook(() =>
                useTestFilters({
                    tests: mixedProjectTests,
                    filter: 'all',
                    searchQuery: '',
                    projectFilter: 'Frontend',
                })
            )

            const ids = result.current.filteredTests.map((t) => t.id)
            expect(ids).not.toContain('5')
        })

        it('should show all tests when projectFilter is not set (no regression)', () => {
            const {result} = renderHook(() =>
                useTestFilters({
                    tests: mixedProjectTests,
                    filter: 'all',
                    searchQuery: '',
                })
            )

            expect(result.current.filteredTests).toHaveLength(5)
        })
    })

    describe('Edge cases', () => {
        it('should handle empty test array', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: [], filter: 'all', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(0)
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
        })

        it('should handle empty search query', () => {
            const {result} = renderHook(() =>
                useTestFilters({tests: mockTests, filter: 'all', searchQuery: ''})
            )

            expect(result.current.filteredTests).toHaveLength(6)
        })
    })

    describe('Search by displayed tags', () => {
        const withTags = (test: TestResult, tags: string[]): TestResult => ({
            ...test,
            metadata: {tags},
        })
        const tagged = [
            withTags(createMockTest('1', 'passed', 'Alpha'), ['@ABC-816', '@sanity']),
            withTags(createMockTest('2', 'failed', 'Beta'), ['@ABC-4812']),
            createMockTest('3', 'passed', 'Gamma'),
            // Older Discover rows keep metadata as a JSON string
            {
                ...createMockTest('4', 'pending', 'Delta'),
                metadata: JSON.stringify({tags: ['@ABC-816', '@api']}) as any,
            },
        ]

        const names = (
            query: string,
            tagMode?: 'tickets' | 'all',
            filter: 'all' | 'noted' | 'passed' = 'all'
        ) =>
            renderHook(() =>
                useTestFilters({tests: tagged, filter, searchQuery: query, tagMode})
            ).result.current.filteredTests.map((t) => t.name)

        it.each([undefined, 'tickets', 'all'] as const)(
            'finds tests by full ticket key (tagMode %s)',
            (mode) => {
                expect(names('ABC-816', mode)).toEqual(['Alpha', 'Delta'])
            }
        )

        it('is case-insensitive and matches partial keys', () => {
            expect(names('abc-8')).toEqual(['Alpha', 'Delta'])
            expect(names('abc-4812', 'all')).toEqual(['Beta'])
        })

        it("does not match non-ticket tags in 'tickets' mode (default, as before)", () => {
            expect(names('sanity')).toEqual([])
            expect(names('sanity', 'tickets')).toEqual([])
            expect(names('api', 'tickets')).toEqual([])
        })

        it("matches non-ticket tags only in 'all' mode", () => {
            expect(names('sanity', 'all')).toEqual(['Alpha'])
            expect(names('API', 'all')).toEqual(['Delta'])
        })

        it("ignores a leading @ in the query for displayed tags ('all' mode)", () => {
            expect(names('@sanity', 'all')).toEqual(['Alpha'])
            expect(names('@ABC-4812', 'all')).toEqual(['Beta'])
        })

        it('still matches by name, and combines with the status filter', () => {
            expect(names('gamma')).toEqual(['Gamma'])
            expect(names('ABC-816', 'all', 'passed')).toEqual(['Alpha'])
            expect(names('sanity', 'all', 'passed')).toEqual(['Alpha'])
        })

        it('applies to the noted filter too', () => {
            const noted = [
                withTags(createMockTest('1', 'passed', 'Alpha', true), ['@ABC-816', '@sanity']),
                createMockTest('2', 'passed', 'Beta', true),
            ]
            const run = (query: string, tagMode: 'tickets' | 'all') =>
                renderHook(() =>
                    useTestFilters({tests: noted, filter: 'noted', searchQuery: query, tagMode})
                ).result.current.filteredTests.map((t) => t.name)

            expect(run('ABC-816', 'tickets')).toEqual(['Alpha'])
            expect(run('sanity', 'tickets')).toEqual([])
            expect(run('sanity', 'all')).toEqual(['Alpha'])
        })

        it('re-filters when tagMode changes', () => {
            const {result, rerender} = renderHook(
                ({tagMode}: {tagMode: 'tickets' | 'all'}) =>
                    useTestFilters({
                        tests: tagged,
                        filter: 'all',
                        searchQuery: 'sanity',
                        tagMode,
                    }),
                {initialProps: {tagMode: 'tickets'}}
            )
            expect(result.current.filteredTests).toHaveLength(0)

            rerender({tagMode: 'all'})

            expect(result.current.filteredTests.map((t) => t.name)).toEqual(['Alpha'])
        })
    })
})
