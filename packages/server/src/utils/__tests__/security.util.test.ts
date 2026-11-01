import {describe, it, expect} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {isSafeCliPath, isInsideDir, isSafeId, anchoredSpecFilter} from '../security.util'

describe('security.util', () => {
    describe('anchoredSpecFilter', () => {
        const regexOf = (filter: string) => new RegExp(filter.slice(1, -1))
        const touch = (root: string, rel: string) => {
            fs.mkdirSync(path.join(root, path.dirname(rel)), {recursive: true})
            fs.writeFileSync(path.join(root, rel), '')
        }

        it('pins the full real path, so same-named files elsewhere are not selected', () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-'))
            try {
                const real = fs.realpathSync(dir)
                for (const f of [
                    'e2e/tests/orders/c.spec.ts',
                    'e2e/tests/nested/orders/c.spec.ts',
                    'e2e/tests/purchase-orders/c.spec.ts',
                ]) {
                    touch(dir, f)
                }
                const re = regexOf(anchoredSpecFilter('orders/c.spec.ts', dir))
                expect(re.test(`${real}/e2e/tests/orders/c.spec.ts`)).toBe(true)
                expect(re.test(`${real}/e2e/tests/nested/orders/c.spec.ts`)).toBe(false)
                expect(re.test(`${real}/e2e/tests/purchase-orders/c.spec.ts`)).toBe(false)
            } finally {
                fs.rmSync(dir, {recursive: true, force: true})
            }
        })

        it('separates a root-level spec from a twin in a subfolder (testDir is the project dir)', () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-'))
            try {
                const real = fs.realpathSync(dir)
                touch(dir, 'orders/c.spec.ts')
                touch(dir, 'x/orders/c.spec.ts')
                const re = regexOf(anchoredSpecFilter('orders/c.spec.ts', dir))
                expect(re.test(`${real}/orders/c.spec.ts`)).toBe(true)
                expect(re.test(`${real}/x/orders/c.spec.ts`)).toBe(false)
            } finally {
                fs.rmSync(dir, {recursive: true, force: true})
            }
        })

        it('matches the symlink-resolved path when the project dir is a symlink', () => {
            const real = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'real-')))
            const link = path.join(os.tmpdir(), `link-${path.basename(real)}`)
            fs.symlinkSync(real, link)
            try {
                touch(real, 'e2e/tests/a.spec.ts')
                const re = regexOf(anchoredSpecFilter('a.spec.ts', link))
                expect(re.test(`${real}/e2e/tests/a.spec.ts`)).toBe(true)
                expect(re.test(`${link}/e2e/tests/a.spec.ts`)).toBe(true)
            } finally {
                fs.unlinkSync(link)
                fs.rmSync(real, {recursive: true, force: true})
            }
        })

        it('escapes regex characters in the path, with no flags', () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-'))
            try {
                const real = fs.realpathSync(dir)
                touch(dir, 'e2e/tests/meta/a(1)+[x]$.spec.ts')
                touch(dir, 'e2e/tests/meta/a1x.spec.ts')
                const re = regexOf(anchoredSpecFilter('meta/a(1)+[x]$.spec.ts', dir))
                expect(re.flags).toBe('')
                expect(re.test(`${real}/e2e/tests/meta/a(1)+[x]$.spec.ts`)).toBe(true)
                expect(re.test(`${real}/e2e/tests/meta/a1x.spec.ts`)).toBe(false)
            } finally {
                fs.rmSync(dir, {recursive: true, force: true})
            }
        })

        it('falls back to a path-segment anchor when the file is not on disk', () => {
            const re = regexOf(anchoredSpecFilter('a(b)+/x.spec.ts', os.tmpdir()))
            expect(re.test('/p/a(b)+/x.spec.ts')).toBe(true)
            expect(re.test('/p/a(b)+/x.spec.tsx')).toBe(false)
            expect(re.test('/p/xa(b)+/x.spec.ts')).toBe(false)
            expect(re.flags).toBe('')
        })
    })

    describe('isSafeCliPath', () => {
        it('accepts a non-existent normalized spec path when projectDir is a symlink', () => {
            const real = fs.mkdtempSync(path.join(os.tmpdir(), 'real-'))
            const link = path.join(os.tmpdir(), `link-${path.basename(real)}`)
            fs.symlinkSync(real, link)
            try {
                expect(isSafeCliPath('api-tests/x.spec.ts', link)).toBe(true)
            } finally {
                fs.unlinkSync(link)
                fs.rmSync(real, {recursive: true, force: true})
            }
        })

        it.each(['../x.spec.ts', 'a/../../x.spec.ts', '/etc/passwd', '--config=x', '-x', '', '.'])(
            'rejects %s',
            (value) => {
                expect(isSafeCliPath(value, os.tmpdir())).toBe(false)
            }
        )
    })

    describe('isInsideDir', () => {
        it('rejects a symlink inside the dir that points outside', () => {
            const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'))
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'))
            fs.writeFileSync(path.join(outside, 'f'), 'x')
            fs.symlinkSync(path.join(outside, 'f'), path.join(base, 'l'))
            try {
                expect(isInsideDir(path.join(base, 'l'), base)).toBe(false)
            } finally {
                fs.rmSync(base, {recursive: true, force: true})
                fs.rmSync(outside, {recursive: true, force: true})
            }
        })
    })

    describe('isSafeId', () => {
        it.each(['a/b', '..', '', 'x'.repeat(129)])('rejects %s', (v) => {
            expect(isSafeId(v)).toBe(false)
        })
        it('accepts UUIDs and stable test ids', () => {
            expect(isSafeId('3f2b8c1e-aaaa-4bbb-8ccc-123456789abc')).toBe(true)
            expect(isSafeId('test-66jqtq')).toBe(true)
        })
    })
})
