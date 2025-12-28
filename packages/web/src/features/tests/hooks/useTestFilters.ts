import {useMemo} from 'react'
import {TestResult} from '@yshvydak/core'
import {FilterKey} from '../constants'

export interface UseTestFiltersProps {
    tests: TestResult[]
    filter: FilterKey
    searchQuery: string
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
}: UseTestFiltersProps): UseTestFiltersReturn {
    const filteredTests = useMemo(() => {
        return tests.filter((test) => {
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
    }, [tests, filter, searchQuery])

    const counts = useMemo(
        () => ({
            all: tests.length,
            passed: tests.filter((t) => t.status === 'passed').length,
            failed: tests.filter((t) => t.status === 'failed').length,
            skipped: tests.filter((t) => t.status === 'skipped').length,
            pending: tests.filter((t) => t.status === 'pending').length,
            noted: tests.filter((t) => t.note && t.note.content && t.note.content.trim() !== '')
                .length,
        }),
        [tests]
    )

    return {filteredTests, counts}
}
