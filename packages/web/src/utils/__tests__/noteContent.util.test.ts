import {describe, it, expect} from 'vitest'
import {
    extractImageIds,
    insertImageMarker,
    parseNoteContent,
    removeImageMarker,
} from '../noteContent.util'
import {NoteImage} from '@yshvydak/core'

describe('noteContent.util', () => {
    describe('extractImageIds()', () => {
        it('should extract single image ID', () => {
            const content = 'Some text [IMAGE:image-123] more text'
            const result = extractImageIds(content)

            expect(result).toEqual(['image-123'])
        })

        it('should extract multiple image IDs', () => {
            const content = 'Text [IMAGE:img1] middle [IMAGE:img2] end'
            const result = extractImageIds(content)

            expect(result).toEqual(['img1', 'img2'])
        })

        it('should extract image IDs with UUIDs', () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000'
            const content = `Check this [IMAGE:${uuid}] out`
            const result = extractImageIds(content)

            expect(result).toEqual([uuid])
        })

        it('should return empty array for text without markers', () => {
            const content = 'Plain text without any image markers'
            const result = extractImageIds(content)

            expect(result).toEqual([])
        })

        it('should handle empty string', () => {
            const result = extractImageIds('')

            expect(result).toEqual([])
        })

        it('should handle multiple consecutive markers', () => {
            const content = '[IMAGE:img1][IMAGE:img2][IMAGE:img3]'
            const result = extractImageIds(content)

            expect(result).toEqual(['img1', 'img2', 'img3'])
        })

        it('should handle markers with special characters in ID', () => {
            const content = '[IMAGE:img-123_test.v2]'
            const result = extractImageIds(content)

            expect(result).toEqual(['img-123_test.v2'])
        })

        it('should not match incomplete markers', () => {
            const content = '[IMAGE:img1] [IMAGE incomplete] [IMAGE:img2]'
            const result = extractImageIds(content)

            expect(result).toEqual(['img1', 'img2'])
        })
    })

    describe('insertImageMarker()', () => {
        it('should insert marker at beginning of empty content', () => {
            const result = insertImageMarker('', 'img-123', 0)

            expect(result).toBe('[IMAGE:img-123]')
        })

        it('should insert marker at end of content', () => {
            const result = insertImageMarker('Some text', 'img-123', 9)

            expect(result).toBe('Some text [IMAGE:img-123]')
        })

        it('should insert marker in middle of content', () => {
            const result = insertImageMarker('Start end', 'img-123', 5)

            expect(result).toBe('Start [IMAGE:img-123] end')
        })

        it('should not add space before marker if content starts with cursor', () => {
            const result = insertImageMarker('Text', 'img-123', 0)

            expect(result).toBe('[IMAGE:img-123] Text')
        })

        it('should not add space after marker if content ends with cursor', () => {
            const result = insertImageMarker('Text', 'img-123', 4)

            expect(result).toBe('Text [IMAGE:img-123]')
        })

        it('should add space before marker if text before cursor', () => {
            const result = insertImageMarker('Start', 'img-123', 5)

            expect(result).toBe('Start [IMAGE:img-123]')
        })

        it('should add space after marker if text after cursor', () => {
            const result = insertImageMarker('End', 'img-123', 0)

            expect(result).toBe('[IMAGE:img-123] End')
        })

        it('should not add duplicate spaces', () => {
            const result = insertImageMarker('Text ', 'img-123', 5)

            expect(result).toBe('Text [IMAGE:img-123]')
        })

        it('should handle whitespace-only content before cursor', () => {
            const result = insertImageMarker('   ', 'img-123', 3)

            expect(result).toBe('   [IMAGE:img-123]')
        })

        it('should handle whitespace-only content after cursor', () => {
            const result = insertImageMarker('   ', 'img-123', 0)

            // Marker is inserted at position 0, after already starts with space so no extra space added
            expect(result).toBe('[IMAGE:img-123]   ')
        })
    })

    describe('parseNoteContent()', () => {
        const mockImages: NoteImage[] = [
            {
                id: 'img1',
                testId: 'test-123',
                fileName: 'image1.png',
                fileSize: 1000,
                mimeType: 'image/png',
                url: '/note-images/test-123/image1.png',
                createdAt: '2024-01-01T00:00:00Z',
            },
            {
                id: 'img2',
                testId: 'test-123',
                fileName: 'image2.jpg',
                fileSize: 2000,
                mimeType: 'image/jpeg',
                url: '/note-images/test-123/image2.jpg',
                createdAt: '2024-01-01T00:00:00Z',
            },
        ]

        it('should parse text without markers', () => {
            const content = 'Plain text without any images'
            const result = parseNoteContent(content, [])

            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                type: 'text',
                content: 'Plain text without any images',
            })
        })

        it('should parse text with single image marker', () => {
            const content = 'Check this [IMAGE:img1] out'
            const result = parseNoteContent(content, mockImages)

            expect(result).toHaveLength(3)
            expect(result[0]).toEqual({type: 'text', content: 'Check this '})
            expect(result[1]).toEqual({
                type: 'image',
                content: '[IMAGE:img1]',
                imageId: 'img1',
                image: mockImages[0],
            })
            expect(result[2]).toEqual({type: 'text', content: ' out'})
        })

        it('should parse text with multiple image markers', () => {
            const content = 'First [IMAGE:img1] second [IMAGE:img2] third'
            const result = parseNoteContent(content, mockImages)

            expect(result).toHaveLength(5)
            expect(result[0]).toEqual({type: 'text', content: 'First '})
            expect(result[1]).toEqual({
                type: 'image',
                content: '[IMAGE:img1]',
                imageId: 'img1',
                image: mockImages[0],
            })
            expect(result[2]).toEqual({type: 'text', content: ' second '})
            expect(result[3]).toEqual({
                type: 'image',
                content: '[IMAGE:img2]',
                imageId: 'img2',
                image: mockImages[1],
            })
            expect(result[4]).toEqual({type: 'text', content: ' third'})
        })

        it('should handle image marker at beginning', () => {
            const content = '[IMAGE:img1] at the start'
            const result = parseNoteContent(content, mockImages)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                type: 'image',
                content: '[IMAGE:img1]',
                imageId: 'img1',
                image: mockImages[0],
            })
            expect(result[1]).toEqual({type: 'text', content: ' at the start'})
        })

        it('should handle image marker at end', () => {
            const content = 'Text at the end [IMAGE:img1]'
            const result = parseNoteContent(content, mockImages)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({type: 'text', content: 'Text at the end '})
            expect(result[1]).toEqual({
                type: 'image',
                content: '[IMAGE:img1]',
                imageId: 'img1',
                image: mockImages[0],
            })
        })

        it('should handle consecutive image markers', () => {
            const content = '[IMAGE:img1][IMAGE:img2]'
            const result = parseNoteContent(content, mockImages)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                type: 'image',
                content: '[IMAGE:img1]',
                imageId: 'img1',
                image: mockImages[0],
            })
            expect(result[1]).toEqual({
                type: 'image',
                content: '[IMAGE:img2]',
                imageId: 'img2',
                image: mockImages[1],
            })
        })

        it('should handle marker with non-existent image ID as text', () => {
            const content = 'Text [IMAGE:non-existent] more'
            const result = parseNoteContent(content, [])

            expect(result).toHaveLength(3)
            expect(result[0]).toEqual({type: 'text', content: 'Text '})
            expect(result[1]).toEqual({
                type: 'text',
                content: '[IMAGE:non-existent]',
            })
            expect(result[2]).toEqual({type: 'text', content: ' more'})
        })

        it('should skip empty text parts', () => {
            const content = '[IMAGE:img1]   [IMAGE:img2]'
            const result = parseNoteContent(content, mockImages)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                type: 'image',
                content: '[IMAGE:img1]',
                imageId: 'img1',
                image: mockImages[0],
            })
            expect(result[1]).toEqual({
                type: 'image',
                content: '[IMAGE:img2]',
                imageId: 'img2',
                image: mockImages[1],
            })
        })

        it('should handle empty content', () => {
            const result = parseNoteContent('', [])

            expect(result).toEqual([])
        })

        it('should handle content with only whitespace', () => {
            const result = parseNoteContent('   \n\t   ', [])

            // Whitespace-only content is still returned as a text part
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                type: 'text',
                content: '   \n\t   ',
            })
        })

        it('should handle mixed valid and invalid image IDs', () => {
            const content = 'Valid [IMAGE:img1] invalid [IMAGE:bad-id] valid [IMAGE:img2]'
            const result = parseNoteContent(content, mockImages)

            // Text parts are split: before img1, between img1 and bad-id, between bad-id and img2, after img2
            expect(result).toHaveLength(6)
            expect(result[0]).toEqual({type: 'text', content: 'Valid '})
            expect(result[1]).toEqual({
                type: 'image',
                content: '[IMAGE:img1]',
                imageId: 'img1',
                image: mockImages[0],
            })
            expect(result[2]).toEqual({type: 'text', content: ' invalid '})
            expect(result[3]).toEqual({type: 'text', content: '[IMAGE:bad-id]'})
            expect(result[4]).toEqual({type: 'text', content: ' valid '})
            expect(result[5]).toEqual({
                type: 'image',
                content: '[IMAGE:img2]',
                imageId: 'img2',
                image: mockImages[1],
            })
        })

        it('should handle markers with special characters in ID', () => {
            const specialImage: NoteImage = {
                id: 'img-123_test.v2',
                testId: 'test-123',
                fileName: 'special.png',
                fileSize: 1000,
                mimeType: 'image/png',
                url: '/note-images/test-123/special.png',
                createdAt: '2024-01-01T00:00:00Z',
            }
            const content = 'Text [IMAGE:img-123_test.v2] end'
            const result = parseNoteContent(content, [specialImage])

            expect(result).toHaveLength(3)
            expect(result[1]).toEqual({
                type: 'image',
                content: '[IMAGE:img-123_test.v2]',
                imageId: 'img-123_test.v2',
                image: specialImage,
            })
        })
    })

    describe('removeImageMarker()', () => {
        it('should remove single marker', () => {
            const content = 'Text [IMAGE:img1] more text'
            const result = removeImageMarker(content, 'img1')

            // After removing marker, double space remains (trim() only removes leading/trailing)
            expect(result).toBe('Text  more text')
        })

        it('should remove multiple occurrences of same marker', () => {
            const content = '[IMAGE:img1] text [IMAGE:img1] more [IMAGE:img1]'
            const result = removeImageMarker(content, 'img1')

            // After removing markers, spaces remain, trim() only removes leading/trailing
            expect(result).toBe('text  more')
        })

        it('should not remove different markers', () => {
            const content = '[IMAGE:img1] text [IMAGE:img2]'
            const result = removeImageMarker(content, 'img1')

            // After removing marker and trim(), leading space is removed
            expect(result).toBe('text [IMAGE:img2]')
        })

        it('should handle empty content', () => {
            const result = removeImageMarker('', 'img1')

            expect(result).toBe('')
        })

        it('should handle content without marker', () => {
            const content = 'Text without markers'
            const result = removeImageMarker(content, 'img1')

            expect(result).toBe('Text without markers')
        })

        it('should trim result', () => {
            const content = '  [IMAGE:img1]  '
            const result = removeImageMarker(content, 'img1')

            expect(result).toBe('')
        })

        it('should handle marker with special characters', () => {
            const content = 'Text [IMAGE:img-123_test.v2] end'
            const result = removeImageMarker(content, 'img-123_test.v2')

            // After removing marker, double space remains (trim() only removes leading/trailing)
            expect(result).toBe('Text  end')
        })
    })
})
