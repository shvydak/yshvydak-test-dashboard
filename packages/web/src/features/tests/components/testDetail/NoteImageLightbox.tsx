import React, {useEffect, useState} from 'react'
import {NoteImage} from '@yshvydak/core'
import {createProtectedFileURL} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

interface NoteImageLightboxProps {
    image: NoteImage | null
    isOpen: boolean
    onClose: () => void
}

export function NoteImageLightbox({image, isOpen, onClose}: NoteImageLightboxProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!isOpen || !image) {
            setImageUrl(null)
            setLoading(true)
            return
        }

        let isMounted = true

        const loadImage = async () => {
            try {
                const url = await createProtectedFileURL(image.url, config.api.serverUrl)
                if (isMounted) {
                    setImageUrl(url)
                    setLoading(false)
                }
            } catch (err) {
                console.error('Failed to load note image:', err)
                if (isMounted) {
                    setLoading(false)
                }
            }
        }

        loadImage()

        return () => {
            isMounted = false
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl)
            }
        }
    }, [image, isOpen])

    useEffect(() => {
        if (!isOpen) return

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, onClose])

    if (!isOpen || !image) return null

    return (
        <>
            <div
                className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-md"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
                onClick={onClose}
                role="dialog"
                aria-modal="true"
                aria-label="Image preview">
                <div
                    className="relative max-w-[90vw] max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-2xl pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}>
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors z-10"
                        aria-label="Close image preview">
                        <svg
                            className="w-8 h-8"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
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
                                className="max-w-full max-h-[85vh] object-contain rounded"
                            />
                        ) : (
                            <div className="flex items-center justify-center w-full h-64">
                                <span className="text-red-500 dark:text-red-400">
                                    Failed to load image
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
