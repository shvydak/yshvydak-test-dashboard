import {useMemo, useState} from 'react'
import {TestResult} from '@yshvydak/core'

export type SortColumn = 'name' | 'status' | 'date' | 'duration'
export type SortOrder = 'asc' | 'desc'

export interface UseTestSortReturn {
    sortedTests: TestResult[]
    sortBy: SortColumn
    sortOrder: SortOrder
    handleSort: (column: SortColumn) => void
    getSortIcon: (column: SortColumn) => string
}

export function useTestSort(tests: TestResult[]): UseTestSortReturn {
    const [sortBy, setSortBy] = useState<SortColumn>('name')
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

    const handleSort = (column: SortColumn) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortBy(column)
            setSortOrder('desc')
        }
    }

    const sortedTests = useMemo(() => {
        return [...tests].sort((a, b) => {
            let aValue: any
            let bValue: any

            switch (sortBy) {
                case 'name':
                    aValue = a.name || ''
                    bValue = b.name || ''
                    break
                case 'status':
                    aValue = a.status
                    bValue = b.status
                    break
                case 'date':
                    aValue = new Date(a.updated_at || a.created_at || a.timestamp || 0).getTime()
                    bValue = new Date(b.updated_at || b.created_at || b.timestamp || 0).getTime()
                    break
                case 'duration':
                    aValue = a.duration || 0
                    bValue = b.duration || 0
                    break
                default:
                    return 0
            }

            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1

            return a.id.localeCompare(b.id)
        })
    }, [tests, sortBy, sortOrder])

    const getSortIcon = (column: SortColumn): string => {
        if (sortBy !== column) return '↕️'
        return sortOrder === 'asc' ? '↑' : '↓'
    }

    return {sortedTests, sortBy, sortOrder, handleSort, getSortIcon}
}
