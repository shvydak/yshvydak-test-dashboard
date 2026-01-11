import React, {useState} from 'react'
import {NoteImage} from '@yshvydak/core'
import {LinkifiedText} from '@/components/atoms/LinkifiedText'
import {NoteImageThumbnail} from './NoteImageThumbnail'
import {NoteImageLightbox} from './NoteImageLightbox'
import {parseNoteContent} from '@/utils/noteContent.util'

interface NoteContentRendererProps {
    content: string
    images: NoteImage[]
    className?: string
}

export function NoteContentRenderer({content, images, className = ''}: NoteContentRendererProps) {
    const [lightboxImage, setLightboxImage] = useState<NoteImage | null>(null)
    const [isLightboxOpen, setIsLightboxOpen] = useState(false)

    const parts = parseNoteContent(content, images)

    const handleImageClick = (image: NoteImage) => {
        setLightboxImage(image)
        setIsLightboxOpen(true)
    }

    const handleCloseLightbox = () => {
        setIsLightboxOpen(false)
        setLightboxImage(null)
    }

    return (
        <>
            <div className={className}>
                {parts.map((part, index) => {
                    if (part.type === 'image' && part.image) {
                        return (
                            <NoteImageThumbnail
                                key={`image-${part.imageId}-${index}`}
                                image={part.image}
                                onClick={() => handleImageClick(part.image!)}
                                className="mx-1 my-1"
                            />
                        )
                    }

                    return (
                        <LinkifiedText
                            key={`text-${index}`}
                            text={part.content}
                            className="whitespace-pre-wrap break-words"
                        />
                    )
                })}
            </div>

            <NoteImageLightbox
                image={lightboxImage}
                isOpen={isLightboxOpen}
                onClose={handleCloseLightbox}
            />
        </>
    )
}
