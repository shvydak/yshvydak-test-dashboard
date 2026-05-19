export interface ModalBackdropProps {
    onClick: () => void
    blur?: 'none' | 'sm' | 'md' | 'lg'
}

export function ModalBackdrop({onClick, blur = 'sm'}: ModalBackdropProps) {
    const blurClasses = {
        none: '',
        sm: 'backdrop-blur-sm',
        md: 'backdrop-blur-md',
        lg: 'backdrop-blur-lg',
    }

    return (
        <div
            className={`fixed inset-0 bg-gray-950/50 dark:bg-gray-950/70 animate-fade-in ${blurClasses[blur]}`}
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            aria-hidden="true"
        />
    )
}
