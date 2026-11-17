import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, act, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import type {TestProgress, TestResult} from '@yshvydak/core'
import {useTestsStore} from '../../store/testsStore'
import TestsList from '../TestsList'

// Render counters: rows (formatLastRun runs once per TestRow render), group headers (one per TestGroup
// render) and the grouped view (useTestGroups runs once per TestsList render).
const rowRenders = vi.hoisted(() => ({count: 0, groups: 0, lists: 0}))
vi.mock('../../hooks', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../hooks')>()
    return {
        ...actual,
        useTestGroups: (tests: Parameters<typeof actual.useTestGroups>[0]) => {
            rowRenders.lists++
            return actual.useTestGroups(tests)
        },
    }
})
vi.mock('../TestGroupHeader', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../TestGroupHeader')>()
    return {
        TestGroupHeader: (props: Parameters<typeof actual.TestGroupHeader>[0]) => {
            rowRenders.groups++
            return actual.TestGroupHeader(props)
        },
    }
})
vi.mock('../../utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils')>()
    return {
        ...actual,
        formatLastRun: (test: unknown) => {
            rowRenders.count++
            return actual.formatLastRun(test)
        },
    }
})

vi.mock('../../hooks/useTestStatusCounts', () => ({
    useTestStatusCounts: () => ({
        counts: {total: 1000, passed: 1000, failed: 0, skipped: 0, pending: 0, noted: 0},
    }),
}))
vi.mock('../../hooks/useFilteredTestsByStatus', () => ({
    useFilteredTestsByStatus: () => ({tests: [], isLoading: false, error: null}),
}))
vi.mock('@features/dashboard/hooks/useJiraSettings', () => ({
    useJiraSettings: () => ({settings: {baseUrl: '', chipAlignment: 'left', tagMode: 'tickets'}}),
}))
vi.mock('../../hooks/useJiraTicketInfo', () => ({
    useJiraTicketInfo: () => ({ticketInfo: new Map(), isLoading: false}),
}))
vi.mock('../../hooks/useNoteImages', () => ({useNoteImages: () => ({images: []})}))
vi.mock('@/services/testLink.service', () => ({
    testLinkService: {getLatestByTestId: vi.fn().mockResolvedValue(null)},
}))
vi.mock('../testDetail', () => ({TestDetailModal: () => null}))

const ROWS = 1000
const makeRows = (): TestResult[] =>
    Array.from({length: ROWS}, (_, i) => ({
        id: `exec-${i}`,
        testId: `tid-${i}`,
        name: `Test ${i}`,
        filePath: `tests/file-${i % 40}.spec.ts`,
        status: 'passed',
        duration: 100,
        runId: 'run-1',
        project: 'P',
        timestamp: '2026-01-01T00:00:00.000Z',
    })) as TestResult[]

const progress = (running: string[]): TestProgress => ({
    processId: 'p1',
    type: 'run-all',
    totalTests: ROWS,
    completedTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    runningTests: running.map((testId) => ({
        testId,
        name: testId,
        filePath: 'f',
        startedAt: '2026-01-01T00:00:00.000Z',
    })),
    startTime: 0,
})

// The row itself + a constant few; never a function of ROWS
const MAX_RENDERS_FOR_ONE_EVENT = 2

describe('TestsList render cost on a live event', () => {
    beforeEach(() => {
        rowRenders.count = rowRenders.groups = rowRenders.lists = 0
        useTestsStore.setState({
            tests: makeRows(),
            testsProject: 'P',
            listProject: 'P',
            error: null,
            activeProgress: null,
            runningTests: new Set(),
            runningGroups: new Set(),
            isRunningAllTests: false,
        })
        render(
            <MemoryRouter initialEntries={['/tests?project=P']}>
                <TestsList
                    onTestSelect={vi.fn()}
                    onTestRerun={vi.fn()}
                    selectedTest={null}
                    loading={false}
                    activeProject="P"
                />
            </MemoryRouter>
        )
    })

    it('renders every row once on mount (the probe is wired to the rows)', () => {
        expect(rowRenders.count).toBeGreaterThanOrEqual(ROWS)
    })

    it('a progress event for one test re-renders about that row only', () => {
        rowRenders.count = rowRenders.groups = rowRenders.lists = 0
        act(() => useTestsStore.getState().updateProgress(progress(['tid-5'])))

        expect(rowRenders.count).toBeGreaterThan(0)
        expect(rowRenders.count).toBeLessThanOrEqual(MAX_RENDERS_FOR_ONE_EVENT)
        // Neither the list nor any group depends on progress: no re-render above the row
        expect(rowRenders.lists).toBe(0)
        expect(rowRenders.groups).toBe(0)
    })

    it('the next progress event (another test starts, the first finishes) touches two rows at most', () => {
        act(() => useTestsStore.getState().updateProgress(progress(['tid-5'])))
        rowRenders.count = 0
        act(() => useTestsStore.getState().updateProgress(progress(['tid-6'])))

        expect(rowRenders.count).toBeLessThanOrEqual(MAX_RENDERS_FOR_ONE_EVENT + 1)
    })

    it('a saved result patches one row: it shows the new status and only its group re-renders', () => {
        const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement
        expect(rowOf('Test 5').textContent).toMatch(/passed/i)
        rowRenders.count = rowRenders.groups = rowRenders.lists = 0

        act(() => {
            useTestsStore.getState().applyLiveResult({
                id: 'exec-5-new',
                testId: 'tid-5',
                runId: 'run-2',
                name: 'Test 5',
                filePath: 'tests/file-5.spec.ts',
                status: 'failed',
                duration: 50,
                timestamp: '2026-01-02T00:00:00.000Z',
                project: 'P',
            })
        })

        expect(rowOf('Test 5').textContent).toMatch(/failed/i)
        expect(rowOf('Test 6').textContent).toMatch(/passed/i)
        expect(rowRenders.count).toBeGreaterThan(0)
        expect(rowRenders.count).toBeLessThanOrEqual(MAX_RENDERS_FOR_ONE_EVENT)
        // The list re-renders once (its rows changed); the groups whose rows are the same objects do not
        expect(rowRenders.lists).toBe(1)
        expect(rowRenders.groups).toBe(1)
    })
})
