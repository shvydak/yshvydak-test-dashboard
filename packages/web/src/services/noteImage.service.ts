import {authGet, authDelete} from '@features/authentication/utils/authFetch'
import {NoteImage} from '@yshvydak/core'
import {config} from '@config/environment.config'

export const noteImageService = {
    /**
     * Upload an image for a test note
     */
    async uploadImage(testId: string, file: File): Promise<NoteImage> {
        const formData = new FormData()
        formData.append('image', file)

        // Get auth token manually to avoid Content-Type header for FormData
        const token = localStorage.getItem('_auth') || sessionStorage.getItem('_auth')
        let authToken: string | null = null

        if (token) {
            try {
                const parsedAuth = JSON.parse(token)
                authToken = parsedAuth?.auth?.token || parsedAuth?.token || null
            } catch {
                // Ignore parse errors
            }
        }

        const headers: HeadersInit = {}
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`
        }
        // Don't set Content-Type - let browser set it with boundary for FormData

        const response = await fetch(`${config.api.serverUrl}/api/tests/${testId}/notes/images`, {
            method: 'POST',
            headers,
            body: formData,
        })

        if (response.status === 401) {
            // Handle authentication errors
            interface WindowWithLogout extends Window {
                __globalLogout?: () => void
            }
            const globalLogout = (window as WindowWithLogout).__globalLogout
            if (globalLogout) {
                globalLogout()
            } else {
                localStorage.removeItem('_auth')
                sessionStorage.removeItem('_auth')
                window.location.href = '/'
            }
            throw new Error('Authentication required')
        }

        if (response.ok) {
            const result = await response.json()
            return result.data
        }

        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to upload image')
    },

    /**
     * Get all images for a test note
     */
    async getImages(testId: string): Promise<NoteImage[]> {
        const response = await authGet(`${config.api.serverUrl}/api/tests/${testId}/notes/images`)

        if (response.ok) {
            const result = await response.json()
            return result.data || []
        }

        throw new Error('Failed to get images')
    },

    /**
     * Delete an image
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
