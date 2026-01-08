import {NoteImage} from '@yshvydak/core'
import {config} from '@config/environment.config'

interface ImageThumbnailProps {
    image: NoteImage
    onClick: () => void
    onDelete: () => void
}

export function ImageThumbnail({image, onClick, onDelete}: ImageThumbnailProps) {
    const imageUrl = `${config.api.serverUrl}${image.url}`

    return (
        <div className="group relative inline-block">
            <button
                onClick={onClick}
                className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-background transition-transform hover:scale-105"
                title="Click to view full size">
                <img src={imageUrl} alt={image.fileName} className="h-full w-full object-cover" />
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                }}
                className="absolute -right-2 -top-2 hidden rounded-full bg-destructive p-1 text-destructive-foreground shadow-lg transition-opacity group-hover:block hover:bg-destructive/90"
                title="Delete image"
                aria-label="Delete image">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
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
        </div>
    )
}
