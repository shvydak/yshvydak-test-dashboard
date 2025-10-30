import {describe, it, expect, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatsCard from '../StatsCard'

describe('StatsCard', () => {
    describe('Basic Rendering', () => {
        it('should render title, value, and icon', () => {
            render(<StatsCard title="Total Tests" value={42} icon="📊" />)

            expect(screen.getByText('Total Tests')).toBeInTheDocument()
            expect(screen.getByText('42')).toBeInTheDocument()
            expect(screen.getByText('📊')).toBeInTheDocument()
        })

        it('should render string values', () => {
            render(<StatsCard title="Success Rate" value="95%" icon="📈" />)

            expect(screen.getByText('95%')).toBeInTheDocument()
        })

        it('should apply custom className to value', () => {
            render(
                <StatsCard
                    title="Failed"
                    value={5}
                    icon="❌"
                    className="text-danger-600 dark:text-danger-400"
                />
            )

            const valueElement = screen.getByText('5')
            expect(valueElement).toHaveClass('text-danger-600', 'dark:text-danger-400')
        })

        it('should show loading state', () => {
            render(<StatsCard title="Total Tests" value={42} icon="📊" loading={true} />)

            expect(screen.queryByText('42')).not.toBeInTheDocument()
            expect(screen.getByText('Total Tests')).toBeInTheDocument()
        })
    })

    describe('Clickable Functionality', () => {
        it('should call onClick when clicked', async () => {
            const user = userEvent.setup()
            const handleClick = vi.fn()

            render(<StatsCard title="Failed Tests" value={5} icon="❌" onClick={handleClick} />)

            const card = screen.getByRole('button')
            await user.click(card)

            expect(handleClick).toHaveBeenCalledTimes(1)
        })

        it('should not be clickable when onClick is not provided', () => {
            render(<StatsCard title="Total Tests" value={42} icon="📊" />)

            const card = screen.getByText('Total Tests').closest('div')
            expect(card).not.toHaveAttribute('role', 'button')
            expect(card).not.toHaveAttribute('tabIndex')
        })

        it('should have cursor-pointer class when clickable', () => {
            render(<StatsCard title="Failed Tests" value={5} icon="❌" onClick={vi.fn()} />)

            const card = screen.getByRole('button')
            expect(card).toHaveClass('cursor-pointer')
        })

        it('should not have cursor-pointer class when not clickable', () => {
            render(<StatsCard title="Total Tests" value={42} icon="📊" />)

            const card = screen.getByText('Total Tests').closest('div')
            expect(card).not.toHaveClass('cursor-pointer')
        })
    })

    describe('Keyboard Accessibility', () => {
        it('should have tabIndex when clickable', () => {
            render(<StatsCard title="Failed Tests" value={5} icon="❌" onClick={vi.fn()} />)

            const card = screen.getByRole('button')
            expect(card).toHaveAttribute('tabIndex', '0')
        })

        it('should call onClick when Enter key is pressed', async () => {
            const user = userEvent.setup()
            const handleClick = vi.fn()

            render(<StatsCard title="Failed Tests" value={5} icon="❌" onClick={handleClick} />)

            const card = screen.getByRole('button')
            card.focus()
            await user.keyboard('{Enter}')

            expect(handleClick).toHaveBeenCalledTimes(1)
        })

        it('should call onClick when Space key is pressed', async () => {
            const user = userEvent.setup()
            const handleClick = vi.fn()

            render(<StatsCard title="Failed Tests" value={5} icon="❌" onClick={handleClick} />)

            const card = screen.getByRole('button')
            card.focus()
            await user.keyboard(' ')

            expect(handleClick).toHaveBeenCalledTimes(1)
        })

        it('should not call onClick when other keys are pressed', async () => {
            const user = userEvent.setup()
            const handleClick = vi.fn()

            render(<StatsCard title="Failed Tests" value={5} icon="❌" onClick={handleClick} />)

            const card = screen.getByRole('button')
            card.focus()
            await user.keyboard('a')
            await user.keyboard('{Escape}')

            expect(handleClick).not.toHaveBeenCalled()
        })
    })

    describe('ARIA Attributes', () => {
        it('should have role="button" when clickable', () => {
            render(<StatsCard title="Failed Tests" value={5} icon="❌" onClick={vi.fn()} />)

            expect(screen.getByRole('button')).toBeInTheDocument()
        })

        it('should not have role="button" when not clickable', () => {
            render(<StatsCard title="Total Tests" value={42} icon="📊" />)

            expect(screen.queryByRole('button')).not.toBeInTheDocument()
        })
    })

    describe('Multiple Clicks', () => {
        it('should handle multiple clicks', async () => {
            const user = userEvent.setup()
            const handleClick = vi.fn()

            render(<StatsCard title="Failed Tests" value={5} icon="❌" onClick={handleClick} />)

            const card = screen.getByRole('button')
            await user.click(card)
            await user.click(card)
            await user.click(card)

            expect(handleClick).toHaveBeenCalledTimes(3)
        })
    })

    describe('Edge Cases', () => {
        it('should render with value of 0', () => {
            render(<StatsCard title="Failed Tests" value={0} icon="❌" />)

            expect(screen.getByText('0')).toBeInTheDocument()
        })

        it('should render with empty string value', () => {
            render(<StatsCard title="Success Rate" value="" icon="📈" />)

            expect(screen.getByText('Success Rate')).toBeInTheDocument()
        })

        it('should render with large numbers', () => {
            render(<StatsCard title="Total Tests" value={999999} icon="📊" />)

            expect(screen.getByText('999999')).toBeInTheDocument()
        })
    })
})
