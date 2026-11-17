import {describe, it, expect} from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// request(server.app) / request(app) lets supertest listen on the wildcard address; a port held by another local process then answers instead of the app.
describe('integration tests talk to the app through server.url', () => {
    it('no test passes the Express app to supertest', () => {
        const dir = path.join(__dirname, '..', 'tests')
        const offenders = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.ts'))
            .filter((f) =>
                /request\(\s*(?:\w+\.)?app\s*\)/.test(fs.readFileSync(path.join(dir, f), 'utf8'))
            )
        expect(offenders).toEqual([])
    })
})
