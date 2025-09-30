export type ViewMode = 'grouped' | 'flat'

export interface ViewModeToggleProps {
    value: ViewMode
    onChange: (mode: ViewMode) => void
    className?: string
}

export function ViewModeToggle({value, onChange, className = ''}: ViewModeToggleProps) {
    const modes: {key: ViewMode; label: string; icon: string}[] = [
        {key: 'grouped', label: 'Grouped', icon: '📁'},
        {key: 'flat', label: 'Flat', icon: '📄'},
    ]

    return (
        <div
            className={`flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
            {modes.map((mode, index) => (
                <button
                    key={mode.key}
                    onClick={() => onChange(mode.key)}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                        index < modes.length - 1
                            ? 'border-r border-gray-200 dark:border-gray-700'
                            : ''
                    } ${
                        value === mode.key
                            ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}>
                    {mode.icon} {mode.label}
                </button>
            ))}
        </div>
    )
}
