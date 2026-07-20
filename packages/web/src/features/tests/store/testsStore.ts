import {create} from 'zustand'
import {devtools} from 'zustand/middleware'
import {TestResult, TestRun, TestProgress} from '@yshvydak/core'
import {queryClient} from '@config/queryClient'
import {authGet, authPost, authDelete} from '@features/authentication/utils/authFetch'
import {getMaxWorkersFromStorage} from '@/hooks/usePlaywrightWorkers'
import {getProjectWorkersOverride} from '@/hooks/useProjectTabs'
import {getAutoDiscoverFromStorage} from '@/hooks/useAutoDiscoverSetting'

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
    /** Project used for list fetches — WebSocket/interval refreshes reuse this. */
    listProject: string | null

    // Computed function
    getIsAnyTestRunning: () => boolean

    // Actions
    setListProject: (project: string | null) => void
    fetchTests: () => Promise<void>
    fetchRuns: () => Promise<void>
    rerunTest: (testId: string) => Promise<void>
    deleteTest: (testId: string) => Promise<void>
    deleteExecution: (testId: string, executionId: string) => Promise<void>
    discoverTests: (project?: string) => Promise<void>
    runAllTests: (project?: string) => Promise<void>
    runTestsGroup: (filePath: string, testNames?: string[], project?: string) => Promise<void>
    clearError: () => void
    setTestRunning: (testId: string, isRunning: boolean) => void
    setGroupRunning: (filePath: string, isRunning: boolean) => void
    setRunningAllTests: (isRunning: boolean) => void
    checkAndRestoreActiveStates: () => Promise<void>
    selectExecution: (executionId: string | null) => void
    updateProgress: (progress: TestProgress) => void
    clearProgress: () => void
}

import {config} from '@config/environment.config'

const API_BASE_URL = config.api.baseUrl

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

            // Computed function
            getIsAnyTestRunning: () => {
                const state = get()
                return (
                    state.isDiscovering ||
                    state.isRunningAllTests ||
                    state.runningTests.size > 0 ||
                    state.runningGroups.size > 0
                )
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
                        throw new Error(`HTTP error! status: ${response.status}`)
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

            discoverTests: async (project?: string) => {
                try {
                    set({isDiscovering: true, error: null})

                    const response = await authPost(`${API_BASE_URL}/tests/discovery`, {
                        project: project || undefined,
                    })

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`)
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
                                throw new Error(`HTTP error! status: ${discoveryResponse.status}`)
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
                        throw new Error(`HTTP error! status: ${response.status}`)
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
                        throw new Error(`HTTP error! status: ${response.status}`)
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

            clearProgress: () => {
                set({activeProgress: null})
            },
        }),
        {
            name: 'tests-store',
        }
    )
)
