import React, {useState, useEffect} from 'react'
import {Button} from '@/shared/components/atoms/Button'
import {LinkifiedText} from '@/components/atoms/LinkifiedText'

interface TestNoteEditorProps {
    testId: string
    initialNote?: string
    onSave: (note: string) => Promise<void>
    onDelete: () => Promise<void>
}

const MAX_LENGTH = 1000

export const TestNoteEditor: React.FC<TestNoteEditorProps> = ({
    initialNote = '',
    onSave,
    onDelete,
}) => {
    const [isEditing, setIsEditing] = useState(false)
    const [note, setNote] = useState(initialNote)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

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
                    <div>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Add notes about this test... (e.g., 'This test is flaky, known issue #123', 'Bug report: https://example.com/issue/456')"
                            className="w-full px-4 py-3 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors resize-none"
                            rows={4}
                            maxLength={MAX_LENGTH}
                            disabled={isSaving}
                        />
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
                <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <LinkifiedText
                        text={initialNote}
                        className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words"
                    />
                </div>
            ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No notes for this test. Click "Add Note" to add one.
                </div>
            )}
        </div>
    )
}
