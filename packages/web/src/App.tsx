import {useState, useEffect} from 'react'
import {TestResult} from '@yshvydak/core'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import TestsList from './components/TestsList'
import {useTestsStore} from './store/testsStore'
import {useWebSocket} from './hooks/useWebSocket'
import {config} from './config/environment.config'

type ViewMode = 'dashboard' | 'tests'

function App() {
     const [currentView, setCurrentView] = useState<ViewMode>('dashboard')
     const [selectedTest, setSelectedTest] = useState<TestResult | null>(null)
     const {fetchTests, isLoading, rerunTest, checkAndRestoreActiveStates} = useTestsStore()

     // WebSocket connection for live updates
     const {isConnected} = useWebSocket(config.websocket.url)

     useEffect(() => {
          // Initial data load and state restoration
          const initializeApp = async () => {
               await checkAndRestoreActiveStates()
               fetchTests()
          }
          
          initializeApp()

          // Periodic update every 30 seconds
          const interval = setInterval(() => {
               fetchTests()
          }, 30000)

          return () => clearInterval(interval)
     }, [fetchTests, checkAndRestoreActiveStates])

     const handleTestSelect = (test: TestResult) => {
          setSelectedTest(test)
          // Here you can add a modal or detailed test page
     }

     const handleTestRerun = async (testId: string) => {
          await rerunTest(testId)
     }

     return (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
               <Header
                    currentView={currentView}
                    onViewChange={setCurrentView}
                    wsConnected={isConnected}
               />

               <main className="container mx-auto px-4 py-8">
                    {currentView === 'dashboard' && <Dashboard />}

                    {currentView === 'tests' && (
                         <TestsList
                              onTestSelect={handleTestSelect}
                              onTestRerun={handleTestRerun}
                              selectedTest={selectedTest}
                              loading={isLoading}
                         />
                    )}
               </main>

               {/* Footer */}
               <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-12">
                    <div className="container mx-auto px-4 py-6">
                         <div className="flex items-center justify-between">
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                   © 2025 YShvydak Test Dashboard. Created by
                                   Yurii Shvydak.
                              </p>
                              <div className="flex items-center space-x-4">
                                   <span className="text-xs text-gray-500 dark:text-gray-500">
                                        v1.0.0
                                   </span>
                              </div>
                         </div>
                    </div>
               </footer>
          </div>
     )
}

export default App
