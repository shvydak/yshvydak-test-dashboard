import {useMemo} from 'react'
import {TestResult} from '@yshvydak/core'
import {FilterKey} from '../constants'

export interface UseTestFiltersProps {
    tests: TestResult[]
    filter: FilterKey
    searchQuery: string
    projectFilter?: string
}

export interface UseTestFiltersReturn {
    filteredTests: TestResult[]
    counts: {
        all: number
        passed: number
        failed: number
        skipped: number
        pending: number
        noted: number
    }
}

export function useTestFilters({
    tests,
    filter,
    searchQuery,
    projectFilter,
}: UseTestFiltersProps): UseTestFiltersReturn {
    const filteredTests = useMemo(() => {
        return tests.filter((test) => {
            // Project filter: strict match — only tests belonging to this project
            if (projectFilter) {
                if ((test.project || '') !== projectFilter) return false
            }
            // Handle 'noted' filter - show only tests with notes
            if (filter === 'noted') {
                const hasNote = test.note && test.note.content && test.note.content.trim() !== ''

                const searchMatch =
                    !searchQuery ||
                    (test.name && test.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (test.filePath &&
                        test.filePath.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (test.errorMessage &&
                        test.errorMessage.toLowerCase().includes(searchQuery.toLowerCase()))

                return hasNote && searchMatch
            }

            // Handle other filters (all, passed, failed, skipped, pending)
            const statusMatch = filter === 'all' || test.status === filter

            const searchMatch =
                !searchQuery ||
                (test.name && test.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (test.filePath &&
                    test.filePath.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (test.errorMessage &&
                    test.errorMessage.toLowerCase().includes(searchQuery.toLowerCase()))

            return statusMatch && searchMatch
        })
    }, [tests, filter, searchQuery, projectFilter])

    const projectTests = useMemo(
        () => (projectFilter ? tests.filter((t) => (t.project || '') === projectFilter) : tests),
        [tests, projectFilter]
    )

    const counts = useMemo(
        () => ({
            all: projectTests.length,
            passed: projectTests.filter((t) => t.status === 'passed').length,
            failed: projectTests.filter((t) => t.status === 'failed').length,
            skipped: projectTests.filter((t) => t.status === 'skipped').length,
            pending: projectTests.filter((t) => t.status === 'pending').length,
            noted: projectTests.filter(
                (t) => t.note && t.note.content && t.note.content.trim() !== ''
            ).length,
        }),
        [projectTests]
    )

    return {filteredTests, counts}
}
