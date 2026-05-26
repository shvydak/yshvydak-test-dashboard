import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {SearchInput} from '../SearchInput'

describe('SearchInput', () => {
    describe('Basic rendering', () => {
        it('renders with default placeholder', () => {
            render(<SearchInput value="" onChange={vi.fn()} />)
            expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
        })

        it('renders with custom placeholder', () => {
            render(<SearchInput value="" onChange={vi.fn()} placeholder="Search tests..." />)
            expect(screen.getByPlaceholderText('Search tests...')).toBeInTheDocument()
        })

        it('shows current value', () => {
            render(<SearchInput value="login" onChange={vi.fn()} />)
            expect(screen.getByDisplayValue('login')).toBeInTheDocument()
        })
    })

    describe('Clear button (X)', () => {
        it('is hidden when value is empty', () => {
            render(<SearchInput value="" onChange={vi.fn()} />)
            expect(screen.queryByRole('button', {name: /clear search/i})).not.toBeInTheDocument()
        })

        it('is visible when value is non-empty', () => {
            render(<SearchInput value="login" onChange={vi.fn()} />)
            expect(screen.getByRole('button', {name: /clear search/i})).toBeInTheDocument()
        })

        it('calls onClear when clicked', () => {
            const onClear = vi.fn()
            render(<SearchInput value="login" onChange={vi.fn()} onClear={onClear} />)
            fireEvent.click(screen.getByRole('button', {name: /clear search/i}))
            expect(onClear).toHaveBeenCalledTimes(1)
        })

        it('calls onChange with empty value when clicked and no onClear provided', () => {
            const onChange = vi.fn()
            render(<SearchInput value="login" onChange={onChange} />)
            fireEvent.click(screen.getByRole('button', {name: /clear search/i}))
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({target: {value: ''}}))
        })

        it('is hidden when showClearButton is false', () => {
            render(<SearchInput value="login" onChange={vi.fn()} showClearButton={false} />)
            expect(screen.queryByRole('button', {name: /clear search/i})).not.toBeInTheDocument()
        })
    })

    describe('ESC key behavior', () => {
        it('calls onClear when ESC pressed with value', () => {
            const onClear = vi.fn()
            render(<SearchInput value="login" onChange={vi.fn()} onClear={onClear} />)
            fireEvent.keyDown(screen.getByRole('textbox'), {key: 'Escape'})
            expect(onClear).toHaveBeenCalledTimes(1)
        })

        it('calls onChange with empty string when ESC pressed and no onClear provided', () => {
            const onChange = vi.fn()
            render(<SearchInput value="login" onChange={onChange} />)
            fireEvent.keyDown(screen.getByRole('textbox'), {key: 'Escape'})
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({target: {value: ''}}))
        })

        it('blurs the input when ESC pressed with empty value', () => {
            render(<SearchInput value="" onChange={vi.fn()} />)
            const input = screen.getByRole('textbox')
            input.focus()
            expect(document.activeElement).toBe(input)
            fireEvent.keyDown(input, {key: 'Escape'})
            expect(document.activeElement).not.toBe(input)
        })

        it('passes through other key events to onKeyDown', () => {
            const onKeyDown = vi.fn()
            render(<SearchInput value="" onChange={vi.fn()} onKeyDown={onKeyDown} />)
            fireEvent.keyDown(screen.getByRole('textbox'), {key: 'Enter'})
            expect(onKeyDown).toHaveBeenCalledTimes(1)
        })

        it('also calls parent onKeyDown when ESC is pressed', () => {
            const onKeyDown = vi.fn()
            const onClear = vi.fn()
            render(
                <SearchInput
                    value="login"
                    onChange={vi.fn()}
                    onClear={onClear}
                    onKeyDown={onKeyDown}
                />
            )
            fireEvent.keyDown(screen.getByRole('textbox'), {key: 'Escape'})
            expect(onClear).toHaveBeenCalled()
            expect(onKeyDown).toHaveBeenCalled()
        })
    })

    describe('Result count', () => {
        it('shows count when value is non-empty and resultCount is provided', () => {
            render(<SearchInput value="login" onChange={vi.fn()} resultCount={7} />)
            expect(screen.getByText('7')).toBeInTheDocument()
        })

        it('does not show count when value is empty', () => {
            render(<SearchInput value="" onChange={vi.fn()} resultCount={7} />)
            expect(screen.queryByText('7')).not.toBeInTheDocument()
        })

        it('does not show count when resultCount is not provided', () => {
            render(<SearchInput value="login" onChange={vi.fn()} />)
            expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument()
        })

        it('shows zero count', () => {
            render(<SearchInput value="xyz" onChange={vi.fn()} resultCount={0} />)
            expect(screen.getByText('0')).toBeInTheDocument()
        })
    })

    describe('Shortcut hint', () => {
        it('does not show hint by default', () => {
            render(<SearchInput value="" onChange={vi.fn()} />)
            expect(screen.queryByRole('term')).not.toBeInTheDocument()
        })

        it('shows hint when showShortcutHint=true and value is empty', () => {
            render(<SearchInput value="" onChange={vi.fn()} showShortcutHint />)
            expect(screen.getByText('K')).toBeInTheDocument()
        })

        it('hides hint when value is non-empty', () => {
            render(<SearchInput value="login" onChange={vi.fn()} showShortcutHint />)
            expect(screen.queryByText('K')).not.toBeInTheDocument()
        })
    })
})
