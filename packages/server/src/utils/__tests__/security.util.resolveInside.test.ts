import {describe, it, expect} from 'vitest'
import path from 'path'
import {resolveInside} from '../security.util'
import {detectRasterImage} from '../imageType.util'

describe('resolveInside', () => {
    const base = path.resolve('/tmp/storage-base')

    it('returns the resolved path for children', () => {
        expect(resolveInside(base, 'a', 'b.png')).toBe(path.join(base, 'a', 'b.png'))
        expect(resolveInside(base, 'a/../b')).toBe(path.join(base, 'b'))
    })

    it.each([[''], ['.'], ['..'], ['../x'], ['a/../../x'], ['/etc/passwd']])(
        'throws for %j',
        (seg) => {
            expect(() => resolveInside(base, seg)).toThrow(/escapes/)
        }
    )

    it('is not fooled by a sibling directory sharing the prefix', () => {
        expect(() => resolveInside(base, '../storage-base-evil/x')).toThrow(/escapes/)
    })
})

describe('detectRasterImage', () => {
    it('recognises raster signatures', () => {
        expect(
            detectRasterImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ).toEqual({ext: '.png', mime: 'image/png'})
        expect(detectRasterImage(Buffer.from([0xff, 0xd8, 0xff]))?.ext).toBe('.jpg')
        expect(detectRasterImage(Buffer.from('GIF87a'))?.ext).toBe('.gif')
        expect(detectRasterImage(Buffer.from('BM....'))?.ext).toBe('.bmp')
        expect(
            detectRasterImage(
                Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])
            )?.ext
        ).toBe('.webp')
    })

    it.each([
        ['svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
        ['xml-prolog svg', '<?xml version="1.0"?><svg/>'],
        ['html', '<html></html>'],
        ['empty', ''],
        ['RIFF wav', 'RIFF\0\0\0\0WAVE'],
    ])('returns null for %s', (_n, body) => {
        expect(detectRasterImage(Buffer.from(body))).toBeNull()
    })
})
