export interface LoadingSpinnerProps {
	size?: 'sm' | 'md' | 'lg'
	className?: string
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
	const sizeStyles = {
		sm: 'h-4 w-4 border-2',
		md: 'h-8 w-8 border-2',
		lg: 'h-12 w-12 border-4',
	}

	return (
		<div
			className={`animate-spin rounded-full border-blue-600 border-t-transparent ${sizeStyles[size]} ${className}`}
			role="status"
			aria-label="Loading"
		/>
	)
}