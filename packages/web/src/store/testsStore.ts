import {create} from 'zustand'
import {devtools} from 'zustand/middleware'
import {TestResult, TestRun} from '@yshvydak/core'

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
}

import { config } from '../config/environment.config'

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

               // Computed function
               getIsAnyTestRunning: () => {
                    const state = get()
                    return state.isDiscovering || state.isRunningAllTests || state.runningTests.size > 0 || state.runningGroups.size > 0
               },

               fetchTests: async () => {
                    try {
                         const currentState = get()
                         // Только устанавливаем isLoading если никакие другие операции не выполняются
                         const shouldSetLoading = !currentState.isDiscovering && 
                                                 !currentState.isRunningAllTests && 
                                                 currentState.runningTests.size === 0 && 
                                                 currentState.runningGroups.size === 0

                         if (shouldSetLoading) {
                              set({isLoading: true, error: null})
                         } else {
                              set({error: null})
                         }

                         const response = await fetch(`${API_BASE_URL}/tests`)
                         if (!response.ok) {
                              throw new Error(
                                   `HTTP error! status: ${response.status}`,
                              )
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
                              error:
                                   error instanceof Error
                                        ? error.message
                                        : 'Failed to fetch tests',
                              // Только сбрасываем isLoading если мы его устанавливали
                              isLoading: !currentState.isDiscovering && 
                                        !currentState.isRunningAllTests && 
                                        currentState.runningTests.size === 0 && 
                                        currentState.runningGroups.size === 0 ? false : currentState.isLoading,
                         })
                    }
               },

               fetchRuns: async () => {
                    try {
                         const response = await fetch(`${API_BASE_URL}/runs`)
                         if (!response.ok) {
                              throw new Error(
                                   `HTTP error! status: ${response.status}`,
                              )
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
                              error:
                                   error instanceof Error
                                        ? error.message
                                        : 'Failed to fetch runs',
                         })
                    }
               },

               rerunTest: async (testId: string) => {
                    try {
                         // Set this specific test as running
                         get().setTestRunning(testId, true)
                         set({error: null})

                         const response = await fetch(
                              `${API_BASE_URL}/tests/${testId}/rerun`,
                              {
                                   method: 'POST',
                                   headers: {
                                        'Content-Type': 'application/json',
                                   },
                              },
                         )

                         if (!response.ok) {
                              throw new Error(
                                   `HTTP error! status: ${response.status}`,
                              )
                         }

                         const data = await response.json()

                         if (data.success) {
                              console.log(`✅ Started running test: ${testId} (Rerun ID: ${data.rerunId})`)
                              // Обновляем тесты через некоторое время, чтобы получить обновленный статус
                              setTimeout(() => {
                                   get().fetchTests()
                              }, 2000)
                         } else {
                              throw new Error(
                                   data.message || 'Failed to rerun test',
                              )
                         }
                    } catch (error) {
                         console.error('Error rerunning test:', error)
                         set({
                              error:
                                   error instanceof Error
                                        ? error.message
                                        : 'Failed to rerun test',
                         })
                         // Clear the running state for this test on error
                         get().setTestRunning(testId, false)
                    }
               },

               discoverTests: async () => {
                    try {
                         set({isDiscovering: true, error: null})

                         const response = await fetch(
                              `${API_BASE_URL}/tests/discovery`,
                              {
                                   method: 'POST',
                                   headers: {
                                        'Content-Type': 'application/json',
                                   },
                              },
                         )

                         if (!response.ok) {
                              throw new Error(
                                   `HTTP error! status: ${response.status}`,
                              )
                         }

                         const data = await response.json()

                         if (data.success) {
                              console.log(
                                   `✅ Discovered ${data.data.discovered} tests, saved ${data.data.saved}`,
                              )
                              // Обновляем список тестов после discovery
                              await get().fetchTests()
                         } else {
                              throw new Error(
                                   data.message || 'Failed to discover tests',
                              )
                         }
                    } catch (error) {
                         console.error('Error discovering tests:', error)
                         set({
                              error:
                                   error instanceof Error
                                        ? error.message
                                        : 'Failed to discover tests',
                         })
                    } finally {
                         set({isDiscovering: false})
                    }
               },

               runAllTests: async () => {
                    try {
                         set({isRunningAllTests: true, error: null})

                         const response = await fetch(
                              `${API_BASE_URL}/tests/run-all`,
                              {
                                   method: 'POST',
                                   headers: {
                                        'Content-Type': 'application/json',
                                   },
                              },
                         )

                         if (!response.ok) {
                              throw new Error(
                                   `HTTP error! status: ${response.status}`,
                              )
                         }

                         const data = await response.json()

                         if (data.success) {
                              const runId = data.data.runId
                              console.log(
                                   `✅ Started running all tests (Run ID: ${runId})`,
                              )
                              
                              // Сохраняем ID run для отслеживания (используется WebSocket для завершения)
                              set({currentRunAllId: runId})
                              
                              // Обновляем runs список
                              setTimeout(() => {
                                   get().fetchRuns()
                                   get().fetchTests()
                              }, 1000)
                         } else {
                              throw new Error(
                                   data.message || 'Failed to run all tests',
                              )
                         }
                    } catch (error) {
                         console.error('Error running all tests:', error)
                         set({
                              error:
                                   error instanceof Error
                                        ? error.message
                                        : 'Failed to run all tests',
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

                         const response = await fetch(
                              `${API_BASE_URL}/tests/run-group`,
                              {
                                   method: 'POST',
                                   headers: {
                                        'Content-Type': 'application/json',
                                   },
                                   body: JSON.stringify({filePath}),
                              },
                         )

                         if (!response.ok) {
                              throw new Error(
                                   `HTTP error! status: ${response.status}`,
                              )
                         }

                         const data = await response.json()

                         if (data.success) {
                              console.log(
                                   `✅ Started running tests group: ${filePath} (Run ID: ${data.data.runId})`,
                              )
                              // Обновляем runs и tests списки
                              setTimeout(() => {
                                   get().fetchRuns()
                                   get().fetchTests()
                              }, 1000)
                         } else {
                              throw new Error(
                                   data.message || 'Failed to run tests group',
                              )
                         }
                    } catch (error) {
                         console.error('Error running tests group:', error)
                         set({
                              error:
                                   error instanceof Error
                                        ? error.message
                                        : 'Failed to run tests group',
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
                    try {
                         console.log('🔍 Checking for active runs...')
                         
                         // Проверяем активные runs
                         const response = await fetch(`${API_BASE_URL}/runs`)
                         if (!response.ok) {
                              console.warn(`⚠️ Failed to fetch runs: ${response.status}`)
                              return
                         }

                         const data = await response.json()
                         if (!data.success || !Array.isArray(data.data)) {
                              console.warn('⚠️ Invalid runs data format')
                              return
                         }

                         console.log(`📊 Total runs in database: ${data.data.length}`)

                         // Ищем активные runs (статус 'running')
                         const runningRuns = data.data.filter((run: any) => run.status === 'running')
                         console.log(`🏃 Runs with status 'running': ${runningRuns.length}`)
                         
                         if (runningRuns.length > 0) {
                              // Логируем детали каждого running run
                              runningRuns.forEach((run: any, index: number) => {
                                   console.log(`  Run ${index + 1}: ID=${run.id}, created=${run.created_at}, updated=${run.updated_at}`)
                              })
                              
                              // Проверяем только недавние runs (последние 10 минут)
                              const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
                              console.log(`⏰ Checking runs newer than: ${tenMinutesAgo.toISOString()}`)
                              
                              const recentActiveRuns = runningRuns.filter((run: any) => {
                                   const runTime = new Date(run.created_at || run.updated_at || Date.now())
                                   
                                   // Если timestamp недоступен, считаем run недавним (безопаснее для UX)
                                   if (!run.created_at && !run.updated_at) {
                                        console.log(`  Run ${run.id}: no timestamp - treating as RECENT`)
                                        return true
                                   }
                                   
                                   const isRecent = runTime > tenMinutesAgo
                                   console.log(`  Run ${run.id}: ${runTime.toISOString()} - ${isRecent ? 'RECENT' : 'OLD'}`)
                                   return isRecent
                              })
                              
                              if (recentActiveRuns.length > 0) {
                                   console.log(`🔄 Found ${recentActiveRuns.length} recent active run(s), restoring running state`)
                                   
                                   const latestRun = recentActiveRuns[0]
                                   
                                   set({
                                        isRunningAllTests: true,
                                        currentRunAllId: latestRun.id,
                                   })
                                   
                                   console.log(`🔄 Restored running state (Run ID: ${latestRun.id})`)
                                   
                                   // Добавляем fallback проверку каждые 30 секунд
                                   const fallbackCheck = setInterval(async () => {
                                        const currentState = get()
                                        if (currentState.isRunningAllTests) {
                                             console.log('🔍 Fallback check: verifying if any runs are still active...')
                                             try {
                                                  const resp = await fetch(`${API_BASE_URL}/runs`)
                                                  const data = await resp.json()
                                                  
                                                  if (data.success) {
                                                       const runningRuns = data.data.filter((run: any) => run.status === 'running')
                                                       const recentRunning = runningRuns.filter((run: any) => {
                                                            // Такая же логика как при инициализации
                                                            if (!run.created_at && !run.updated_at) return true
                                                            const runTime = new Date(run.created_at || run.updated_at)
                                                            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
                                                            return runTime > tenMinutesAgo
                                                       })
                                                       
                                                       console.log(`🔍 Fallback found ${recentRunning.length} recent running runs`)
                                                       
                                                       if (recentRunning.length === 0) {
                                                            console.log('⚠️ Fallback: No recent active runs found, resetting state')
                                                            set({
                                                                 isRunningAllTests: false,
                                                                 currentRunAllId: null
                                                            })
                                                            clearInterval(fallbackCheck)
                                                       }
                                                  }
                                             } catch (error) {
                                                  console.error('Fallback check error:', error)
                                             }
                                        } else {
                                             clearInterval(fallbackCheck)
                                        }
                                   }, 30000)
                                   
                              } else {
                                   console.log(`⚠️ Found ${runningRuns.length} old running run(s), but they are older than 10 minutes - ignoring`)
                                   console.log('✅ Buttons will be ENABLED')
                              }
                         } else {
                              console.log('✅ No runs with status "running" found, buttons will be enabled')
                         }

                    } catch (error) {
                         console.error('Error checking active states:', error)
                    }
               },
          }),
          {
               name: 'tests-store',
          },
     ),
)
