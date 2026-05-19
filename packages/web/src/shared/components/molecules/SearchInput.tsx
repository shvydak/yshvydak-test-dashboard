import {useState, InputHTMLAttributes} from 'react'
import {Search, X} from 'lucide-react'
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
    const [_isFocused, setIsFocused] = useState(false)
    const hasValue = value && String(value).length > 0

    const handleClear = () => {
        if (onClear) {
            onClear()
        } else if (onChange) {
            onChange({target: {value: ''}} as any)
        }
    }

    const searchIcon = <Search className="w-4 h-4 text-gray-400" />

    const _clearButton = hasValue && showClearButton && (
        <button
            type="button"
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Clear search">
            <X className="w-4 h-4" />
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
