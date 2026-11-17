import React, {useEffect} from 'react'
import {createPortal} from 'react-dom'
import {X} from 'lucide-react'
import {NoteImage} from '@yshvydak/core'
import {useProtectedImageUrl} from '../../hooks/useProtectedImageUrl'

interface NoteImageLightboxProps {
    image: NoteImage | null
    isOpen: boolean
    onClose: () => void
}

export function NoteImageLightbox({image, isOpen, onClose}: NoteImageLightboxProps) {
    const {url: imageUrl, loading} = useProtectedImageUrl(image?.url ?? null, isOpen)

    useEffect(() => {
        if (!isOpen) return

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // Capture + stop: the modal under the lightbox must stay open.
                e.stopImmediatePropagation()
                onClose()
            }
        }

        document.addEventListener('keydown', handleEscape, true)
        return () => document.removeEventListener('keydown', handleEscape, true)
    }, [isOpen, onClose])

    if (!isOpen || !image) return null

    return createPortal(
        <>
            <div
                className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-md"
                onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                }}
                aria-hidden="true"
            />
            <div
                className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
                onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                }}
                role="dialog"
                aria-modal="true"
                aria-label="Image preview">
                <div
                    className="relative max-w-[90vw] max-h-[90vh] bg-white dark:bg-gray-800 rounded-2xl shadow-pop animate-scale-in pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}>
                    {/* Close button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onClose()
                        }}
                        className="absolute -top-11 right-0 rounded-xl p-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors z-10"
                        aria-label="Close image preview">
                        <X className="w-7 h-7" />
                    </button>

                    {/* Image container */}
                    <div className="p-4">
                        {loading ? (
                            <div className="flex items-center justify-center w-full h-64">
                                <span className="text-gray-500 dark:text-gray-400">Loading...</span>
                            </div>
                        ) : imageUrl ? (
                            <img
                                src={imageUrl}
                                alt={image.fileName}
                                className="max-w-full max-h-[85vh] object-contain rounded-xl"
                            />
                        ) : (
                            <div className="flex items-center justify-center w-full h-64">
                                <span className="text-danger-500 dark:text-danger-400">
                                    Failed to load image
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>,
        document.body
    )
}
