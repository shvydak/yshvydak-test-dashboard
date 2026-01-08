import React, {useState, useEffect, useRef} from 'react'
import {NoteImage} from '@yshvydak/core'
import {Button} from '@/shared/components/atoms/Button'
import {LinkifiedText} from '@/components/atoms/LinkifiedText'
import {noteService} from '@/services/note.service'
import {ImageThumbnail} from './ImageThumbnail'
import {ImageLightbox} from './ImageLightbox'
import {config} from '@config/environment.config'

interface TestNoteEditorProps {
    testId: string
    initialNote?: string
    onSave: (note: string) => Promise<void>
    onDelete: () => Promise<void>
}

const MAX_LENGTH = 1000

export const TestNoteEditor: React.FC<TestNoteEditorProps> = ({
    testId,
    initialNote = '',
    onSave,
    onDelete,
}) => {
    const [isEditing, setIsEditing] = useState(false)
    const [note, setNote] = useState(initialNote)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [images, setImages] = useState<NoteImage[]>([])
    const [isLoadingImages, setIsLoadingImages] = useState(false)
    const [isUploadingImages, setIsUploadingImages] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [lightboxImage, setLightboxImage] = useState<string | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        setNote(initialNote)
    }, [initialNote])

    useEffect(() => {
        loadImages()
    }, [testId])

    const loadImages = async () => {
        setIsLoadingImages(true)
        try {
            const loadedImages = await noteService.getImages(testId)
            setImages(loadedImages)
        } catch (err) {
            console.error('Failed to load images:', err)
        } finally {
            setIsLoadingImages(false)
        }
    }

    const handleSave = async () => {
        if (!note.trim()) {
            setError('Note cannot be empty')
            return
        }

        if (note.length > MAX_LENGTH) {
            setError(`Note cannot exceed ${MAX_LENGTH} characters`)
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            await onSave(note.trim())
            setIsEditing(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save note')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this note and all its images?')) {
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            await onDelete()
            setNote('')
            setImages([])
            setIsEditing(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete note')
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancel = () => {
        setNote(initialNote)
        setIsEditing(false)
        setError(null)
    }

    const handleImageUpload = async (files: File[]) => {
        const imageFiles = files.filter((file) => file.type.startsWith('image/'))

        if (imageFiles.length === 0) {
            setError('Please select valid image files (PNG, JPG, JPEG, GIF, WEBP)')
            return
        }

        if (imageFiles.length > 10) {
            setError('You can upload a maximum of 10 images at once')
            return
        }

        setIsUploadingImages(true)
        setError(null)

        try {
            const uploadedImages = await noteService.uploadImages(testId, imageFiles)
            setImages([...images, ...uploadedImages])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload images')
        } finally {
            setIsUploadingImages(false)
        }
    }

    const handleDeleteImage = async (imageId: string) => {
        if (!confirm('Are you sure you want to delete this image?')) {
            return
        }

        try {
            await noteService.deleteImage(testId, imageId)
            setImages(images.filter((img) => img.id !== imageId))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete image')
        }
    }

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.currentTarget === e.target) {
            setIsDragging(false)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
            await handleImageUpload(files)
        }
    }

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return

        const files: File[] = []
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile()
                if (file) {
                    files.push(file)
                }
            }
        }

        if (files.length > 0) {
            e.preventDefault()
            await handleImageUpload(files)
        }
    }

    const remainingChars = MAX_LENGTH - note.length

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1">
                    <span>💬</span>
                    <span>Test Notes</span>
                </h4>
                {!isEditing && initialNote && (
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsEditing(true)}
                            disabled={isSaving}>
                            Edit
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={handleDelete}
                            disabled={isSaving}>
                            Delete
                        </Button>
                    </div>
                )}
                {!isEditing && !initialNote && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        disabled={isSaving}>
                        Add Note
                    </Button>
                )}
            </div>

            {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
                    {error}
                </div>
            )}

            {isEditing ? (
                <div className="space-y-3">
                    <div
                        className={`relative ${isDragging ? 'ring-2 ring-primary-500 ring-offset-2' : ''}`}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}>
                        <textarea
                            ref={textareaRef}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onPaste={handlePaste}
                            placeholder="Add notes about this test... (e.g., 'This test is flaky, known issue #123')

You can also paste or drag & drop images directly into this field!"
                            className="w-full px-4 py-3 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors resize-none"
                            rows={4}
                            maxLength={MAX_LENGTH}
                            disabled={isSaving}
                        />
                        {isDragging && (
                            <div className="absolute inset-0 flex items-center justify-center bg-primary-500/10 border-2 border-dashed border-primary-500 rounded-lg pointer-events-none">
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
                                    <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
                                        Drop images here
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="flex justify-between items-center mt-1">
                            <span
                                className={`text-xs ${
                                    remainingChars < 100
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-gray-500 dark:text-gray-400'
                                }`}>
                                {remainingChars} characters remaining
                            </span>
                        </div>
                    </div>

                    {/* Image thumbnails */}
                    {images.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {images.map((image) => (
                                <ImageThumbnail
                                    key={image.id}
                                    image={image}
                                    onClick={() =>
                                        setLightboxImage(`${config.api.serverUrl}${image.url}`)
                                    }
                                    onDelete={() => handleDeleteImage(image.id)}
                                />
                            ))}
                        </div>
                    )}

                    {isUploadingImages && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            Uploading images...
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            disabled={isSaving || !note.trim()}>
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleCancel}
                            disabled={isSaving}>
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : initialNote ? (
                <div className="space-y-3">
                    <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <LinkifiedText
                            text={initialNote}
                            className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words"
                        />
                    </div>

                    {/* Image thumbnails in view mode */}
                    {images.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {images.map((image) => (
                                <ImageThumbnail
                                    key={image.id}
                                    image={image}
                                    onClick={() =>
                                        setLightboxImage(`${config.api.serverUrl}${image.url}`)
                                    }
                                    onDelete={() => handleDeleteImage(image.id)}
                                />
                            ))}
                        </div>
                    )}

                    {isLoadingImages && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            Loading images...
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No notes for this test. Click "Add Note" to add one.
                </div>
            )}

            {/* Lightbox */}
            {lightboxImage && (
                <ImageLightbox imageUrl={lightboxImage} onClose={() => setLightboxImage(null)} />
            )}
        </div>
    )
}
