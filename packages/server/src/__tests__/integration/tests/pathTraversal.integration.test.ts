import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import {randomBytes} from 'crypto'
import {config} from '../../../config/environment.config'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {seedTestRuns, getTestResultCount} from '../helpers/database'

const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('png-body'),
])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')

describe('Path traversal hardening (Integration)', () => {
    let server: TestServerInstance
    let storageDir: string
    let victimDirs: string[]

    const auth = () => ({Authorization: `Bearer ${server.authToken}`})
    // `..%2F` reaches the handler as `../` after Express decodes the param
    // Unique leaf names per run: the `..%2F..%2F` payloads land in the shared temp dir
    const tag = randomBytes(4).toString('hex')
    const victim = `victim-${tag}`
    const planted = `planted-${tag}`
    const encoded = [`..%2F${victim}`, `..%2F..%2F${victim}`, `%2F${victim}`, 'a..b%5Cc']

    const expectSentinelsIntact = () => {
        for (const dir of victimDirs) expect(fs.readdirSync(dir)).toEqual(['sentinel.txt'])
    }

    beforeAll(async () => {
        server = await setupTestServer()
        storageDir = config.storage.outputDir
    })

    afterAll(async () => {
        for (const dir of [...(victimDirs ?? []), path.join(path.dirname(storageDir), planted)]) {
            fs.rmSync(dir, {recursive: true, force: true})
        }
        await teardownTestServer(server)
    })

    beforeEach(async () => {
        await cleanDatabase(server.testRepository)
        await server.testRepository.dbManager.execute('DELETE FROM note_images')
        await server.testRepository.dbManager.execute('DELETE FROM test_notes')

        // `..%2F<victim>` lands in storageDir, `..%2F..%2F<victim>` in its parent
        victimDirs = [path.join(storageDir, victim), path.join(path.dirname(storageDir), victim)]
        for (const dir of victimDirs) {
            fs.rmSync(dir, {recursive: true, force: true})
            fs.mkdirSync(dir, {recursive: true})
            fs.writeFileSync(path.join(dir, 'sentinel.txt'), 'keep')
        }
        fs.rmSync(path.join(storageDir, planted), {recursive: true, force: true})
        fs.rmSync(path.join(storageDir, '..', planted), {recursive: true, force: true})
    })

    describe('DELETE /api/tests/:testId/executions/:executionId', () => {
        it.each(encoded)('rejects executionId %s with 400 and keeps outside files', async (id) => {
            const res = await request(server.app)
                .delete(`/api/tests/test-abc/executions/${id}`)
                .set(auth())

            expect(res.status).toBe(400)
            expectSentinelsIntact()
        })

        it('answers 404 and keeps the files when the execution row does not exist', async () => {
            const ghostDir = path.join(storageDir, 'attachments', 'ghost-exec')
            fs.mkdirSync(ghostDir, {recursive: true})
            fs.writeFileSync(path.join(ghostDir, 'a.png'), 'x')

            await request(server.app)
                .delete('/api/tests/test-abc/executions/ghost-exec')
                .set(auth())
                .expect(404)

            expect(fs.existsSync(path.join(ghostDir, 'a.png'))).toBe(true)
        })

        it('still deletes a real execution and its files', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-real', 'test-abc', 'run-1', 'T', 'a.spec.ts', 'passed', 1]
            )
            const dir = path.join(storageDir, 'attachments', 'exec-real')
            fs.mkdirSync(dir, {recursive: true})
            fs.writeFileSync(path.join(dir, 'a.png'), 'x')

            await request(server.app)
                .delete('/api/tests/test-abc/executions/exec-real')
                .set(auth())
                .expect(200)

            expect(await getTestResultCount(server.testRepository.dbManager)).toBe(0)
            expect(fs.existsSync(dir)).toBe(false)
        })
    })

    describe('note routes', () => {
        it.each(encoded)('DELETE /:testId/notes rejects testId %s with 400', async (id) => {
            await request(server.app).delete(`/api/tests/${id}/notes`).set(auth()).expect(400)
            expectSentinelsIntact()
        })

        it.each(encoded)('every other :testId route rejects %s with 400', async (id) => {
            await request(server.app).get(`/api/tests/${id}/notes`).set(auth()).expect(400)
            await request(server.app)
                .post(`/api/tests/${id}/notes`)
                .set(auth())
                .send({content: 'x'})
                .expect(400)
            await request(server.app).get(`/api/tests/${id}/notes/images`).set(auth()).expect(400)
            await request(server.app)
                .delete(`/api/tests/${id}/notes/images/some-image`)
                .set(auth())
                .expect(400)
            await request(server.app).delete(`/api/tests/${id}`).set(auth()).expect(400)
            await request(server.app).get(`/api/tests/by-test-id/${id}`).set(auth()).expect(400)
            expectSentinelsIntact()
        })

        it('rejects an unsafe imageId with 400', async () => {
            await request(server.app)
                .delete('/api/tests/test-abc/notes/images/..%2F..%2Fx')
                .set(auth())
                .expect(400)
        })

        it('still deletes a real note and its images', async () => {
            await request(server.app)
                .post('/api/tests/test-abc/notes/images')
                .set(auth())
                .attach('image', PNG, {filename: 'a.png', contentType: 'image/png'})
                .expect(200)
            const dir = path.join(storageDir, 'note-images', 'test-abc')
            expect(fs.readdirSync(dir)).toHaveLength(1)

            await request(server.app).delete('/api/tests/test-abc/notes').set(auth()).expect(200)

            expect(fs.existsSync(dir)).toBe(false)
        })
    })

    describe('other id routes', () => {
        it.each(['/api/tests/..%2Fx', '/api/tests/..%2Fx/history', '/api/tests/traces/..%2Fx'])(
            'GET %s answers 400',
            async (url) => {
                await request(server.app).get(url).set(auth()).expect(400)
            }
        )

        it('GET /api/runs/:id rejects an unsafe id with 400', async () => {
            await request(server.app).get('/api/runs/..%2Fx').set(auth()).expect(400)
        })
    })

    describe('note image upload', () => {
        it.each(encoded)('refuses testId %s and writes nothing outside', async (id) => {
            const res = await request(server.app)
                .post(`/api/tests/${id}/notes/images`)
                .set(auth())
                .attach('image', PNG, {filename: 'x.png', contentType: 'image/png'})

            expect(res.status).toBe(400)
            expectSentinelsIntact()
        })

        it('does not create a directory outside note-images', async () => {
            await request(server.app)
                .post(`/api/tests/..%2F..%2F${planted}/notes/images`)
                .set(auth())
                .attach('image', PNG, {filename: 'x.png', contentType: 'image/png'})
                .expect(400)

            expect(fs.existsSync(path.join(storageDir, planted))).toBe(false)
            expect(fs.existsSync(path.join(storageDir, '..', planted))).toBe(false)
        })

        it('rejects SVG content declared as image/png', async () => {
            const res = await request(server.app)
                .post('/api/tests/test-abc/notes/images')
                .set(auth())
                .attach('image', SVG, {filename: 'x.svg', contentType: 'image/png'})

            expect(res.status).toBe(400)
            expect(fs.existsSync(path.join(storageDir, 'note-images', 'test-abc'))).toBe(false)
        })

        it.each(['image/svg+xml', 'text/html'])(
            'answers 400 (not 500) for declared %s',
            async (ct) => {
                const res = await request(server.app)
                    .post('/api/tests/test-abc/notes/images')
                    .set(auth())
                    .attach('image', SVG, {filename: 'x.svg', contentType: ct})

                expect(res.status).toBe(400)
            }
        )

        it('keeps URL-breaking characters out of the stored file name', async () => {
            const res = await request(server.app)
                .post('/api/tests/test-abc/notes/images')
                .set(auth())
                .attach('image', PNG, {filename: 'a#b?c%d e.png', contentType: 'image/png'})
                .expect(200)

            expect(res.body.data.fileName).toMatch(/^a_b_c_d e-\d+-[a-z0-9]{6}\.png$/)
        })

        it('answers 413 (not 500) for an upload over 5 MB', async () => {
            const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1)])

            const res = await request(server.app)
                .post('/api/tests/test-big/notes/images')
                .set(auth())
                .attach('image', big, {filename: 'big.png', contentType: 'image/png'})

            expect(res.status).toBe(413)
            expect(fs.existsSync(path.join(storageDir, 'note-images', 'test-big'))).toBe(false)
        })

        it('stores a dotfile client name under a real base name that the URL can serve', async () => {
            const up = await request(server.app)
                .post('/api/tests/test-abc/notes/images')
                .set(auth())
                .attach('image', PNG, {filename: '.png', contentType: 'image/png'})
                .expect(200)

            expect(up.body.data.fileName).toMatch(/^png-\d+-[a-z0-9]{6}\.png$/)
            await request(server.app).get(up.body.data.url).set(auth()).expect(200)
        })

        it('rejects non-image bytes declared as image/png', async () => {
            await request(server.app)
                .post('/api/tests/test-abc/notes/images')
                .set(auth())
                .attach('image', Buffer.from('hello'), {
                    filename: 'x.png',
                    contentType: 'image/png',
                })
                .expect(400)
        })

        it('stores a .svg-named PNG with a .png extension', async () => {
            const res = await request(server.app)
                .post('/api/tests/test-abc/notes/images')
                .set(auth())
                .attach('image', PNG, {filename: 'sneaky.svg', contentType: 'image/png'})
                .expect(200)

            expect(res.body.data.fileName).toMatch(/\.png$/)
            expect(res.body.data.mimeType).toBe('image/png')
            expect(res.body.data.url).not.toMatch(/svg/)
        })
    })

    describe('static upload routes', () => {
        it('serves uploads with nosniff, images inline', async () => {
            const up = await request(server.app)
                .post('/api/tests/test-abc/notes/images')
                .set(auth())
                .attach('image', PNG, {filename: 'a.png', contentType: 'image/png'})
                .expect(200)

            const res = await request(server.app).get(up.body.data.url).set(auth()).expect(200)

            expect(res.headers['x-content-type-options']).toBe('nosniff')
            expect(res.headers['content-disposition']).toBeUndefined()
        })

        it.each([
            ['note-images', 'old.svg'],
            ['attachments', 'page.html'],
            ['attachments', 'f.xht'],
            ['attachments', 'f.shtml'],
            ['attachments', 'f.svgz'],
            ['attachments', 'f.xsl'],
            ['attachments', 'noext'],
        ])('forces download for %s/%s', async (dir, file) => {
            const d = path.join(storageDir, dir, 'static-case')
            fs.mkdirSync(d, {recursive: true})
            fs.writeFileSync(path.join(d, file), '<svg/>')

            const res = await request(server.app)
                .get(`/${dir}/static-case/${file}`)
                .set(auth())
                .expect(200)

            expect(res.headers['x-content-type-options']).toBe('nosniff')
            expect(res.headers['content-disposition']).toMatch(/^attachment/)
            expect(res.headers['content-security-policy']).toBe('sandbox')
        })

        it.each([
            'a.png',
            'a.webm',
            'a.mp4',
            'a.jpg',
            'a.log',
            'a.json',
            'a.zip',
            'a.txt',
            'error-context-1.md',
            'a.csv',
        ])('serves %s inline', async (file) => {
            const d = path.join(storageDir, 'attachments', 'static-inline')
            fs.mkdirSync(d, {recursive: true})
            fs.writeFileSync(path.join(d, file), '{}')

            const res = await request(server.app)
                .get(`/attachments/static-inline/${file}`)
                .set(auth())
                .expect(200)

            expect(res.headers['x-content-type-options']).toBe('nosniff')
            expect(res.headers['content-disposition']).toBeUndefined()
        })
    })
})
