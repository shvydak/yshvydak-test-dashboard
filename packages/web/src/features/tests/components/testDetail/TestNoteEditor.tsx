import React, {useState, useEffect, useRef} from 'react'
import {Button} from '@/shared/components/atoms/Button'
import {noteImageService} from '@/services/noteImage.service'
import {insertImageMarker} from '@/utils/noteContent.util'
import {useNoteImages} from '../../hooks/useNoteImages'
import {NoteContentRenderer} from './NoteContentRenderer'

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
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const {images, loading: imagesLoading, refetch: refetchImages} = useNoteImages(testId, true)

    useEffect(() => {
        setNote(initialNote)
    }, [initialNote])

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
        if (!confirm('Are you sure you want to delete this note?')) {
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            await onDelete()
            setNote('')
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

    const handleImageUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setError('Only image files are allowed')
            return
        }

        setIsUploading(true)
        setError(null)

        try {
            const image = await noteImageService.uploadImage(testId, file)
            await refetchImages()

            // Insert image marker at cursor position
            const textarea = textareaRef.current
            if (textarea) {
                const cursorPosition = textarea.selectionStart
                const newContent = insertImageMarker(note, image.id, cursorPosition)
                setNote(newContent)

                // Restore cursor position after marker
                setTimeout(() => {
                    const newPosition = cursorPosition + `[IMAGE:${image.id}]`.length + 1
                    textarea.setSelectionRange(newPosition, newPosition)
                    textarea.focus()
                }, 0)
            } else {
                // Fallback: append to end
                const newContent = note ? `${note} [IMAGE:${image.id}]` : `[IMAGE:${image.id}]`
                setNote(newContent)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload image')
        } finally {
            setIsUploading(false)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true)
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (!isEditing) return

        const files = Array.from(e.dataTransfer.files).filter((file) =>
            file.type.startsWith('image/')
        )

        if (files.length === 0) {
            setError('Please drop image files only')
            return
        }

        // Upload all images
        for (const file of files) {
            await handleImageUpload(file)
        }
    }

    const handlePaste = async (e: React.ClipboardEvent) => {
        if (!isEditing) return

        const items = Array.from(e.clipboardData.items)
        const imageItems = items.filter((item) => item.type.startsWith('image/'))

        if (imageItems.length === 0) return

        e.preventDefault()

        for (const item of imageItems) {
            const file = item.getAsFile()
            if (file) {
                await handleImageUpload(file)
            }
        }
    }

    const remainingChars = MAX_LENGTH - note.length

    return (
        <div>
            {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
                    {error}
                </div>
            )}

            {isEditing ? (
                <div className="space-y-3">
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`relative ${
                            isDragging
                                ? 'border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : ''
                        }`}>
                        <textarea
                            ref={textareaRef}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onPaste={handlePaste}
                            placeholder="Add notes about this test... (e.g., 'This test is flaky, known issue #123', 'Bug report: https://example.com/issue/456'). You can drag & drop images or paste screenshots here."
                            className={`w-full px-4 py-3 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors resize-none ${
                                isDragging ? 'border-primary-500' : ''
                            }`}
                            rows={4}
                            maxLength={MAX_LENGTH}
                            disabled={isSaving || isUploading}
                        />
                        {isDragging && (
                            <div className="absolute inset-0 flex items-center justify-center bg-primary-50 dark:bg-primary-900/20 border-2 border-dashed border-primary-500 rounded-lg pointer-events-none">
                                <span className="text-primary-600 dark:text-primary-400 font-medium">
                                    Drop images here
                                </span>
                            </div>
                        )}
                        {isUploading && (
                            <div className="absolute top-2 right-2 text-xs text-gray-500 dark:text-gray-400">
                                Uploading...
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
                <div
                    onClick={() => setIsEditing(true)}
                    className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors relative">
                    {imagesLoading ? (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            Loading images...
                        </div>
                    ) : (
                        <NoteContentRenderer
                            content={initialNote}
                            images={images}
                            className="text-sm text-gray-700 dark:text-gray-300"
                        />
                    )}
                    <div className="absolute top-2 right-2">
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleDelete()
                            }}
                            disabled={isSaving}>
                            Delete
                        </Button>
                    </div>
                </div>
            ) : (
                <div
                    onClick={() => setIsEditing(true)}
                    className="text-sm text-gray-500 dark:text-gray-400 italic cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors p-2 rounded border border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500">
                    No notes for this test. Click here to add one.
                </div>
            )}
        </div>
    )
}
