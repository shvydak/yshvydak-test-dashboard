import {InputHTMLAttributes, ReactNode} from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    helperText?: string
    icon?: ReactNode
    iconPosition?: 'left' | 'right'
    fullWidth?: boolean
}

export function Input({
    label,
    error,
    helperText,
    icon,
    iconPosition = 'left',
    fullWidth = false,
    className = '',
    ...props
}: InputProps) {
    const baseStyles =
        'px-4 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors'
    const errorStyles = error
        ? 'border-red-300 dark:border-red-700'
        : 'border-gray-200 dark:border-gray-700'
    const widthStyles = fullWidth ? 'w-full' : ''
    const iconPaddingStyles = icon ? (iconPosition === 'left' ? 'pl-10' : 'pr-10') : ''

    return (
        <div className={fullWidth ? 'w-full' : ''}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {label}
                </label>
            )}

            <div className="relative">
                {icon && iconPosition === 'left' && (
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        {icon}
                    </div>
                )}

                <input
                    className={[baseStyles, errorStyles, widthStyles, iconPaddingStyles, className]
                        .filter(Boolean)
                        .join(' ')}
                    {...props}
                />

                {icon && iconPosition === 'right' && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        {icon}
                    </div>
                )}
            </div>

            {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}

            {helperText && !error && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
            )}
        </div>
    )
}
