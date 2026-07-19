import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {AlertBanner} from '../AlertBanner'

describe('AlertBanner', () => {
    it('renders title and message', () => {
        render(
            <AlertBanner
                severity="warning"
                icon={<span data-testid="icon" />}
                title="Warning: Disk space low"
                message="4.2 GB free (8%) — threshold is 20%"
            />
        )

        expect(screen.getByText('Warning: Disk space low')).toBeInTheDocument()
        expect(screen.getByText('4.2 GB free (8%) — threshold is 20%')).toBeInTheDocument()
        expect(screen.getByTestId('icon')).toBeInTheDocument()
        expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('does not render an action button when primaryAction is omitted', () => {
        render(<AlertBanner severity="warning" icon={<span />} title="Title" message="Message" />)

        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('renders and fires the primary action', () => {
        const onClick = vi.fn()
        render(
            <AlertBanner
                severity="warning"
                icon={<span />}
                title="Title"
                message="Message"
                primaryAction={{label: 'Free up space', onClick}}
            />
        )

        fireEvent.click(screen.getByRole('button', {name: 'Free up space'}))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not render a dismiss button when onDismiss is omitted', () => {
        render(<AlertBanner severity="warning" icon={<span />} title="Title" message="Message" />)

        expect(screen.queryByRole('button', {name: 'Dismiss'})).not.toBeInTheDocument()
    })

    it('renders and fires onDismiss', () => {
        const onDismiss = vi.fn()
        render(
            <AlertBanner
                severity="warning"
                icon={<span />}
                title="Title"
                message="Message"
                onDismiss={onDismiss}
            />
        )

        fireEvent.click(screen.getByRole('button', {name: 'Dismiss'}))
        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('applies danger styling for severity="danger"', () => {
        render(<AlertBanner severity="danger" icon={<span />} title="Critical" message="Message" />)

        expect(screen.getByRole('alert')).toHaveClass('bg-danger-50')
    })

    it('applies warning styling for severity="warning"', () => {
        render(<AlertBanner severity="warning" icon={<span />} title="Warning" message="Message" />)

        expect(screen.getByRole('alert')).toHaveClass('bg-warning-50')
    })
})
