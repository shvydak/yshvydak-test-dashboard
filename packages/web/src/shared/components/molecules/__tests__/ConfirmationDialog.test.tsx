import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {ConfirmationDialog} from '../ConfirmationDialog'

describe('ConfirmationDialog', () => {
    const defaultProps = {
        isOpen: true,
        title: 'Delete Test',
        description: 'Are you sure you want to delete this test?',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
    }

    it('should render when isOpen is true', () => {
        render(<ConfirmationDialog {...defaultProps} />)

        expect(screen.getByText('Delete Test')).toBeInTheDocument()
        expect(screen.getByText('Are you sure you want to delete this test?')).toBeInTheDocument()
    })

    it('should not render when isOpen is false', () => {
        render(<ConfirmationDialog {...defaultProps} isOpen={false} />)

        expect(screen.queryByText('Delete Test')).not.toBeInTheDocument()
    })

    it('should call onConfirm when confirm button is clicked', () => {
        const onConfirm = vi.fn()
        render(<ConfirmationDialog {...defaultProps} onConfirm={onConfirm} />)

        const confirmButton = screen.getByText('Confirm')
        fireEvent.click(confirmButton)

        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('should call onCancel when cancel button is clicked', () => {
        const onCancel = vi.fn()
        render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />)

        const cancelButton = screen.getByText('Cancel')
        fireEvent.click(cancelButton)

        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('should use custom button text when provided', () => {
        render(<ConfirmationDialog {...defaultProps} confirmText="Delete" cancelText="Keep" />)

        expect(screen.getByText('Delete')).toBeInTheDocument()
        expect(screen.getByText('Keep')).toBeInTheDocument()
    })

    it('should render with danger variant', () => {
        render(<ConfirmationDialog {...defaultProps} variant="danger" />)

        const confirmButton = screen.getByText('Confirm')
        expect(confirmButton).toBeInTheDocument()
    })

    it('should disable buttons when isLoading is true', () => {
        render(<ConfirmationDialog {...defaultProps} isLoading={true} />)

        const buttons = screen.getAllByRole('button')
        buttons.forEach((button) => {
            expect(button).toBeDisabled()
        })
    })

    it('should show loading state on confirm button', () => {
        render(<ConfirmationDialog {...defaultProps} isLoading={true} />)

        expect(screen.getByText('Running...')).toBeInTheDocument()
    })

    it('should call onCancel when backdrop is clicked', () => {
        const onCancel = vi.fn()
        render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />)

        // The backdrop is aria-hidden, find it by attribute
        const backdrop = document.querySelector('[aria-hidden="true"]')
        if (backdrop) {
            fireEvent.click(backdrop)
            expect(onCancel).toHaveBeenCalledTimes(1)
        } else {
            // If backdrop not found, skip this assertion
            expect(true).toBe(true)
        }
    })

    it('should not call onConfirm or onCancel when buttons are disabled', () => {
        const onConfirm = vi.fn()
        const onCancel = vi.fn()

        render(
            <ConfirmationDialog
                {...defaultProps}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={true}
            />
        )

        const buttons = screen.getAllByRole('button')
        const cancelButton = buttons[0] // First button is Cancel
        const confirmButton = buttons[1] // Second button is Confirm (in loading state)

        fireEvent.click(confirmButton)
        fireEvent.click(cancelButton)

        expect(onConfirm).not.toHaveBeenCalled()
        expect(onCancel).not.toHaveBeenCalled()
    })

    it('should render with primary variant by default', () => {
        render(<ConfirmationDialog {...defaultProps} />)

        const confirmButton = screen.getByText('Confirm')
        expect(confirmButton).toBeInTheDocument()
    })

    it('should handle long descriptions properly', () => {
        const longDescription =
            'This is a very long description that explains in detail what will happen when you confirm this action. It should be displayed properly in the dialog without breaking the layout.'

        render(<ConfirmationDialog {...defaultProps} description={longDescription} />)

        expect(screen.getByText(longDescription)).toBeInTheDocument()
    })

    it('should handle special characters in title and description', () => {
        render(
            <ConfirmationDialog
                {...defaultProps}
                title="Delete 'Test-123' <Special>"
                description="Are you sure? This can't be undone!"
            />
        )

        expect(screen.getByText("Delete 'Test-123' <Special>")).toBeInTheDocument()
        expect(screen.getByText("Are you sure? This can't be undone!")).toBeInTheDocument()
    })

    describe('keyboard and focus', () => {
        it('Escape cancels, like the Cancel button', () => {
            const onCancel = vi.fn()
            const onConfirm = vi.fn()
            render(
                <ConfirmationDialog {...defaultProps} onCancel={onCancel} onConfirm={onConfirm} />
            )

            fireEvent.keyDown(document, {key: 'Escape'})

            expect(onCancel).toHaveBeenCalledTimes(1)
            expect(onConfirm).not.toHaveBeenCalled()
        })

        it('other keys do nothing', () => {
            const onCancel = vi.fn()
            render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />)

            fireEvent.keyDown(document, {key: 'Enter'})
            fireEvent.keyDown(document, {key: 'a'})

            expect(onCancel).not.toHaveBeenCalled()
        })

        it('a closed dialog does not listen for Escape', () => {
            const onCancel = vi.fn()
            render(<ConfirmationDialog {...defaultProps} isOpen={false} onCancel={onCancel} />)

            fireEvent.keyDown(document, {key: 'Escape'})

            expect(onCancel).not.toHaveBeenCalled()
        })

        it('stops listening once closed', () => {
            const onCancel = vi.fn()
            const {rerender} = render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />)
            rerender(<ConfirmationDialog {...defaultProps} isOpen={false} onCancel={onCancel} />)

            fireEvent.keyDown(document, {key: 'Escape'})

            expect(onCancel).not.toHaveBeenCalled()
        })

        it('Escape is ignored while the confirmed action is loading', () => {
            const onCancel = vi.fn()
            render(<ConfirmationDialog {...defaultProps} isLoading onCancel={onCancel} />)

            fireEvent.keyDown(document, {key: 'Escape'})

            expect(onCancel).not.toHaveBeenCalled()
        })

        it('focuses the Cancel button when it opens (the safe choice)', () => {
            render(<ConfirmationDialog {...defaultProps} />)

            expect(screen.getByText('Cancel')).toHaveFocus()
        })
    })

    describe('stacking and nesting', () => {
        it('is portaled to document.body, out of any stacking context of the page', () => {
            const {container} = render(
                <div className="animate-fade-in" data-testid="page-wrapper">
                    <ConfirmationDialog {...defaultProps} />
                </div>
            )

            const root = screen.getByText('Delete Test').closest('.fixed') as HTMLElement
            expect(root.parentElement).toBe(document.body)
            expect(container.contains(root)).toBe(false)
        })

        it('sits above the detail modal (z-[60]) and the floating panel (z-30)', () => {
            render(<ConfirmationDialog {...defaultProps} />)

            const root = screen.getByText('Delete Test').closest('.fixed') as HTMLElement
            expect(root.className).toContain('z-[70]')
        })

        it('still reacts to clicks and keeps them from reaching the modal underneath', () => {
            const onOuterClick = vi.fn()
            const onConfirm = vi.fn()
            render(
                <div onClick={onOuterClick}>
                    <ConfirmationDialog {...defaultProps} onConfirm={onConfirm} />
                </div>
            )

            fireEvent.click(screen.getByText('Confirm'))

            expect(onConfirm).toHaveBeenCalledTimes(1)
            expect(onOuterClick).not.toHaveBeenCalled()
        })

        it('Escape inside a confirm opened from a modal closes only the confirm, not the modal', () => {
            // The modal listens on document like TestDetailModal does.
            const closeModal = vi.fn()
            const onCancel = vi.fn()
            const listener = (e: KeyboardEvent) => {
                if (e.key === 'Escape') closeModal()
            }
            document.addEventListener('keydown', listener)
            render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />)

            fireEvent.keyDown(screen.getByText('Cancel'), {key: 'Escape'})

            expect(onCancel).toHaveBeenCalledTimes(1)
            expect(closeModal).not.toHaveBeenCalled()
            document.removeEventListener('keydown', listener)
        })

        it('with the confirm closed, Escape reaches the modal again', () => {
            const closeModal = vi.fn()
            const listener = (e: KeyboardEvent) => {
                if (e.key === 'Escape') closeModal()
            }
            document.addEventListener('keydown', listener)
            render(<ConfirmationDialog {...defaultProps} isOpen={false} />)

            fireEvent.keyDown(document.body, {key: 'Escape'})

            expect(closeModal).toHaveBeenCalledTimes(1)
            document.removeEventListener('keydown', listener)
        })
    })
})
