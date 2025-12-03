import {authGet, authPost, authDelete} from '@features/authentication/utils/authFetch'
import {TestNote} from '@yshvydak/core'
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
}
