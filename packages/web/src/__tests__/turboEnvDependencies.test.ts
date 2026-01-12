import {describe, it, expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('turbo.json globalDependencies', () => {
    it('includes .env so env changes invalidate turbo build cache', () => {
        // Resolve repo root robustly (tests may run from different working dirs)
        let dir = __dirname
        let turboPath = path.join(dir, 'turbo.json')
        while (!fs.existsSync(turboPath)) {
            const parent = path.dirname(dir)
            if (parent === dir) {
                break
            }
            dir = parent
            turboPath = path.join(dir, 'turbo.json')
        }

        const raw = fs.readFileSync(turboPath, 'utf8')
        const parsed = JSON.parse(raw) as {globalDependencies?: string[]}

        expect(Array.isArray(parsed.globalDependencies)).toBe(true)
        expect(parsed.globalDependencies).toContain('.env')
    })
})
