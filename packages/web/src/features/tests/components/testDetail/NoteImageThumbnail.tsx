import React from 'react'
import {NoteImage} from '@yshvydak/core'
import {useProtectedImageUrl} from '../../hooks/useProtectedImageUrl'

interface NoteImageThumbnailProps {
    image: NoteImage
    onClick?: () => void
    className?: string
}

export function NoteImageThumbnail({image, onClick, className = ''}: NoteImageThumbnailProps) {
    const {url: imageUrl, loading, error} = useProtectedImageUrl(image.url)

    if (loading) {
        return (
            <div
                className={`skeleton inline-block w-20 h-20 rounded-xl ${className}`}
                aria-label="Loading image"
            />
        )
    }

    if (error || !imageUrl) {
        return (
            <div
                className={`inline-block w-20 h-20 bg-gray-100 dark:bg-white/[0.06] rounded-xl border border-gray-200/70 dark:border-white/10 flex items-center justify-center ${className}`}>
                <span className="text-xs text-gray-400 dark:text-gray-500">Error</span>
            </div>
        )
    }

    return (
        <img
            src={imageUrl}
            alt={image.fileName}
            onClick={(e) => {
                e.stopPropagation()
                onClick?.()
            }}
            className={`inline-block max-w-[100px] max-h-[100px] rounded-xl border border-gray-200/70 dark:border-white/10 cursor-pointer hover:scale-105 transition-transform duration-200 object-contain ${className}`}
            style={{verticalAlign: 'middle'}}
        />
    )
}
