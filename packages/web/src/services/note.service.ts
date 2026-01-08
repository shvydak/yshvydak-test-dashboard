import {authGet, authPost, authDelete, getAuthToken} from '@features/authentication/utils/authFetch'
import {TestNote, NoteImage} from '@yshvydak/core'
import {config} from '@config/environment.config'

export const noteService = {
    /**
     * Get note for a test
     */
    async getNote(testId: string): Promise<TestNote | null> {
        const response = await authGet(`${config.api.serverUrl}/api/tests/${testId}/notes`)

        if (response.ok) {
            const result = await response.json()
            return result.data
        }

        throw new Error('Failed to get note')
    },

    /**
     * Save or update note for a test
     */
    async saveNote(testId: string, content: string): Promise<void> {
        const response = await authPost(`${config.api.serverUrl}/api/tests/${testId}/notes`, {
            content,
        })

        if (!response.ok) {
            throw new Error('Failed to save note')
        }
    },

    /**
     * Delete note for a test
     */
    async deleteNote(testId: string): Promise<void> {
        const response = await authDelete(`${config.api.serverUrl}/api/tests/${testId}/notes`)

        if (!response.ok) {
            throw new Error('Failed to delete note')
        }
    },

    /**
     * Upload images for a note
     */
    async uploadImages(testId: string, files: File[]): Promise<NoteImage[]> {
        const formData = new FormData()
        files.forEach((file) => {
            formData.append('images', file)
        })

        const token = getAuthToken()
        if (!token) {
            throw new Error('Authentication token not found')
        }

        const response = await fetch(`${config.api.serverUrl}/api/tests/${testId}/notes/images`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        })

        if (response.ok) {
            const result = await response.json()
            return result.data.images
        }

        throw new Error('Failed to upload images')
    },

    /**
     * Get all images for a note
     */
    async getImages(testId: string): Promise<NoteImage[]> {
        const response = await authGet(`${config.api.serverUrl}/api/tests/${testId}/notes/images`)

        if (response.ok) {
            const result = await response.json()
            return result.data
        }

        throw new Error('Failed to get images')
    },

    /**
     * Delete an image from a note
     */
    async deleteImage(testId: string, imageId: string): Promise<void> {
        const response = await authDelete(
            `${config.api.serverUrl}/api/tests/${testId}/notes/images/${imageId}`
        )

        if (!response.ok) {
            throw new Error('Failed to delete image')
        }
    },
}
