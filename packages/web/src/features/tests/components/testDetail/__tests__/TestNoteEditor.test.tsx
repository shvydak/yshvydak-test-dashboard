import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import React from 'react'
import {TestNoteEditor} from '../TestNoteEditor'
import * as useNoteImagesModule from '../../../hooks/useNoteImages'

// Mock useNoteImages hook
vi.mock('../../../hooks/useNoteImages', () => ({
    useNoteImages: vi.fn(),
}))

describe('TestNoteEditor', () => {
    const mockOnSave = vi.fn()
    const mockOnDelete = vi.fn()
    const testId = 'test-123'
    let queryClient: QueryClient

    beforeEach(() => {
        mockOnSave.mockReset()
        mockOnDelete.mockReset()
        vi.clearAllMocks()

        // Create a new QueryClient for each test to ensure isolation
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {retry: false},
                mutations: {retry: false},
            },
        })

        // Mock useNoteImages to return default values
        vi.mocked(useNoteImagesModule.useNoteImages).mockReturnValue({
            images: [],
            loading: false,
            error: null,
            refetch: vi.fn(),
        })
    })

    // Wrapper component with QueryClientProvider
    const wrapper = ({children}: {children: React.ReactNode}) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    describe('Initial Rendering', () => {
        it('should render placeholder when no initial note', () => {
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            expect(
                screen.getByText('No notes for this test. Click here to add one.')
            ).toBeInTheDocument()
            expect(screen.queryByText('Test Notes')).not.toBeInTheDocument()
            expect(screen.queryByText('Add Note')).not.toBeInTheDocument()
        })

        it('should render note content when initial note exists', () => {
            const note = 'Existing note content'
            render(
                <TestNoteEditor
                    testId={testId}
                    initialNote={note}
                    onSave={mockOnSave}
                    onDelete={mockOnDelete}
                />,
                {wrapper}
            )

            expect(screen.getByText(note)).toBeInTheDocument()
            expect(screen.getByText('Delete')).toBeInTheDocument()
            // Edit button was removed - clicking note area opens edit mode
        })

        it('should not render textarea initially', () => {
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        })
    })

    describe('Adding New Note', () => {
        it('should show textarea when placeholder is clicked', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))

            expect(screen.getByRole('textbox')).toBeInTheDocument()
            expect(screen.getByText('Save')).toBeInTheDocument()
            expect(screen.getByText('Cancel')).toBeInTheDocument()
        })

        it('should save note when "Save" is clicked', async () => {
            const user = userEvent.setup()
            const noteContent = 'New test note'
            mockOnSave.mockResolvedValue(undefined)

            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), noteContent)
            await user.click(screen.getByText('Save'))

            await waitFor(() => {
                expect(mockOnSave).toHaveBeenCalledWith(noteContent)
            })
        })

        it('should show error when trying to save empty note', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))

            // Save button should be disabled when note is empty
            const saveButton = screen.getByText('Save')
            expect(saveButton).toBeDisabled()
        })

        it('should trim whitespace before saving', async () => {
            const user = userEvent.setup()
            mockOnSave.mockResolvedValue(undefined)

            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), '  Test note  ')
            await user.click(screen.getByText('Save'))

            await waitFor(() => {
                expect(mockOnSave).toHaveBeenCalledWith('Test note')
            })
        })

        it('should cancel editing when "Cancel" is clicked', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), 'Some content')
            await user.click(screen.getByText('Cancel'))

            expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
            expect(
                screen.getByText('No notes for this test. Click here to add one.')
            ).toBeInTheDocument()
            expect(mockOnSave).not.toHaveBeenCalled()
        })
    })

    describe('Editing Existing Note', () => {
        it('should show textarea with existing note when note area is clicked', async () => {
            const user = userEvent.setup()
            const existingNote = 'Existing note'
            render(
                <TestNoteEditor
                    testId={testId}
                    initialNote={existingNote}
                    onSave={mockOnSave}
                    onDelete={mockOnDelete}
                />,
                {wrapper}
            )

            // Click on the note content area (not Edit button - it was removed)
            await user.click(screen.getByText(existingNote))

            const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
            expect(textarea.value).toBe(existingNote)
        })

        it('should save updated note', async () => {
            const user = userEvent.setup()
            mockOnSave.mockResolvedValue(undefined)

            render(
                <TestNoteEditor
                    testId={testId}
                    initialNote="Old note"
                    onSave={mockOnSave}
                    onDelete={mockOnDelete}
                />,
                {wrapper}
            )

            // Click on note area to enter edit mode
            await user.click(screen.getByText('Old note'))
            await user.clear(screen.getByRole('textbox'))
            await user.type(screen.getByRole('textbox'), 'Updated note')
            await user.click(screen.getByText('Save'))

            await waitFor(() => {
                expect(mockOnSave).toHaveBeenCalledWith('Updated note')
            })
        })

        it('should restore original note when "Cancel" is clicked', async () => {
            const user = userEvent.setup()
            const originalNote = 'Original note'
            render(
                <TestNoteEditor
                    testId={testId}
                    initialNote={originalNote}
                    onSave={mockOnSave}
                    onDelete={mockOnDelete}
                />,
                {wrapper}
            )

            // Click on note area to enter edit mode
            await user.click(screen.getByText(originalNote))
            await user.clear(screen.getByRole('textbox'))
            await user.type(screen.getByRole('textbox'), 'Modified text')
            await user.click(screen.getByText('Cancel'))

            expect(screen.getByText(originalNote)).toBeInTheDocument()
            expect(mockOnSave).not.toHaveBeenCalled()
        })
    })

    describe('Deleting Note', () => {
        it('should show confirmation dialog when "Delete" is clicked', async () => {
            const user = userEvent.setup()
            const confirmSpy = vi.spyOn(window, 'confirm')
            confirmSpy.mockReturnValue(false)

            render(
                <TestNoteEditor
                    testId={testId}
                    initialNote="Note to delete"
                    onSave={mockOnSave}
                    onDelete={mockOnDelete}
                />,
                {wrapper}
            )

            await user.click(screen.getByText('Delete'))

            expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this note?')
        })

        it('should delete note when confirmed', async () => {
            const user = userEvent.setup()
            const confirmSpy = vi.spyOn(window, 'confirm')
            confirmSpy.mockReturnValue(true)
            mockOnDelete.mockResolvedValue(undefined)

            render(
                <TestNoteEditor
                    testId={testId}
                    initialNote="Note to delete"
                    onSave={mockOnSave}
                    onDelete={mockOnDelete}
                />,
                {wrapper}
            )

            await user.click(screen.getByText('Delete'))

            await waitFor(() => {
                expect(mockOnDelete).toHaveBeenCalled()
            })
        })

        it('should not delete note when cancelled', async () => {
            const user = userEvent.setup()
            const confirmSpy = vi.spyOn(window, 'confirm')
            confirmSpy.mockReturnValue(false)

            render(
                <TestNoteEditor
                    testId={testId}
                    initialNote="Note to delete"
                    onSave={mockOnSave}
                    onDelete={mockOnDelete}
                />,
                {wrapper}
            )

            await user.click(screen.getByText('Delete'))

            expect(mockOnDelete).not.toHaveBeenCalled()
        })
    })

    describe('Character Counter', () => {
        it('should show remaining characters', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))

            expect(screen.getByText('1000 characters remaining')).toBeInTheDocument()
        })

        it('should update character count as user types', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), 'Test')

            expect(screen.getByText('996 characters remaining')).toBeInTheDocument()
        })

        it('should show warning color when less than 100 characters remaining', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), 'a'.repeat(950))

            const counter = screen.getByText('50 characters remaining')
            expect(counter).toHaveClass('text-red-600', 'dark:text-red-400')
        })

        it('should enforce maximum length of 1000 characters', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))

            const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
            expect(textarea).toHaveAttribute('maxLength', '1000')
        })

        it('should show error when exceeding max length', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))

            // Manually set value to exceed limit (bypassing maxLength attribute)
            const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
            fireEvent.change(textarea, {target: {value: 'a'.repeat(1001)}})

            await user.click(screen.getByText('Save'))

            expect(await screen.findByText(/cannot exceed 1000 characters/)).toBeInTheDocument()
        })
    })

    describe('Error Handling', () => {
        it('should display error message when save fails', async () => {
            const user = userEvent.setup()
            const errorMessage = 'Failed to save note'
            mockOnSave.mockRejectedValue(new Error(errorMessage))

            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), 'Test note')
            await user.click(screen.getByText('Save'))

            expect(await screen.findByText(errorMessage)).toBeInTheDocument()
        })

        it('should display error message when delete fails', async () => {
            const user = userEvent.setup()
            const confirmSpy = vi.spyOn(window, 'confirm')
            confirmSpy.mockReturnValue(true)
            mockOnDelete.mockRejectedValue(new Error('Failed to delete note'))

            render(
                <TestNoteEditor
                    testId={testId}
                    initialNote="Note"
                    onSave={mockOnSave}
                    onDelete={mockOnDelete}
                />,
                {wrapper}
            )

            await user.click(screen.getByText('Delete'))

            await waitFor(() => {
                expect(screen.getByText(/Failed to delete note/)).toBeInTheDocument()
            })
        })

        it('should clear error when user starts editing again', async () => {
            const user = userEvent.setup()
            mockOnSave.mockRejectedValue(new Error('Save error'))

            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), 'Test')
            await user.click(screen.getByText('Save'))

            await screen.findByText('Save error')

            await user.click(screen.getByText('Cancel'))
            await user.click(screen.getByText('No notes for this test. Click here to add one.'))

            expect(screen.queryByText('Save error')).not.toBeInTheDocument()
        })
    })

    describe('Loading States', () => {
        it('should show "Saving..." when save is in progress', async () => {
            const user = userEvent.setup()
            mockOnSave.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)))

            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), 'Test note')
            await user.click(screen.getByText('Save'))

            expect(screen.getByText('Saving...')).toBeInTheDocument()
        })

        it('should disable buttons while saving', async () => {
            const user = userEvent.setup()
            mockOnSave.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)))

            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))
            await user.type(screen.getByRole('textbox'), 'Test note')
            await user.click(screen.getByText('Save'))

            expect(screen.getByText('Saving...')).toBeDisabled()
            expect(screen.getByText('Cancel')).toBeDisabled()
        })

        it('should disable Save button when note is empty', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))

            expect(screen.getByText('Save')).toBeDisabled()
        })
    })

    describe('Placeholder Text', () => {
        it('should show helpful placeholder in textarea', async () => {
            const user = userEvent.setup()
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            await user.click(screen.getByText('No notes for this test. Click here to add one.'))

            const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
            expect(textarea.placeholder).toContain('Add notes about this test')
        })
    })

    describe('Empty State Message', () => {
        it('should show placeholder message when no note exists and not editing', () => {
            render(<TestNoteEditor testId={testId} onSave={mockOnSave} onDelete={mockOnDelete} />, {
                wrapper,
            })

            // Should show the placeholder message
            expect(
                screen.getByText('No notes for this test. Click here to add one.')
            ).toBeInTheDocument()
        })
    })
})
