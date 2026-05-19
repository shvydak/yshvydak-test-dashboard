import React, {useState, useEffect} from 'react'
import {NoteImage} from '@yshvydak/core'
import {createProtectedFileURL} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

interface NoteImageThumbnailProps {
    image: NoteImage
    onClick?: () => void
    className?: string
}

export function NoteImageThumbnail({image, onClick, className = ''}: NoteImageThumbnailProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
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
                    setError(true)
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
    }, [image.url])

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
