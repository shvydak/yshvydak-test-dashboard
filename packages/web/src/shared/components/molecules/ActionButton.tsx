import { Button, ButtonProps } from '../atoms'

export interface ActionButtonProps extends Omit<ButtonProps, 'loading'> {
	isRunning?: boolean
	runningText?: string
	icon?: string
}

export function ActionButton({
	isRunning = false,
	runningText = 'Running...',
	icon,
	children,
	disabled,
	...props
}: ActionButtonProps) {
	return (
		<Button
			{...props}
			loading={isRunning}
			disabled={disabled || isRunning}
		>
			{isRunning ? (
				<span className="flex items-center space-x-1">
					<span className="animate-spin">⚡</span>
					<span>{runningText}</span>
				</span>
			) : (
				<>
					{icon && <span className="mr-1">{icon}</span>}
					{children}
				</>
			)}
		</Button>
	)
}