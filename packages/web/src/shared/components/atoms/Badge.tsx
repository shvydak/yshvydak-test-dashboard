import {ReactNode} from 'react'

export interface BadgeProps {
    children: ReactNode
    variant?: 'success' | 'danger' | 'warning' | 'info' | 'neutral'
    size?: 'sm' | 'md'
    className?: string
}

export function Badge({children, variant = 'neutral', size = 'md', className = ''}: BadgeProps) {
    const baseStyles = 'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset'

    const variantStyles = {
        success:
            'text-success-700 bg-success-50 ring-success-600/15 dark:text-success-300 dark:bg-success-500/10 dark:ring-success-400/20',
        danger: 'text-danger-700 bg-danger-50 ring-danger-600/15 dark:text-danger-300 dark:bg-danger-500/10 dark:ring-danger-400/20',
        warning:
            'text-warning-700 bg-warning-50 ring-warning-600/20 dark:text-warning-300 dark:bg-warning-500/10 dark:ring-warning-400/20',
        info: 'text-primary-700 bg-primary-50 ring-primary-600/15 dark:text-primary-300 dark:bg-primary-500/10 dark:ring-primary-400/20',
        neutral:
            'text-gray-600 bg-gray-100 ring-gray-500/10 dark:text-gray-300 dark:bg-white/[0.06] dark:ring-white/10',
    }

    const sizeStyles = {
        sm: 'px-2 py-0.5 text-[11px]',
        md: 'px-2.5 py-0.5 text-xs',
    }

    const finalStyles = [baseStyles, variantStyles[variant], sizeStyles[size], className].join(' ')

    return <span className={finalStyles}>{children}</span>
}
