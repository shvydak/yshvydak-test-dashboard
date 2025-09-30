import {useState, InputHTMLAttributes} from 'react'
import {Input} from '../atoms'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    onClear?: () => void
    showClearButton?: boolean
}

export function SearchInput({
    value,
    onChange,
    onClear,
    showClearButton = true,
    placeholder = 'Search...',
    className = '',
    ...props
}: SearchInputProps) {
    const [isFocused, setIsFocused] = useState(false)
    const hasValue = value && String(value).length > 0

    const handleClear = () => {
        if (onClear) {
            onClear()
        } else if (onChange) {
            onChange({target: {value: ''}} as any)
        }
    }

    const searchIcon = (
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
    )

    const clearButton = hasValue && showClearButton && (
        <button
            type="button"
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Clear search">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                />
            </svg>
        </button>
    )

    return (
        <Input
            type="text"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            icon={searchIcon}
            iconPosition="left"
            className={className}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
        />
    )
}
