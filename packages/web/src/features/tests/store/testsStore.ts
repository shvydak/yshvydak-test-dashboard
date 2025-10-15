import {create} from 'zustand'
import {devtools} from 'zustand/middleware'
import {TestResult, TestRun} from '@yshvydak/core'
import {authGet, authPost} from '@features/authentication/utils/authFetch'
import {getMaxWorkersFromStorage} from '@/hooks/usePlaywrightWorkers'

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

    // Computed function
    getIsAnyTestRunning: () => boolean

    // Actions
    fetchTests: () => Promise<void>
    fetchRuns: () => Promise<void>
    rerunTest: (testId: string) => Promise<void>
    discoverTests: () => Promise<void>
    runAllTests: () => Promise<void>
    runTestsGroup: (filePath: string) => Promise<void>
    clearError: () => void
    setTestRunning: (testId: string, isRunning: boolean) => void
    setGroupRunning: (filePath: string, isRunning: boolean) => void
    setRunningAllTests: (isRunning: boolean) => void
    checkAndRestoreActiveStates: () => Promise<void>
    selectExecution: (executionId: string | null) => void
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

                    const response = await authGet(`${API_BASE_URL}/tests?limit=200`)
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

                    const maxWorkers = getMaxWorkersFromStorage()
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

            discoverTests: async () => {
                try {
                    set({isDiscovering: true, error: null})

                    const response = await authPost(`${API_BASE_URL}/tests/discovery`)

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

            runAllTests: async () => {
                try {
                    set({isRunningAllTests: true, error: null})

                    const maxWorkers = getMaxWorkersFromStorage()
                    const response = await authPost(`${API_BASE_URL}/tests/run-all`, {
                        maxWorkers,
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

            runTestsGroup: async (filePath: string) => {
                try {
                    // Set this specific group as running
                    get().setGroupRunning(filePath, true)
                    set({error: null})

                    const maxWorkers = getMaxWorkersFromStorage()
                    const response = await authPost(`${API_BASE_URL}/tests/run-group`, {
                        filePath,
                        maxWorkers,
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
        }),
        {
            name: 'tests-store',
        }
    )
)
