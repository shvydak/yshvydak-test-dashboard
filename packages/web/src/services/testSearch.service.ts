import {authGet} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

export interface TestSearchHit {
    testId: string
    name: string
    filePath: string
    project: string
    status: 'passed' | 'failed' | 'skipped' | 'pending'
    tickets: string[]
    notInCode?: boolean
    createdAt: string
    updatedAt: string
}

export const testSearchService = {
    /** Latest row of every test, across all projects, whose title, path or ticket tag matches. */
    async search(query: string, limit = 20): Promise<TestSearchHit[]> {
        const params = new URLSearchParams({q: query, limit: String(limit)})
        const response = await authGet(`${config.api.baseUrl}/tests/search?${params.toString()}`)
        if (!response.ok) throw new Error('Search failed')
        const result = await response.json()
        return result.data
    },
}
