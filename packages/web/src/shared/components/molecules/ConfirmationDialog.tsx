import {ModalBackdrop} from './ModalBackdrop'
import {Button} from '../atoms'

export interface ConfirmationDialogProps {
    isOpen: boolean
    title: string
    description: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'primary'
    isLoading?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmationDialog({
    isOpen,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'primary',
    isLoading = false,
    onConfirm,
    onCancel,
}: ConfirmationDialogProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex min-h-screen items-center justify-center p-4">
                <ModalBackdrop onClick={onCancel} blur="md" />

                <div className="relative w-full max-w-md animate-scale-in rounded-2xl border border-gray-200/80 bg-white shadow-pop dark:border-white/10 dark:bg-gray-800">
                    {/* Header */}
                    <div className="p-6 pb-3">
                        <h3 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                            {title}
                        </h3>
                    </div>

                    {/* Body */}
                    <div className="px-6 pb-6">
                        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                            {description}
                        </p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 border-t border-gray-200/70 p-4 dark:border-white/[0.06]">
                        <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
                            {cancelText}
                        </Button>
                        <Button
                            variant={variant}
                            onClick={onConfirm}
                            loading={isLoading}
                            disabled={isLoading}>
                            {confirmText}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
