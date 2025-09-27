import {useState, useEffect} from 'react'
import {TestResult} from '@yshvydak/core'
import {useTestsStore} from '../store/testsStore'
import TestDetailModal from './TestDetailModal'

interface TestsListProps {
    onTestSelect: (test: TestResult) => void
    onTestRerun: (testId: string) => void
    selectedTest: TestResult | null
    loading: boolean
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'passed':
            return '✅'
        case 'failed':
            return '❌'
        case 'skipped':
            return '⏭️'
        case 'pending':
            return '⏸️'
        default:
            return '❓'
    }
}

function getStatusColor(status: string) {
    switch (status) {
        case 'passed':
            return 'text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-900/20'
        case 'failed':
            return 'text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20'
        case 'skipped':
            return 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'
        case 'pending':
            return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
        default:
            return 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800'
    }
}

function formatDuration(duration: number) {
    if (duration < 1000) {
        return `${duration}ms`
    }
    return `${(duration / 1000).toFixed(1)}s`
}

function formatLastRun(test: any): string {
    // For pending tests (discovered but never run), show N/A
    if (test.status === 'pending') {
        return 'N/A'
    }

    // For actual test runs, try updatedAt first (most recent), then createdAt, then timestamp
    const dateValue =
        test.updatedAt ||
        test.updated_at ||
        test.createdAt ||
        test.created_at ||
        test.timestamp

    if (!dateValue) {
        return 'N/A'
    }

    try {
        const date = new Date(dateValue)
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return 'N/A'
        }

        date.setHours(date.getHours() + 3)

        const formattedDate = date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
        const formattedTime = date.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
            second: '2-digit',
        })
        return `${formattedTime}, ${formattedDate}`
    } catch (error) {
        return 'N/A'
    }
}

export default function TestsList({
    onTestSelect,
    onTestRerun,
    selectedTest,
    loading,
}: TestsListProps) {
    const {
        tests,
        error,
        runTestsGroup,
        runningGroups,
        runningTests,
        getIsAnyTestRunning,
    } = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()
    const [filter, setFilter] = useState<
        'all' | 'passed' | 'failed' | 'skipped' | 'pending'
    >('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped')
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
    const [detailModalOpen, setDetailModalOpen] = useState(false)
    const [detailModalTest, setDetailModalTest] = useState<TestResult | null>(
        null,
    )
    const [sortBy, setSortBy] = useState<
        'name' | 'status' | 'date' | 'duration'
    >('name')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

    // Filter tests by status and search query
    const filteredTests = tests.filter((test) => {
        // Apply status filter
        const statusMatch = filter === 'all' || test.status === filter

        // Apply search filter
        const searchMatch =
            !searchQuery ||
            (test.name &&
                test.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (test.filePath &&
                test.filePath
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase())) ||
            (test.errorMessage &&
                test.errorMessage
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase()))

        return statusMatch && searchMatch
    })

    // Calculate counts for filter buttons
    const counts = {
        all: tests.length,
        passed: tests.filter((t) => t.status === 'passed').length,
        failed: tests.filter((t) => t.status === 'failed').length,
        skipped: tests.filter((t) => t.status === 'skipped').length,
        pending: tests.filter((t) => t.status === 'pending').length,
    }

    // Group tests by file path
    const groupedTests = filteredTests.reduce((acc, test) => {
        const filePath = test.filePath || 'Unknown File'
        if (!acc[filePath]) {
            acc[filePath] = []
        }
        acc[filePath].push(test)
        return acc
    }, {} as Record<string, TestResult[]>)

    // Calculate stats for each group and sort tests within groups
    const groupStats = Object.entries(groupedTests)
        .sort(([filePathA], [filePathB]) => {
            // Sort groups by file path for stability
            return filePathA.localeCompare(filePathB)
        })
        .map(([filePath, testsInFile]) => {
            // Sort tests within each group by name for stability
            const sortedTestsInFile = [...testsInFile].sort((a, b) => {
                const nameA = a.name || ''
                const nameB = b.name || ''
                const nameComparison = nameA.localeCompare(nameB)
                if (nameComparison !== 0) return nameComparison
                // Secondary sort by ID for ultimate stability
                return a.id.localeCompare(b.id)
            })

            return {
                filePath,
                tests: sortedTestsInFile,
                total: testsInFile.length,
                passed: testsInFile.filter((t) => t.status === 'passed').length,
                failed: testsInFile.filter((t) => t.status === 'failed').length,
                skipped: testsInFile.filter((t) => t.status === 'skipped')
                    .length,
                pending: testsInFile.filter((t) => t.status === 'pending')
                    .length,
            }
        })

    const toggleGroup = (filePath: string) => {
        setExpandedGroups((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(filePath)) {
                newSet.delete(filePath)
            } else {
                newSet.add(filePath)
            }
            return newSet
        })
    }

    const expandAllGroups = () => {
        setExpandedGroups(new Set(groupStats.map((g) => g.filePath)))
    }

    const collapseAllGroups = () => {
        setExpandedGroups(new Set())
    }

    const openTestDetail = (test: TestResult) => {
        setDetailModalTest(test)
        setDetailModalOpen(true)
        onTestSelect(test) // Still call the original handler
    }

    const closeTestDetail = () => {
        setDetailModalOpen(false)
        setDetailModalTest(null)
    }

    const handleSort = (column: 'name' | 'status' | 'date' | 'duration') => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortBy(column)
            setSortOrder('desc')
        }
    }

    // Sort filtered tests for flat view
    const sortedTests = [...filteredTests].sort((a, b) => {
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
                aValue = new Date(
                    a.updated_at || a.created_at || a.timestamp || 0,
                ).getTime()
                bValue = new Date(
                    b.updated_at || b.created_at || b.timestamp || 0,
                ).getTime()
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

        // Secondary sort by test ID for stable sorting
        return a.id.localeCompare(b.id)
    })

    const getSortIcon = (column: 'name' | 'status' | 'date' | 'duration') => {
        if (sortBy !== column) return '↕️'
        return sortOrder === 'asc' ? '↑' : '↓'
    }

    // Automatically expand all groups when groupStats changes
    useEffect(() => {
        const allGroupPaths = groupStats.map((g) => g.filePath)
        setExpandedGroups(new Set(allGroupPaths))
    }, [groupStats.length, groupStats.map((g) => g.filePath).join(',')])

    if (loading && tests.length === 0) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Tests
                    </h1>
                </div>

                <div className="card">
                    <div className="card-content">
                        <div className="text-center py-12">
                            <div className="animate-spin-slow text-4xl mb-4">
                                ⚡
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                Loading tests...
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Tests
                </h1>

                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
                    <div className="flex">
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                                Error loading tests
                            </h3>
                            <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                                <p>{error}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Tests
                    </h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        {filteredTests.length} test
                        {filteredTests.length !== 1 ? 's' : ''} found
                    </p>
                </div>

                <div className="flex items-center space-x-3">
                    {/* Search input */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search tests..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-64 px-4 py-2 pl-10 text-sm border border-gray-200 dark:border-gray-700 rounded-lg 
                                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white 
                                             placeholder-gray-500 dark:placeholder-gray-400
                                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <svg
                                className="w-4 h-4 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                        </div>
                    </div>

                    {/* View mode toggle */}
                    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <button
                            onClick={() => setViewMode('grouped')}
                            className={`px-3 py-2 text-sm font-medium transition-colors border-r border-gray-200 dark:border-gray-700 ${
                                viewMode === 'grouped'
                                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}>
                            📁 Grouped
                        </button>
                        <button
                            onClick={() => setViewMode('flat')}
                            className={`px-3 py-2 text-sm font-medium transition-colors ${
                                viewMode === 'flat'
                                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}>
                            📄 Flat
                        </button>
                    </div>

                    {/* Group controls - only show in grouped mode */}
                    {viewMode === 'grouped' && (
                        <div className="flex space-x-2">
                            <button
                                onClick={expandAllGroups}
                                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                Expand All
                            </button>
                            <button
                                onClick={collapseAllGroups}
                                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                Collapse All
                            </button>
                        </div>
                    )}

                    {/* Filter buttons with counts */}
                    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {(
                            [
                                {
                                    key: 'all',
                                    label: 'All',
                                    count: counts.all,
                                },
                                {
                                    key: 'passed',
                                    label: 'Passed',
                                    count: counts.passed,
                                },
                                {
                                    key: 'failed',
                                    label: 'Failed',
                                    count: counts.failed,
                                },
                                {
                                    key: 'skipped',
                                    label: 'Skipped',
                                    count: counts.skipped,
                                },
                                {
                                    key: 'pending',
                                    label: 'Pending',
                                    count: counts.pending,
                                },
                            ] as const
                        ).map((item) => (
                            <button
                                key={item.key}
                                onClick={() => setFilter(item.key)}
                                className={`px-4 py-2 text-sm font-medium transition-colors border-r border-gray-200 dark:border-gray-700 last:border-r-0 ${
                                    filter === item.key
                                        ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}>
                                {item.label} ({item.count})
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tests Content */}
            {filteredTests.length === 0 ? (
                <div className="card">
                    <div className="card-content">
                        <div className="text-center py-12">
                            <p className="text-gray-500 dark:text-gray-400">
                                No tests found
                                {searchQuery && ` matching "${searchQuery}"`}
                                {filter !== 'all' && ` with status: ${filter}`}
                            </p>
                        </div>
                    </div>
                </div>
            ) : viewMode === 'grouped' ? (
                /* Grouped View */
                <div className="space-y-4">
                    {groupStats.map((group) => (
                        <div key={group.filePath} className="card">
                            {/* Group Header */}
                            <div
                                className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                onClick={() => toggleGroup(group.filePath)}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <span className="text-gray-400">
                                            {expandedGroups.has(group.filePath)
                                                ? '▼'
                                                : '▶'}
                                        </span>
                                        <span className="font-medium text-gray-900 dark:text-white font-mono text-sm">
                                            {group.filePath}
                                        </span>
                                    </div>
                                    <div className="flex items-center space-x-4 text-sm">
                                        <button
                                            className={`px-3 py-1 text-xs rounded transition-colors ${
                                                runningGroups.has(
                                                    group.filePath,
                                                ) || isAnyTestRunning
                                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                                    : 'bg-primary-600 text-white hover:bg-primary-700'
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation() // Prevent group toggle
                                                if (!isAnyTestRunning) {
                                                    runTestsGroup(
                                                        group.filePath,
                                                    )
                                                }
                                            }}
                                            disabled={isAnyTestRunning}>
                                            {runningGroups.has(
                                                group.filePath,
                                            ) ? (
                                                <span className="flex items-center space-x-1">
                                                    <span className="animate-spin">
                                                        🔄
                                                    </span>
                                                    <span>Running...</span>
                                                </span>
                                            ) : (
                                                <>▶️ Run Tests Group</>
                                            )}
                                        </button>
                                        <span className="text-gray-600 dark:text-gray-400">
                                            {group.total} test
                                            {group.total !== 1 ? 's' : ''}
                                        </span>
                                        {group.passed > 0 && (
                                            <span className="text-success-600 dark:text-success-400">
                                                ✅ {group.passed}
                                            </span>
                                        )}
                                        {group.failed > 0 && (
                                            <span className="text-danger-600 dark:text-danger-400">
                                                ❌ {group.failed}
                                            </span>
                                        )}
                                        {group.skipped > 0 && (
                                            <span className="text-warning-600 dark:text-warning-400">
                                                ⏭️ {group.skipped}
                                            </span>
                                        )}
                                        {group.pending > 0 && (
                                            <span className="text-blue-600 dark:text-blue-400">
                                                ⏸️ {group.pending}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Group Tests - Only show if expanded */}
                            {expandedGroups.has(group.filePath) && (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                                <th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    Status
                                                </th>
                                                <th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    Test Name
                                                </th>
                                                <th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    Duration
                                                </th>
                                                <th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    Last Run
                                                </th>
                                                <th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.tests.map((test) => (
                                                <tr
                                                    key={test.id}
                                                    className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                                                        selectedTest?.id ===
                                                        test.id
                                                            ? 'bg-primary-50 dark:bg-primary-900/20'
                                                            : ''
                                                    }`}
                                                    onClick={() =>
                                                        openTestDetail(test)
                                                    }>
                                                    <td className="py-3 px-6">
                                                        <span
                                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                                                test.status,
                                                            )}`}>
                                                            <span className="mr-1">
                                                                {getStatusIcon(
                                                                    test.status,
                                                                )}
                                                            </span>
                                                            {test.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-6">
                                                        <div className="font-medium text-gray-900 dark:text-white">
                                                            {test.name}
                                                        </div>
                                                        {test.errorMessage && (
                                                            <div className="text-xs text-red-600 dark:text-red-400 mt-1 truncate max-w-xs">
                                                                {
                                                                    test.errorMessage
                                                                }
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-6 text-sm text-gray-600 dark:text-gray-400">
                                                        {formatDuration(
                                                            test.duration,
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-6 text-sm text-gray-600 dark:text-gray-400">
                                                        {formatLastRun(test)}
                                                    </td>
                                                    <td className="py-3 px-6">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                onTestRerun(
                                                                    test.id,
                                                                )
                                                            }}
                                                            disabled={
                                                                runningTests.has(
                                                                    test.id,
                                                                ) ||
                                                                isAnyTestRunning
                                                            }
                                                            className={`text-sm px-3 py-1 rounded-md transition-colors ${
                                                                runningTests.has(
                                                                    test.id,
                                                                ) ||
                                                                isAnyTestRunning
                                                                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                                                    : 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800'
                                                            }`}>
                                                            {runningTests.has(
                                                                test.id,
                                                            ) ? (
                                                                <span className="flex items-center space-x-1">
                                                                    <span className="animate-spin">
                                                                        ⚡
                                                                    </span>
                                                                    <span>
                                                                        Running...
                                                                    </span>
                                                                </span>
                                                            ) : (
                                                                '▶️ Run'
                                                            )}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                /* Flat View - Original Table */
                <div className="card">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th
                                        className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                                        onClick={() => handleSort('status')}>
                                        Status {getSortIcon('status')}
                                    </th>
                                    <th
                                        className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                                        onClick={() => handleSort('name')}>
                                        Test Name {getSortIcon('name')}
                                    </th>
                                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400">
                                        File Path
                                    </th>
                                    <th
                                        className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                                        onClick={() => handleSort('duration')}>
                                        Duration {getSortIcon('duration')}
                                    </th>
                                    <th
                                        className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                                        onClick={() => handleSort('date')}>
                                        Last Run {getSortIcon('date')}
                                    </th>
                                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-600 dark:text-gray-400">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTests.map((test) => (
                                    <tr
                                        key={test.id}
                                        className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                                            selectedTest?.id === test.id
                                                ? 'bg-primary-50 dark:bg-primary-900/20'
                                                : ''
                                        }`}
                                        onClick={() => openTestDetail(test)}>
                                        <td className="py-4 px-6">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                                    test.status,
                                                )}`}>
                                                <span className="mr-1">
                                                    {getStatusIcon(test.status)}
                                                </span>
                                                {test.status}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {test.name}
                                            </div>
                                            {test.errorMessage && (
                                                <div className="text-xs text-red-600 dark:text-red-400 mt-1 truncate max-w-xs">
                                                    {test.errorMessage}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400 font-mono">
                                            {test.filePath}
                                        </td>
                                        <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">
                                            {formatDuration(test.duration)}
                                        </td>
                                        <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">
                                            {formatLastRun(test)}
                                        </td>
                                        <td className="py-4 px-6">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onTestRerun(test.id)
                                                }}
                                                disabled={
                                                    runningTests.has(test.id) ||
                                                    isAnyTestRunning
                                                }
                                                className={`text-sm px-3 py-1 rounded-md transition-colors ${
                                                    runningTests.has(test.id) ||
                                                    isAnyTestRunning
                                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                                        : 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800'
                                                }`}>
                                                {runningTests.has(test.id) ? (
                                                    <span className="flex items-center space-x-1">
                                                        <span className="animate-spin">
                                                            ⚡
                                                        </span>
                                                        <span>Running...</span>
                                                    </span>
                                                ) : (
                                                    '▶️ Run'
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Test Detail Modal */}
            <TestDetailModal
                test={detailModalTest}
                isOpen={detailModalOpen}
                onClose={closeTestDetail}
            />
        </div>
    )
}
