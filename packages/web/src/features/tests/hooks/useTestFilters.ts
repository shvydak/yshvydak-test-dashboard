import {useMemo} from 'react'
import {TestResult} from '@yshvydak/core'
import {FilterKey} from '../constants'
import {getTestDisplayTags, displayTagMatchesQuery} from '../utils/jiraTags'
import type {TagMode} from '@features/dashboard/hooks/useJiraSettings'

export interface UseTestFiltersProps {
    tests: TestResult[]
    filter: FilterKey
    searchQuery: string
    projectFilter?: string
    /** Tags shown as chips; search matches exactly the displayed ones. Default 'tickets'. */
    tagMode?: TagMode
}

export interface UseTestFiltersReturn {
    filteredTests: TestResult[]
}

// Case-insensitive match on name, file path, error message and the tags DISPLAYED under
// the current tag mode (ticket keys only, or all tags).
function matchesSearch(test: TestResult, searchQuery: string, tagMode: TagMode): boolean {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
        !!(test.name && test.name.toLowerCase().includes(query)) ||
        !!(test.filePath && test.filePath.toLowerCase().includes(query)) ||
        !!(test.errorMessage && test.errorMessage.toLowerCase().includes(query)) ||
        getTestDisplayTags(test, tagMode).some((tag) =>
            displayTagMatchesQuery(tag.label, searchQuery)
        )
    )
}

export function useTestFilters({
    tests,
    filter,
    searchQuery,
    projectFilter,
    tagMode = 'tickets',
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
                return hasNote && matchesSearch(test, searchQuery, tagMode)
            }

            // Handle other filters (all, passed, failed, skipped, pending)
            const statusMatch = filter === 'all' || test.status === filter
            return statusMatch && matchesSearch(test, searchQuery, tagMode)
        })
    }, [tests, filter, searchQuery, projectFilter, tagMode])

    return {filteredTests}
}
