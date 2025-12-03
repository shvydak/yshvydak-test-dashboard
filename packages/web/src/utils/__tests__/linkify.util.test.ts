import {describe, it, expect} from 'vitest'
import {parseLinksInText, truncateText} from '../linkify.util'

describe('linkify.util', () => {
    describe('parseLinksInText()', () => {
        it('should parse text without links', () => {
            const text = 'This is plain text without any links'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                type: 'text',
                content: text,
            })
        })

        it('should parse text with single HTTPS URL', () => {
            const text = 'Check this link: https://example.com'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({type: 'text', content: 'Check this link: '})
            expect(result[1]).toEqual({
                type: 'link',
                content: 'https://example.com',
                href: 'https://example.com',
            })
        })

        it('should parse text with single HTTP URL', () => {
            const text = 'Visit http://example.com for more info'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(3)
            expect(result[0]).toEqual({type: 'text', content: 'Visit '})
            expect(result[1]).toEqual({
                type: 'link',
                content: 'http://example.com',
                href: 'http://example.com',
            })
            expect(result[2]).toEqual({type: 'text', content: ' for more info'})
        })

        it('should parse text with www URL', () => {
            const text = 'Go to www.example.com'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({type: 'text', content: 'Go to '})
            expect(result[1]).toEqual({
                type: 'link',
                content: 'www.example.com',
                href: 'https://www.example.com',
            })
        })

        it('should parse text with multiple URLs', () => {
            const text = 'Visit https://example.com and www.another.com'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(4)
            expect(result[0]).toEqual({type: 'text', content: 'Visit '})
            expect(result[1]).toEqual({
                type: 'link',
                content: 'https://example.com',
                href: 'https://example.com',
            })
            expect(result[2]).toEqual({type: 'text', content: ' and '})
            expect(result[3]).toEqual({
                type: 'link',
                content: 'www.another.com',
                href: 'https://www.another.com',
            })
        })

        it('should parse URL with path', () => {
            const text = 'Bug report: https://example.com/issues/123'
            const result = parseLinksInText(text)

            expect(result[1]).toEqual({
                type: 'link',
                content: 'https://example.com/issues/123',
                href: 'https://example.com/issues/123',
            })
        })

        it('should parse URL with query parameters', () => {
            const text = 'Search: https://example.com/search?q=test&page=1'
            const result = parseLinksInText(text)

            expect(result[1]).toEqual({
                type: 'link',
                content: 'https://example.com/search?q=test&page=1',
                href: 'https://example.com/search?q=test&page=1',
            })
        })

        it('should parse URL with hash', () => {
            const text = 'Section: https://example.com/docs#section-1'
            const result = parseLinksInText(text)

            expect(result[1]).toEqual({
                type: 'link',
                content: 'https://example.com/docs#section-1',
                href: 'https://example.com/docs#section-1',
            })
        })

        it('should handle URLs at the beginning of text', () => {
            const text = 'https://example.com is the link'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                type: 'link',
                content: 'https://example.com',
                href: 'https://example.com',
            })
            expect(result[1]).toEqual({type: 'text', content: ' is the link'})
        })

        it('should handle URLs at the end of text', () => {
            const text = 'Check this out: https://example.com'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({type: 'text', content: 'Check this out: '})
            expect(result[1]).toEqual({
                type: 'link',
                content: 'https://example.com',
                href: 'https://example.com',
            })
        })

        it('should handle URLs with subdomains', () => {
            const text = 'API docs: https://api.docs.example.com'
            const result = parseLinksInText(text)

            expect(result[1]).toEqual({
                type: 'link',
                content: 'https://api.docs.example.com',
                href: 'https://api.docs.example.com',
            })
        })

        it('should handle empty text', () => {
            const text = ''
            const result = parseLinksInText(text)

            expect(result).toHaveLength(0)
        })

        it('should handle text with only URL', () => {
            const text = 'https://example.com'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                type: 'link',
                content: 'https://example.com',
                href: 'https://example.com',
            })
        })

        it('should handle consecutive URLs', () => {
            const text = 'https://example1.com https://example2.com'
            const result = parseLinksInText(text)

            expect(result).toHaveLength(3)
            expect(result[0].type).toBe('link')
            expect(result[1].content).toBe(' ')
            expect(result[2].type).toBe('link')
        })

        it('should handle URLs with special characters in path', () => {
            const text = 'Issue: https://example.com/issues/bug-fix_v2.1'
            const result = parseLinksInText(text)

            expect(result[1]).toEqual({
                type: 'link',
                content: 'https://example.com/issues/bug-fix_v2.1',
                href: 'https://example.com/issues/bug-fix_v2.1',
            })
        })
    })

    describe('truncateText()', () => {
        it('should not truncate text shorter than max length', () => {
            const text = 'Short text'
            const result = truncateText(text, 50)

            expect(result).toBe('Short text')
        })

        it('should truncate text longer than max length', () => {
            const text = 'This is a very long text that needs to be truncated'
            const result = truncateText(text, 30)

            expect(result.length).toBeLessThanOrEqual(33) // 30 + "..."
            expect(result.endsWith('...')).toBe(true)
        })

        it('should truncate at word boundary', () => {
            const text = 'This is a test sentence'
            const result = truncateText(text, 10)

            // Function tries to find word boundary within 80% of maxLength (8 chars)
            // "This is a " is 10 chars with space at position 7
            // Since lastSpace (7) > maxLength * 0.8 (8), it truncates at position 7
            expect(result).toBe('This is a...')
            expect(result.length).toBeLessThanOrEqual(13) // 10 + "..."
        })

        it('should handle text with exact max length', () => {
            const text = 'Exactly 20 chars txt'
            const result = truncateText(text, 20)

            expect(result).toBe('Exactly 20 chars txt')
        })

        it('should handle single word longer than max length', () => {
            const text = 'VeryLongWordWithoutSpaces'
            const result = truncateText(text, 10)

            expect(result).toBe('VeryLongWo...')
        })

        it('should handle empty text', () => {
            const text = ''
            const result = truncateText(text, 50)

            expect(result).toBe('')
        })

        it('should handle text with only spaces', () => {
            const text = '     '
            const result = truncateText(text, 3)

            // Text is 5 chars, gets truncated to 3 + "..."
            expect(result).toBe('   ...')
        })

        it('should preserve word integrity', () => {
            const text = 'Testing word boundary truncation'
            const result = truncateText(text, 15)

            // Should find last space within 80% of 15 (12 chars)
            // "Testing word bo" is 15 chars, space at position 12
            // Since lastSpace (12) > maxLength * 0.8 (12), it truncates at position 12
            expect(result).toBe('Testing word bo...')
        })

        it('should handle text with newlines', () => {
            const text = 'Line 1\nLine 2\nLine 3'
            const result = truncateText(text, 10)

            // Truncates at 10 chars: "Line 1\nLin"
            // lastIndexOf(' ') would find no space (newline is not a space)
            // So it does a hard cut
            expect(result).toBe('Line 1\nLin...')
        })

        it('should handle max length of 1', () => {
            const text = 'Any text'
            const result = truncateText(text, 1)

            // Hard cut since no reasonable word boundary
            expect(result).toBe('A...')
        })

        it('should truncate at 50 characters for notes preview', () => {
            const text =
                'This is a test note that is longer than 50 characters and should be truncated properly'
            const result = truncateText(text, 50)

            expect(result.length).toBeLessThanOrEqual(53)
            expect(result.endsWith('...')).toBe(true)
        })

        it('should handle text with URLs', () => {
            const text = 'Check this link: https://example.com/very/long/path'
            const result = truncateText(text, 30)

            expect(result.endsWith('...')).toBe(true)
            expect(result.length).toBeLessThanOrEqual(33)
        })
    })
})
