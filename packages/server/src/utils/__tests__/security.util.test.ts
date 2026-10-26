import {describe, it, expect} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {isSafeCliPath, isInsideDir, isSafeId} from '../security.util'

describe('security.util', () => {
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
