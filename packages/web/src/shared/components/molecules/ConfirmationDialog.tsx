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
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-4">
                <ModalBackdrop onClick={onCancel} blur="md" />

                <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {title}
                        </h3>
                    </div>

                    {/* Body */}
                    <div className="p-6">
                        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
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
