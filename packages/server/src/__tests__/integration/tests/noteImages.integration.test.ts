import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import type {DatabaseManager} from '../../../database/database.manager'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'

const png = (body: string) =>
    Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from(body),
    ])

describe('Note Images API (Integration)', () => {
    let server: TestServerInstance
    const testId = 'test-note-images-123'

    beforeAll(async () => {
        server = await setupTestServer()
    })

    afterAll(async () => {
        await teardownTestServer(server)
    })

    beforeEach(async () => {
        await cleanDatabase(server.testRepository)
        await server.testRepository.dbManager.execute('DELETE FROM note_images')
        await server.testRepository.dbManager.execute('DELETE FROM test_notes')

        const noteImagesDir = path.join(server.dbPath, 'note-images')
        if (fs.existsSync(noteImagesDir)) {
            fs.rmSync(noteImagesDir, {recursive: true, force: true})
        }
    })

    it('should return distinct file paths for repeated uploads with the same original filename', async () => {
        const firstUpload = await request(server.app)
            .post(`/api/tests/${testId}/notes/images`)
            .set('Authorization', `Bearer ${server.authToken}`)
            .attach('image', png('first-image-content'), {
                filename: 'image.png',
                contentType: 'image/png',
            })
            .expect('Content-Type', /json/)
            .expect(200)

        const secondUpload = await request(server.app)
            .post(`/api/tests/${testId}/notes/images`)
            .set('Authorization', `Bearer ${server.authToken}`)
            .attach('image', png('second-image-content'), {
                filename: 'image.png',
                contentType: 'image/png',
            })
            .expect('Content-Type', /json/)
            .expect(200)

        expect(firstUpload.body.success).toBe(true)
        expect(secondUpload.body.success).toBe(true)

        expect(firstUpload.body.data.id).not.toBe(secondUpload.body.data.id)
        expect(firstUpload.body.data.fileName).not.toBe(secondUpload.body.data.fileName)
        expect(firstUpload.body.data.url).not.toBe(secondUpload.body.data.url)

        const imagesResponse = await request(server.app)
            .get(`/api/tests/${testId}/notes/images`)
            .set('Authorization', `Bearer ${server.authToken}`)
            .expect('Content-Type', /json/)
            .expect(200)

        expect(imagesResponse.body.success).toBe(true)
        expect(imagesResponse.body.data).toHaveLength(2)
        expect(imagesResponse.body.data.map((image: {id: string}) => image.id)).toEqual([
            firstUpload.body.data.id,
            secondUpload.body.data.id,
        ])

        const db = server.testRepository.dbManager as DatabaseManager
        const savedImages = await db.queryAll<{
            id: string
            file_name: string
            url: string
            file_path: string
        }>(
            'SELECT id, file_name, url, file_path FROM note_images WHERE test_id = ? ORDER BY created_at ASC',
            [testId]
        )

        expect(savedImages).toHaveLength(2)
        expect(savedImages[0].file_name).not.toBe(savedImages[1].file_name)
        expect(savedImages[0].url).not.toBe(savedImages[1].url)
        expect(fs.readFileSync(savedImages[0].file_path).equals(png('first-image-content'))).toBe(
            true
        )
        expect(fs.readFileSync(savedImages[1].file_path).equals(png('second-image-content'))).toBe(
            true
        )
    })
})
