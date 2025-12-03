/**
 * Utility for detecting and rendering clickable links in text
 */

// URL detection regex - matches http(s)://... and www....
const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi

export interface LinkifiedPart {
    type: 'text' | 'link'
    content: string
    href?: string
}

/**
 * Parses text and identifies URL links
 * @param text - The text to parse
 * @returns Array of parts (text and links)
 */
export function parseLinksInText(text: string): LinkifiedPart[] {
    if (!text) return []

    const parts: LinkifiedPart[] = []
    let lastIndex = 0

    // Find all URLs in the text
    const matches = Array.from(text.matchAll(URL_REGEX))

    matches.forEach((match) => {
        const url = match[0]
        const startIndex = match.index!

        // Add text before the URL
        if (startIndex > lastIndex) {
            parts.push({
                type: 'text',
                content: text.substring(lastIndex, startIndex),
            })
        }

        // Add the URL as a link
        const href = url.startsWith('www.') ? `https://${url}` : url
        parts.push({
            type: 'link',
            content: url,
            href,
        })

        lastIndex = startIndex + url.length
    })

    // Add remaining text after the last URL
    if (lastIndex < text.length) {
        parts.push({
            type: 'text',
            content: text.substring(lastIndex),
        })
    }

    // If no URLs were found, return the original text as a single part
    if (parts.length === 0) {
        parts.push({
            type: 'text',
            content: text,
        })
    }

    return parts
}

/**
 * Checks if text contains any URLs
 * @param text - The text to check
 * @returns true if text contains URLs
 */
export function containsLinks(text: string): boolean {
    if (!text) return false
    return URL_REGEX.test(text)
}

/**
 * Truncates text to a maximum length, preserving word boundaries
 * @param text - The text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text

    // Try to truncate at a word boundary
    const truncated = text.substring(0, maxLength)
    const lastSpace = truncated.lastIndexOf(' ')

    if (lastSpace > maxLength * 0.8) {
        // If we can cut at a word boundary reasonably close to maxLength
        return truncated.substring(0, lastSpace) + '...'
    }

    // Otherwise, hard cut
    return truncated + '...'
}
