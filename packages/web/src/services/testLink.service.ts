import {authGet} from '@features/authentication/utils/authFetch'
import {TestResult} from '@yshvydak/core'
import {config} from '@config/environment.config'

export const testLinkService = {
    /**
     * Latest row of a test across all projects, or null when no such test exists.
     * Resolves a shared `?testId=` link without relying on the loaded list.
     */
    async getLatestByTestId(testId: string): Promise<TestResult | null> {
        const response = await authGet(
            `${config.api.baseUrl}/tests/by-test-id/${encodeURIComponent(testId)}`
        )

        if (response.status === 404 || response.status === 400) return null
        if (!response.ok) throw new Error('Failed to load test')

        const result = await response.json()
        return result.data
    },
}
