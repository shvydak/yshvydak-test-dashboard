export interface TestsListHeaderProps {
    testsCount: number
}

export function TestsListHeader({testsCount}: TestsListHeaderProps) {
    return (
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Tests
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="tabular-nums">{testsCount}</span> test
                {testsCount !== 1 ? 's' : ''} found
            </p>
        </div>
    )
}
