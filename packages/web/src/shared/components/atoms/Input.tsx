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
        'px-4 py-2.5 text-sm rounded-xl border bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-primary-500/15 focus:border-primary-400 transition-all duration-150 dark:bg-white/[0.04] dark:text-white dark:placeholder-gray-500 dark:focus:border-primary-400/60'
    const errorStyles = error
        ? 'border-danger-300 dark:border-danger-500/50 focus:ring-danger-500/15 focus:border-danger-400'
        : 'border-gray-200 dark:border-white/10'
    const widthStyles = fullWidth ? 'w-full' : ''
    const iconPaddingStyles = icon ? (iconPosition === 'left' ? 'pl-10' : 'pr-10') : ''

    return (
        <div className={fullWidth ? 'w-full' : ''}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {label}
                </label>
            )}

            <div className="relative">
                {icon && iconPosition === 'left' && (
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
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
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400">
                        {icon}
                    </div>
                )}
            </div>

            {error && (
                <p className="mt-1.5 text-sm text-danger-600 dark:text-danger-400">{error}</p>
            )}

            {helperText && !error && (
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
            )}
        </div>
    )
}
