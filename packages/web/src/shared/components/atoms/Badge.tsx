import {ReactNode} from 'react'

export interface BadgeProps {
    children: ReactNode
    variant?: 'success' | 'danger' | 'warning' | 'info' | 'neutral'
    size?: 'sm' | 'md'
    className?: string
}

export function Badge({children, variant = 'neutral', size = 'md', className = ''}: BadgeProps) {
    const baseStyles = 'inline-flex items-center rounded-full font-medium'

    const variantStyles = {
        success: 'text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-900/20',
        danger: 'text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20',
        warning: 'text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-900/20',
        info: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
        neutral: 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800',
    }

    const sizeStyles = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-xs',
    }

    const finalStyles = [baseStyles, variantStyles[variant], sizeStyles[size], className].join(' ')

    return <span className={finalStyles}>{children}</span>
}
