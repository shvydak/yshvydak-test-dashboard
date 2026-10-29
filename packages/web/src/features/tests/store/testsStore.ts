import {create} from 'zustand'
import {devtools} from 'zustand/middleware'
import {TestResult, TestRun, TestProgress, LiveTestResult} from '@yshvydak/core'
import {queryClient} from '@config/queryClient'
import {authGet, authPost, authDelete} from '@features/authentication/utils/authFetch'
import {getMaxWorkersFromStorage} from '@/hooks/usePlaywrightWorkers'
import {getProjectWorkersOverride} from '@/hooks/useProjectTabs'
import {getAutoDiscoverFromStorage} from '@/hooks/useAutoDiscoverSetting'

export type DiscoveryMode = 'reset' | 'incremental'

interface TestsState {
    tests: TestResult[]
    runs: TestRun[]
    isLoading: boolean
    isDiscovering: boolean
    isRunningAllTests: boolean
    currentRunAllId: string | null
    runningTests: Set<string>
    runningGroups: Set<string>
    error: string | null
    lastUpdated: Date | null
    selectedExecutionId: string | null
    activeProgress: TestProgress | null
    /** A CI request is queued server-side; manual runs are refused until it has started. */
    ciRunQueued: boolean
    /** A CI pipeline is running; the server refuses manual Run All meanwhile. */
    ciPipelineRunning: boolean
    /** A Stop is cleaning up the run's data; the Stop button is disabled meanwhile. */
    ciStopping: boolean
    /** Why the last Stop failed; shown next to the Stop button, never the page-wide `error` (the run goes on). */
    stopError: string | null
    /** Project used for list fetches — WebSocket/interval refreshes reuse this. */
    listProject: string | null

    // Computed function
    getIsAnyTestRunning: () => boolean
    /** A run Stop can end: pipeline, run-all, group or rerun (not a bare discovery). */
    getIsStoppable: () => boolean
    /** Tooltip text for run buttons disabled by a CI pipeline / queued CI run, else null. */
    getCIBusyReason: () => string | null

    // Actions
    setListProject: (project: string | null) => void
    fetchTests: () => Promise<void>
    fetchRuns: () => Promise<void>
    rerunTest: (testId: string) => Promise<void>
    deleteTest: (testId: string) => Promise<void>
    deleteExecution: (testId: string, executionId: string) => Promise<void>
    // 'incremental' (manual Discover): keep statuses; 'reset' (default): rebuild pending rows
    discoverTests: (project?: string, mode?: DiscoveryMode) => Promise<void>
    runAllTests: (project?: string) => Promise<void>
    runTestsGroup: (filePath: string, testNames?: string[], project?: string) => Promise<void>
    clearError: () => void
    setTestRunning: (testId: string, isRunning: boolean) => void
    setGroupRunning: (filePath: string, isRunning: boolean) => void
    setRunningAllTests: (isRunning: boolean) => void
    setCIRunQueued: (queued: boolean) => void
    setCIPipelineRunning: (running: boolean) => void
    setCIStopping: (stopping: boolean) => void
    clearStopError: () => void
    stopRun: () => Promise<void>
    /** After run:cancelled: nothing is running any more, whatever the local flags still say. */
    resetRunState: () => void
    checkAndRestoreActiveStates: () => Promise<void>
    selectExecution: (executionId: string | null) => void
    updateProgress: (progress: TestProgress) => void
    /** Patch one row from a saved result (store + filtered lists); false = row unknown, caller reloads. */
    applyLiveResult: (result: LiveTestResult) => boolean
    clearProgress: () => void
}

import {config} from '@config/environment.config'

const API_BASE_URL = config.api.baseUrl

// A 409 carries the server's reason (a CI run is queued/running); show it instead of the bare status.
async function httpError(response: Response): Promise<Error> {
    if (response.status === 409) {
        try {
            const body = await response.json()
            if (typeof body?.message === 'string' && body.message) return new Error(body.message)
        } catch {
            // fall through to the generic message
        }
    }
    return new Error(`HTTP error! status: ${response.status}`)
}

// A failed discovery answers 500 with the real reason in `error` (e.g. a spec file that throws on import).
async function discoveryError(response: Response): Promise<Error> {
    try {
        const body = await response.json()
        if (typeof body?.error === 'string' && body.error) return new Error(body.error)
    } catch {
        // fall through to the generic message
    }
    return new Error(`HTTP error! status: ${response.status}`)
}

// Count queries only (no list GET); at most one refresh per window, shared by every socket.
export const LIVE_COUNTS_REFRESH_DELAY_MS = 1500
let liveCountsTimer: ReturnType<typeof setTimeout> | null = null

export function resetLiveCountsTimer() {
    if (liveCountsTimer) clearTimeout(liveCountsTimer)
    liveCountsTimer = null
    liveCountsPendingWhileHidden = false
}

let liveCountsPendingWhileHidden = false

function refreshCounts() {
    queryClient.invalidateQueries({queryKey: ['project-status-summary']})
    queryClient.invalidateQueries({queryKey: ['test-status-counts']})
}

function scheduleCountsRefresh() {
    if (liveCountsTimer) return
    liveCountsTimer = setTimeout(() => {
        liveCountsTimer = null
        // A hidden tab skips the refetch and catches up once when it is visible again
        if (typeof document !== 'undefined' && document.hidden) {
            liveCountsPendingWhileHidden = true
            return
        }
        refreshCounts()
    }, LIVE_COUNTS_REFRESH_DELAY_MS)
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !liveCountsPendingWhileHidden) return
        liveCountsPendingWhileHidden = false
        refreshCounts()
    })
}

// Result fields only: tags, notInCode, note and attachments stay from the list's catalog overlay.
function patchRow(row: TestResult, r: LiveTestResult): TestResult {
    return {
        ...row,
        id: r.id,
        runId: r.runId,
        status: r.status,
        duration: r.duration,
        errorMessage: r.errorMessage,
        timestamp: r.timestamp ?? row.timestamp,
        project: r.project || row.project,
    }
}

// Status-filtered lists (['filtered-tests-by-status', filter, project]): the row leaves a list
// whose status filter it no longer matches, joins one it now matches, and is patched in place otherwise.
function patchFilteredLists(r: LiveTestResult, patched: TestResult | null) {
    const entries = queryClient.getQueriesData<TestResult[]>({
        queryKey: ['filtered-tests-by-status'],
    })
    for (const [key, data] of entries) {
        const [, filter, project] = key as [string, string, string | null]
        if (!data || (project && project !== r.project)) continue
        const idx = data.findIndex((t) => t.testId === r.testId)
        const statusFilter = filter !== 'noted'
        const matches = !statusFilter || filter === r.status
        if (idx >= 0) {
            const next = [...data]
            if (!matches) next.splice(idx, 1)
            else next[idx] = patchRow(data[idx], r)
            queryClient.setQueryData(key, next)
        } else if (statusFilter && matches) {
            // Not in this list yet: take the full row from the store, else let the list refetch
            if (patched) queryClient.setQueryData(key, [patched, ...data])
            else queryClient.invalidateQueries({queryKey: key, exact: true})
        }
    }
}

export const useTestsStore = create<TestsState>()(
    devtools(
        (set, get) => ({
            tests: [],
            runs: [],
            isLoading: false,
            isDiscovering: false,
            isRunningAllTests: false,
            currentRunAllId: null,
            runningTests: new Set(),
            runningGroups: new Set(),
            error: null,
            lastUpdated: null,
            selectedExecutionId: null,
            activeProgress: null,
            listProject: null,
            ciRunQueued: false,
            ciPipelineRunning: false,
            ciStopping: false,
            stopError: null,

            // Computed function
            getIsAnyTestRunning: () => {
                const state = get()
                return (
                    state.ciPipelineRunning ||
                    state.ciRunQueued ||
                    state.ciStopping ||
                    state.isDiscovering ||
                    state.isRunningAllTests ||
                    state.runningTests.size > 0 ||
                    state.runningGroups.size > 0
                )
            },

            getIsStoppable: () => {
                const state = get()
                return (
                    state.ciPipelineRunning ||
                    state.isRunningAllTests ||
                    state.runningTests.size > 0 ||
                    state.runningGroups.size > 0
                )
            },

            getCIBusyReason: () => {
                const state = get()
                if (state.ciPipelineRunning) return 'A CI pipeline is running'
                if (state.ciRunQueued) return 'A CI run is queued'
                return null
            },

            setListProject: (project) => set({listProject: project}),

            fetchTests: async () => {
                try {
                    const currentState = get()
                    // Только устанавливаем isLoading если никакие другие операции не выполняются
                    const shouldSetLoading =
                        !currentState.isDiscovering &&
                        !currentState.isRunningAllTests &&
                        currentState.runningTests.size === 0 &&
                        currentState.runningGroups.size === 0

                    if (shouldSetLoading) {
                        set({isLoading: true, error: null})
                    } else {
                        set({error: null})
                    }

                    // With a project: ask the server for that project only (limit applies
                    // after project filter). Without: keep the previous global slice.
                    const params = new URLSearchParams()
                    if (currentState.listProject) {
                        params.set('project', currentState.listProject)
                        params.set('limit', '5000')
                    } else {
                        params.set('limit', '200')
                    }
                    const response = await authGet(`${API_BASE_URL}/tests?${params.toString()}`)
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`)
                    }

                    const data = await response.json()

                    if (data.success && Array.isArray(data.data)) {
                        set({
                            tests: data.data,
                            isLoading: shouldSetLoading ? false : currentState.isLoading,
                            lastUpdated: new Date(),
                        })

                        // Centralized here (rather than at every call site that
                        // triggers a refetch — rerun, run-all, group run, discovery,
                        // delete, the 30s poll fallback) so the filter-bar/tab-badge
                        // counts can never drift out of sync with the list simply
                        // because a call site forgot to invalidate them.
                        queryClient.invalidateQueries({queryKey: ['project-status-summary']})
                        queryClient.invalidateQueries({queryKey: ['test-status-counts']})
                        // Prefix match: every status filter + project of the filtered list
                        queryClient.invalidateQueries({queryKey: ['filtered-tests-by-status']})
                    } else {
                        throw new Error('Invalid response format')
                    }
                } catch (error) {
                    console.error('Error fetching tests:', error)
                    const currentState = get()
                    set({
                        error: error instanceof Error ? error.message : 'Failed to fetch tests',
                        // Только сбрасываем isLoading если мы его устанавливали
                        isLoading:
                            !currentState.isDiscovering &&
                            !currentState.isRunningAllTests &&
                            currentState.runningTests.size === 0 &&
                            currentState.runningGroups.size === 0
                                ? false
                                : currentState.isLoading,
                    })
                }
            },

            fetchRuns: async () => {
                try {
                    const response = await authGet(`${API_BASE_URL}/runs`)
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`)
                    }

                    const data = await response.json()

                    if (data.success && Array.isArray(data.data)) {
                        set({runs: data.data})
                    } else {
                        throw new Error('Invalid response format')
                    }
                } catch (error) {
                    console.error('Error fetching runs:', error)
                    set({
                        error: error instanceof Error ? error.message : 'Failed to fetch runs',
                    })
                }
            },

            rerunTest: async (testId: string) => {
                try {
                    // Set this specific test as running
                    get().setTestRunning(testId, true)
                    set({error: null})

                    const testProject = get().tests.find((t) => t.testId === testId)?.project
                    const maxWorkers =
                        getProjectWorkersOverride(testProject) ?? getMaxWorkersFromStorage()
                    const response = await authPost(`${API_BASE_URL}/tests/${testId}/rerun`, {
                        maxWorkers,
                    })

                    if (!response.ok) {
                        throw await httpError(response)
                    }

                    const data = await response.json()

                    if (data.success) {
                        // Обновляем тесты через некоторое время, чтобы получить обновленный статус
                        setTimeout(() => {
                            get().fetchTests()
                        }, 2000)
                    } else {
                        throw new Error(data.message || 'Failed to rerun test')
                    }
                } catch (error) {
                    console.error('Error rerunning test:', error)
                    set({
                        error: error instanceof Error ? error.message : 'Failed to rerun test',
                    })
                    // Clear the running state for this test on error
                    get().setTestRunning(testId, false)
                }
            },

            deleteTest: async (testId: string) => {
                try {
                    set({error: null})

                    const response = await authDelete(`${API_BASE_URL}/tests/${testId}`)

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`)
                    }

                    const data = await response.json()

                    if (data.success) {
                        // Refresh tests list after deletion
                        await get().fetchTests()
                    } else {
                        throw new Error(data.message || 'Failed to delete test')
                    }
                } catch (error) {
                    console.error('Error deleting test:', error)
                    set({
                        error: error instanceof Error ? error.message : 'Failed to delete test',
                    })
                    throw error
                }
            },

            deleteExecution: async (testId: string, executionId: string) => {
                try {
                    set({error: null})

                    const response = await authDelete(
                        `${API_BASE_URL}/tests/${testId}/executions/${executionId}`
                    )

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`)
                    }

                    const data = await response.json()

                    if (data.success) {
                        // Refresh tests list after deletion to update the latest execution
                        await get().fetchTests()
                    } else {
                        throw new Error(data.message || 'Failed to delete execution')
                    }
                } catch (error) {
                    console.error('Error deleting execution:', error)
                    set({
                        error:
                            error instanceof Error ? error.message : 'Failed to delete execution',
                    })
                    throw error
                }
            },

            discoverTests: async (project?: string, mode: DiscoveryMode = 'reset') => {
                try {
                    set({isDiscovering: true, error: null})

                    const response = await authPost(`${API_BASE_URL}/tests/discovery`, {
                        project: project || undefined,
                        mode,
                    })

                    if (!response.ok) {
                        throw await discoveryError(response)
                    }

                    const data = await response.json()

                    if (data.success) {
                        // Обновляем список тестов после discovery
                        await get().fetchTests()
                    } else {
                        throw new Error(data.message || 'Failed to discover tests')
                    }
                } catch (error) {
                    console.error('Error discovering tests:', error)
                    set({
                        error: error instanceof Error ? error.message : 'Failed to discover tests',
                    })
                } finally {
                    set({isDiscovering: false})
                }
            },

            runAllTests: async (project?: string) => {
                try {
                    const autoDiscover = getAutoDiscoverFromStorage()

                    // Auto-discover tests before running if setting is enabled
                    if (autoDiscover) {
                        set({isDiscovering: true, error: null})
                        try {
                            const discoveryResponse = await authPost(
                                `${API_BASE_URL}/tests/discovery`,
                                {project: project || undefined}
                            )
                            if (!discoveryResponse.ok) {
                                throw await discoveryError(discoveryResponse)
                            }
                            const discoveryData = await discoveryResponse.json()
                            if (!discoveryData.success) {
                                throw new Error(discoveryData.message || 'Failed to discover tests')
                            }
                            // Refresh test list with newly discovered tests (Q3)
                            await get().fetchTests()
                        } catch (error) {
                            // Q1: abort run if discovery failed
                            set({
                                isDiscovering: false,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : 'Failed to discover tests',
                            })
                            return
                        }
                        set({isDiscovering: false})
                    }

                    set({isRunningAllTests: true, error: null})

                    const maxWorkers =
                        getProjectWorkersOverride(project) ?? getMaxWorkersFromStorage()
                    const response = await authPost(`${API_BASE_URL}/tests/run-all`, {
                        maxWorkers,
                        project: project || undefined,
                        skipAutoDiscovery: true, // discovery already handled above (or disabled)
                    })

                    if (!response.ok) {
                        throw await httpError(response)
                    }

                    const data = await response.json()

                    if (data.success) {
                        const runId = data.data.runId

                        // Сохраняем ID run для отслеживания (используется WebSocket для завершения)
                        set({currentRunAllId: runId})

                        // Обновляем runs список
                        setTimeout(() => {
                            get().fetchRuns()
                            get().fetchTests()
                        }, 1000)
                    } else {
                        throw new Error(data.message || 'Failed to run all tests')
                    }
                } catch (error) {
                    console.error('Error running all tests:', error)
                    set({
                        error: error instanceof Error ? error.message : 'Failed to run all tests',
                        isRunningAllTests: false,
                        currentRunAllId: null,
                    })
                }
            },

            runTestsGroup: async (filePath: string, testNames?: string[], project?: string) => {
                try {
                    // Set this specific group as running
                    get().setGroupRunning(filePath, true)
                    set({error: null})

                    const maxWorkers =
                        getProjectWorkersOverride(project) ?? getMaxWorkersFromStorage()
                    const response = await authPost(`${API_BASE_URL}/tests/run-group`, {
                        filePath,
                        maxWorkers,
                        testNames,
                        project: project || undefined,
                    })

                    if (!response.ok) {
                        throw await httpError(response)
                    }

                    const data = await response.json()

                    if (data.success) {
                        // Обновляем runs и tests списки
                        setTimeout(() => {
                            get().fetchRuns()
                            get().fetchTests()
                        }, 1000)
                    } else {
                        throw new Error(data.message || 'Failed to run tests group')
                    }
                } catch (error) {
                    console.error('Error running tests group:', error)
                    set({
                        error: error instanceof Error ? error.message : 'Failed to run tests group',
                    })
                    // Clear the running state for this group on error
                    get().setGroupRunning(filePath, false)
                }
            },

            clearError: () => set({error: null}),

            setTestRunning: (testId: string, isRunning: boolean) => {
                set((state) => {
                    const newRunningTests = new Set(state.runningTests)
                    if (isRunning) {
                        newRunningTests.add(testId)
                    } else {
                        newRunningTests.delete(testId)
                    }
                    return {runningTests: newRunningTests}
                })
            },

            setGroupRunning: (filePath: string, isRunning: boolean) => {
                set((state) => {
                    const newRunningGroups = new Set(state.runningGroups)
                    if (isRunning) {
                        newRunningGroups.add(filePath)
                    } else {
                        newRunningGroups.delete(filePath)
                    }
                    return {runningGroups: newRunningGroups}
                })
            },

            setCIRunQueued: (queued: boolean) => set({ciRunQueued: queued}),

            setCIPipelineRunning: (running: boolean) => set({ciPipelineRunning: running}),

            setCIStopping: (stopping: boolean) => set({ciStopping: stopping}),

            clearStopError: () => set({stopError: null}),

            // The server answers once the run's data is removed; run:cancelled clears the flag too.
            stopRun: async () => {
                try {
                    set({ciStopping: true, stopError: null})
                    const response = await authPost(`${API_BASE_URL}/pipeline/stop`, {
                        reason: 'manual',
                    })
                    // Stop sits behind JWT like Settings: with ENABLE_AUTH off the server answers 403.
                    if (response.status === 403) {
                        throw new Error(
                            'Sign-in is required to stop a run: enable ENABLE_AUTH on the server'
                        )
                    }
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`)
                    }
                    await get().fetchTests()
                } catch (error) {
                    console.error('Error stopping the run:', error)
                    set({
                        stopError:
                            error instanceof Error ? error.message : 'Failed to stop the run',
                    })
                } finally {
                    set({ciStopping: false})
                }
            },

            resetRunState: () =>
                set({
                    ciStopping: false,
                    stopError: null,
                    isRunningAllTests: false,
                    currentRunAllId: null,
                    runningTests: new Set(),
                    runningGroups: new Set(),
                    activeProgress: null,
                }),

            setRunningAllTests: (isRunning: boolean) => {
                set({isRunningAllTests: isRunning})
                if (!isRunning) {
                    set({currentRunAllId: null})
                }
            },

            checkAndRestoreActiveStates: async () => {
                // This function is now simplified since state restoration
                // is handled by WebSocket connection:status event
            },

            selectExecution: (executionId: string | null) => {
                set({selectedExecutionId: executionId})
            },

            updateProgress: (progress: TestProgress) => {
                set({activeProgress: progress})
            },

            applyLiveResult: (result) => {
                scheduleCountsRefresh()
                const {tests, listProject} = get()
                // Another project's result is not in this tab's list; its counts are refreshed above
                const inTab = !listProject || listProject === result.project
                const idx = inTab ? tests.findIndex((t) => t.testId === result.testId) : -1
                if (inTab && idx < 0) return false

                // Reporter posts are fire-and-forget: a slower, older attempt must not overwrite a newer row
                const row = idx >= 0 ? tests[idx] : null
                if (row?.timestamp && result.timestamp && result.timestamp < row.timestamp) {
                    return true
                }

                let patched: TestResult | null = null
                if (idx >= 0) {
                    patched = patchRow(tests[idx], result)
                    const next = [...tests]
                    next[idx] = patched
                    set({tests: next})
                }
                patchFilteredLists(result, patched)
                return true
            },

            clearProgress: () => {
                set({activeProgress: null})
            },
        }),
        {
            name: 'tests-store',
        }
    )
)
