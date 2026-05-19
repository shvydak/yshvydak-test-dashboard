import {ReactNode} from 'react'

export interface CardProps {
    children: ReactNode
    className?: string
    padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({children, className = '', padding = 'md'}: CardProps) {
    const baseStyles =
        'rounded-2xl border border-gray-200/80 bg-white shadow-card transition-all duration-200 dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl'

    const paddingStyles = {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
    }

    const finalStyles = [baseStyles, paddingStyles[padding], className].filter(Boolean).join(' ')

    return <div className={finalStyles}>{children}</div>
}

export interface CardHeaderProps {
    children: ReactNode
    className?: string
}

export function CardHeader({children, className = ''}: CardHeaderProps) {
    return (
        <div
            className={`px-6 py-4 border-b border-gray-200/70 dark:border-white/[0.06] ${className}`}>
            {children}
        </div>
    )
}

export interface CardContentProps {
    children: ReactNode
    className?: string
}

export function CardContent({children, className = ''}: CardContentProps) {
    return <div className={`p-6 ${className}`}>{children}</div>
}
