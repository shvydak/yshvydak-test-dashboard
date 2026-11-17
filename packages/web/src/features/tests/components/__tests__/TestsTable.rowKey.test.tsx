import {describe, it, expect, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {TestResult} from '@yshvydak/core'
import {TestsTable} from '../TestsTable'
import {JIRA_SETTINGS_QUERY_KEY} from '@features/dashboard/hooks/useJiraSettings'

vi.mock('../../store/testsStore', () => ({
    useTestsStore: vi.fn((selector: (s: unknown) => unknown) =>
        selector({
            runningTests: new Set<string>(),
            getIsAnyTestRunning: () => false,
            activeProgress: null,
        })
    ),
}))
vi.mock('../../hooks/useNoteImages', () => ({useNoteImages: () => ({images: []})}))

const row = (id: string, status: string): TestResult =>
    ({
        id,
        testId: 'tid-1',
        name: 'Same test',
        filePath: 'a.spec.ts',
        status,
        duration: 1,
        runId: 'r',
        timestamp: '2026-01-01T00:00:00.000Z',
    }) as unknown as TestResult

describe('TestsTable row identity', () => {
    it('a live patch (new execution id, same testId) updates the row in place, no remount', () => {
        const queryClient = new QueryClient()
        queryClient.setQueryData(JIRA_SETTINGS_QUERY_KEY, {
            baseUrl: '',
            chipAlignment: 'left',
            tagMode: 'tickets',
        })
        const table = (test: TestResult) => (
            <QueryClientProvider client={queryClient}>
                <TestsTable
                    tests={[test]}
                    selectedTest={null}
                    onTestSelect={vi.fn()}
                    onTestRerun={vi.fn()}
                />
            </QueryClientProvider>
        )
        const view = render(table(row('exec-1', 'passed')))
        const before = screen.getByText('Same test').closest('tr')

        view.rerender(table(row('exec-2', 'failed')))

        const after = screen.getByText('Same test').closest('tr')
        expect(after).toBe(before)
        expect(after?.textContent).toMatch(/failed/i)
    })
})
