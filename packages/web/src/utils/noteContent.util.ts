import {NoteImage} from '@yshvydak/core'

export interface ParsedNotePart {
    type: 'text' | 'image'
    content: string
    imageId?: string
    image?: NoteImage
}

const IMAGE_MARKER_REGEX = /\[IMAGE:([^\]]+)\]/g

/**
 * Extract all image IDs from note content
 */
export function extractImageIds(content: string): string[] {
    const imageIds: string[] = []
    let match

    while ((match = IMAGE_MARKER_REGEX.exec(content)) !== null) {
        imageIds.push(match[1])
    }

    return imageIds
}

/**
 * Insert image marker at cursor position
 */
export function insertImageMarker(
    content: string,
    imageId: string,
    cursorPosition: number
): string {
    const marker = `[IMAGE:${imageId}]`
    const before = content.substring(0, cursorPosition)
    const after = content.substring(cursorPosition)

    // Add space before marker if there's text before cursor
    const spaceBefore = before.trim().length > 0 && !before.endsWith(' ') ? ' ' : ''
    // Add space after marker if there's text after cursor
    const spaceAfter = after.trim().length > 0 && !after.startsWith(' ') ? ' ' : ''

    return `${before}${spaceBefore}${marker}${spaceAfter}${after}`
}

/**
 * Parse note content and replace image markers with parsed parts
 */
export function parseNoteContent(content: string, images: NoteImage[]): ParsedNotePart[] {
    if (!content) return []

    const parts: ParsedNotePart[] = []
    const imageMap = new Map<string, NoteImage>()
    images.forEach((img) => imageMap.set(img.id, img))

    let lastIndex = 0
    let match

    // Reset regex
    IMAGE_MARKER_REGEX.lastIndex = 0

    while ((match = IMAGE_MARKER_REGEX.exec(content)) !== null) {
        // Add text before marker
        if (match.index > lastIndex) {
            const text = content.substring(lastIndex, match.index)
            if (text.trim().length > 0) {
                parts.push({
                    type: 'text',
                    content: text,
                })
            }
        }

        // Add image marker
        const imageId = match[1]
        const image = imageMap.get(imageId)
        if (image) {
            parts.push({
                type: 'image',
                content: match[0],
                imageId,
                image,
            })
        } else {
            // Image not found, keep as text
            parts.push({
                type: 'text',
                content: match[0],
            })
        }

        lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < content.length) {
        const text = content.substring(lastIndex)
        if (text.trim().length > 0) {
            parts.push({
                type: 'text',
                content: text,
            })
        }
    }

    // If no markers found, return entire content as text
    if (parts.length === 0) {
        parts.push({
            type: 'text',
            content,
        })
    }

    return parts
}

/**
 * Remove image marker from content
 */
export function removeImageMarker(content: string, imageId: string): string {
    return content.replace(new RegExp(`\\[IMAGE:${imageId}\\]`, 'g'), '').trim()
}
