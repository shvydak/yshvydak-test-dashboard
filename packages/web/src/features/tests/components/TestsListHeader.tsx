export interface TestsListHeaderProps {
    testsCount: number
}

export function TestsListHeader({testsCount}: TestsListHeaderProps) {
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tests</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
                {testsCount} test{testsCount !== 1 ? 's' : ''} found
            </p>
        </div>
    )
}
