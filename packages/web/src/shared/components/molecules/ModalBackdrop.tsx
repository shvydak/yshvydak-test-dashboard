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
            className={`fixed inset-0 bg-black/50 ${blurClasses[blur]}`}
            onClick={onClick}
            aria-hidden="true"
        />
    )
}
