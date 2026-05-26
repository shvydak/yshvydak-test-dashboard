import {forwardRef, useState, KeyboardEvent, InputHTMLAttributes} from 'react'
import {Search, X} from 'lucide-react'
import {Input} from '../atoms'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    onClear?: () => void
    showClearButton?: boolean
    showShortcutHint?: boolean
    resultCount?: number
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent)
const modKey = isMac ? '⌘' : 'Ctrl'

const kbdClass =
    'inline-flex items-center justify-center rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-400 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-500'

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
    {
        value,
        onChange,
        onClear,
        showClearButton = true,
        showShortcutHint = false,
        resultCount,
        placeholder = 'Search...',
        className = '',
        onKeyDown,
        ...props
    },
    ref
) {
    const [isFocused, setIsFocused] = useState(false)
    const hasValue = value && String(value).length > 0
    const showHint = showShortcutHint && !isFocused && !hasValue
    const showCount = hasValue && resultCount !== undefined
    const showX = hasValue && showClearButton

    const handleClear = () => {
        if (onClear) {
            onClear()
        } else if (onChange) {
            onChange({target: {value: ''}} as any)
        }
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            if (hasValue) {
                handleClear()
                e.stopPropagation()
            } else {
                e.currentTarget.blur()
            }
        }
        onKeyDown?.(e)
    }

    const rightPadding = showHint ? ' pr-16' : showX ? (showCount ? ' pr-16' : ' pr-9') : ''

    return (
        <div className="relative">
            <Input
                ref={ref}
                type="text"
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                icon={<Search className="w-4 h-4 text-gray-400" />}
                iconPosition="left"
                className={`${className}${rightPadding}`}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                {...props}
            />

            {showHint && (
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 pr-3">
                    <kbd className={kbdClass}>{modKey}</kbd>
                    <kbd className={kbdClass}>K</kbd>
                </div>
            )}

            {(showX || showCount) && (
                <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2.5">
                    {showCount && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                            {resultCount}
                        </span>
                    )}
                    {showX && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            aria-label="Clear search">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            )}
        </div>
    )
})
