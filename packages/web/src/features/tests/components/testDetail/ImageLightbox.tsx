import {useEffect} from 'react'

interface ImageLightboxProps {
    imageUrl: string
    onClose: () => void
}

export function ImageLightbox({imageUrl, onClose}: ImageLightboxProps) {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        document.addEventListener('keydown', handleEscape)
        // Prevent body scroll when lightbox is open
        document.body.style.overflow = 'hidden'

        return () => {
            document.removeEventListener('keydown', handleEscape)
            document.body.style.overflow = 'unset'
        }
    }, [onClose])

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={onClose}>
            <div className="relative max-h-[90vh] max-w-[90vw] p-4">
                <button
                    onClick={onClose}
                    className="absolute right-6 top-6 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                    aria-label="Close lightbox">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
                <img
                    src={imageUrl}
                    alt="Full size view"
                    className="max-h-[90vh] max-w-full rounded-lg object-contain"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
        </div>
    )
}
