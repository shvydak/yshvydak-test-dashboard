export type RasterImageType = {ext: string; mime: string}

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
    buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b)

/** Sniffs the real format from magic bytes. Raster formats only: SVG and anything unknown return null. */
export function detectRasterImage(buf: Buffer): RasterImageType | null {
    if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return {ext: '.png', mime: 'image/png'}
    }
    if (startsWith(buf, [0xff, 0xd8, 0xff])) return {ext: '.jpg', mime: 'image/jpeg'}
    if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return {ext: '.gif', mime: 'image/gif'}
    if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
        return {ext: '.webp', mime: 'image/webp'}
    }
    if (startsWith(buf, [0x42, 0x4d])) return {ext: '.bmp', mime: 'image/bmp'}
    return null
}
