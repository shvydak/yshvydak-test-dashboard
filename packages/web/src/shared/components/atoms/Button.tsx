import {ButtonHTMLAttributes, ReactNode} from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'success'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    children: ReactNode
    fullWidth?: boolean
}

export function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    children,
    fullWidth = false,
    className = '',
    ...props
}: ButtonProps) {
    const baseStyles =
        'rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'

    const variantStyles = {
        primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
        secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
        success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    }

    const sizeStyles = {
        sm: 'px-3 py-1 text-sm',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
    }

    const disabledStyles =
        'bg-gray-400 dark:bg-gray-700 text-gray-200 cursor-not-allowed hover:bg-gray-400'
    const widthStyles = fullWidth ? 'w-full' : ''

    const finalStyles = [
        baseStyles,
        disabled || loading ? disabledStyles : variantStyles[variant],
        sizeStyles[size],
        widthStyles,
        className,
    ].join(' ')

    return (
        <button className={finalStyles} disabled={disabled || loading} {...props}>
            {loading ? (
                <span className="flex items-center justify-center space-x-2">
                    <span className="animate-spin">⚡</span>
                    <span>Running...</span>
                </span>
            ) : (
                children
            )}
        </button>
    )
}
