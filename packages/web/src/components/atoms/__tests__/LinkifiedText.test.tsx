import {describe, it, expect, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import {LinkifiedText} from '../LinkifiedText'

describe('LinkifiedText', () => {
    describe('Rendering', () => {
        it('should render plain text without links', () => {
            const text = 'This is plain text'
            render(<LinkifiedText text={text} />)

            expect(screen.getByText(text)).toBeInTheDocument()
        })

        it('should render null when text is empty', () => {
            const {container} = render(<LinkifiedText text="" />)

            expect(container.firstChild).toBeNull()
        })

        it('should render text with HTTPS URL as clickable link', () => {
            const text = 'Check https://example.com'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('href', 'https://example.com')
            expect(link).toHaveTextContent('https://example.com')
        })

        it('should render text with www URL as clickable link', () => {
            const text = 'Visit www.example.com'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('href', 'https://www.example.com')
            expect(link).toHaveTextContent('www.example.com')
        })

        it('should render multiple URLs as separate links', () => {
            const text = 'Check https://example1.com and https://example2.com'
            render(<LinkifiedText text={text} />)

            const links = screen.getAllByRole('link')
            expect(links).toHaveLength(2)
            expect(links[0]).toHaveAttribute('href', 'https://example1.com')
            expect(links[1]).toHaveAttribute('href', 'https://example2.com')
        })

        it('should render text before and after URLs', () => {
            const text = 'Before https://example.com after'
            const {container} = render(<LinkifiedText text={text} />)

            expect(container).toHaveTextContent('Before https://example.com after')
        })
    })

    describe('Link Attributes', () => {
        it('should have target="_blank" attribute', () => {
            const text = 'Link: https://example.com'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('target', '_blank')
        })

        it('should have rel="noopener noreferrer" attribute', () => {
            const text = 'Link: https://example.com'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        })

        it('should stop propagation on click', () => {
            const text = 'Link: https://example.com'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            const clickEvent = new MouseEvent('click', {bubbles: true})
            const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation')

            link.dispatchEvent(clickEvent)

            expect(stopPropagationSpy).toHaveBeenCalled()
        })
    })

    describe('CSS Classes', () => {
        it('should apply default className to container', () => {
            const text = 'Plain text'
            const {container} = render(<LinkifiedText text={text} />)

            const span = container.querySelector('span')
            expect(span).toBeInTheDocument()
            // Default className is empty string, so just verify span exists
        })

        it('should apply custom className to container', () => {
            const text = 'Plain text'
            const {container} = render(<LinkifiedText text={text} className="custom-class" />)

            const span = container.querySelector('span')
            expect(span).toHaveClass('custom-class')
        })

        it('should apply default linkClassName to links', () => {
            const text = 'Link: https://example.com'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveClass('text-primary-600')
            expect(link).toHaveClass('dark:text-primary-400')
            expect(link).toHaveClass('hover:underline')
        })

        it('should apply custom linkClassName to links', () => {
            const text = 'Link: https://example.com'
            render(<LinkifiedText text={text} linkClassName="custom-link-class" />)

            const link = screen.getByRole('link')
            expect(link).toHaveClass('custom-link-class')
        })

        it('should apply linkClassName to all links', () => {
            const text = 'Links: https://example1.com and https://example2.com'
            render(<LinkifiedText text={text} linkClassName="custom-link" />)

            const links = screen.getAllByRole('link')
            links.forEach((link) => {
                expect(link).toHaveClass('custom-link')
            })
        })
    })

    describe('Complex Scenarios', () => {
        it('should handle URL with path', () => {
            const text = 'Issue: https://example.com/issues/123'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('href', 'https://example.com/issues/123')
        })

        it('should handle URL with query parameters', () => {
            const text = 'Search: https://example.com/search?q=test&page=1'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('href', 'https://example.com/search?q=test&page=1')
        })

        it('should handle URL with hash', () => {
            const text = 'Section: https://example.com/docs#section-1'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('href', 'https://example.com/docs#section-1')
        })

        it('should handle text with newlines', () => {
            const text = 'Line 1\nhttps://example.com\nLine 3'
            const {container} = render(<LinkifiedText text={text} />)

            expect(container).toHaveTextContent('Line 1')
            expect(container).toHaveTextContent('Line 3')
            expect(screen.getByRole('link')).toBeInTheDocument()
        })

        it('should handle text with only URL', () => {
            const text = 'https://example.com'
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('href', 'https://example.com')
        })

        it('should handle consecutive URLs', () => {
            const text = 'https://example1.com https://example2.com'
            render(<LinkifiedText text={text} />)

            const links = screen.getAllByRole('link')
            expect(links).toHaveLength(2)
        })

        it('should handle mixed content with multiple URLs and text', () => {
            const text = 'Check https://example1.com for docs and www.example2.com for support'
            render(<LinkifiedText text={text} />)

            const links = screen.getAllByRole('link')
            expect(links).toHaveLength(2)
            expect(screen.getByText(/Check/)).toBeInTheDocument()
            expect(screen.getByText(/for docs and/)).toBeInTheDocument()
            expect(screen.getByText(/for support/)).toBeInTheDocument()
        })
    })

    describe('Edge Cases', () => {
        it('should handle very long URLs', () => {
            const longUrl = 'https://example.com/' + 'a'.repeat(200)
            const text = `Link: ${longUrl}`
            render(<LinkifiedText text={text} />)

            const link = screen.getByRole('link')
            expect(link).toHaveAttribute('href', longUrl)
        })

        it('should handle special characters in text', () => {
            const text = 'Special chars: @#$% https://example.com &*()'
            render(<LinkifiedText text={text} />)

            expect(screen.getByText(/Special chars/)).toBeInTheDocument()
            expect(screen.getByRole('link')).toBeInTheDocument()
        })

        it('should render correctly when className is undefined', () => {
            const text = 'Test'
            const {container} = render(<LinkifiedText text={text} className={undefined} />)

            const span = container.querySelector('span')
            expect(span).toBeInTheDocument()
        })
    })
})
