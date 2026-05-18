import {LoadingSpinner} from './LoadingSpinner'
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
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 active:scale-[0.98] disabled:pointer-events-none'

    const variantStyles = {
        primary:
            'bg-primary-600 text-white shadow-soft hover:bg-primary-500 hover:shadow-glow focus-visible:ring-primary-500/60 dark:bg-primary-500 dark:hover:bg-primary-400',
        secondary:
            'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 focus-visible:ring-gray-400/50 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-200 dark:hover:bg-white/[0.09]',
        danger: 'bg-danger-500 text-white shadow-soft hover:bg-danger-600 focus-visible:ring-danger-500/60',
        success:
            'bg-success-500 text-white shadow-soft hover:bg-success-600 focus-visible:ring-success-500/60',
    }

    const sizeStyles = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
    }

    const disabledStyles =
        'bg-gray-200 text-gray-400 shadow-none hover:bg-gray-200 cursor-not-allowed border-transparent dark:bg-white/[0.04] dark:text-gray-600'
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
                <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    <span>Running...</span>
                </span>
            ) : (
                children
            )}
        </button>
    )
}
