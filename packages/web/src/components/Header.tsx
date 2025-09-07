import {useState, useEffect} from 'react'

interface HeaderProps {
     currentView: 'dashboard' | 'tests'
     onViewChange: (view: 'dashboard' | 'tests') => void
     wsConnected?: boolean
}

export default function Header({
     currentView,
     onViewChange,
     wsConnected = false,
}: HeaderProps) {
     const [isDark, setIsDark] = useState(false)

     useEffect(() => {
          // Проверяем системную тему при загрузке
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
          setIsDark(mediaQuery.matches)

          // Слушаем изменения системной темы
          const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
          mediaQuery.addEventListener('change', handler)

          return () => mediaQuery.removeEventListener('change', handler)
     }, [])

     return (
          <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
               <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between h-16">
                         {/* Logo and title */}
                         <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-2">
                                   <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
                                        <span className="text-white font-bold text-sm">
                                             YS
                                        </span>
                                   </div>
                                   <div>
                                        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                                             Test Dashboard
                                        </h1>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                             by Yurii Shvydak
                                        </p>
                                   </div>
                              </div>
                         </div>

                         {/* Navigation */}
                         <nav className="flex items-center space-x-1">
                              <button
                                   onClick={() => onViewChange('dashboard')}
                                   className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                                        currentView === 'dashboard'
                                             ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                                             : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                                   }`}>
                                   Dashboard
                              </button>
                              <button
                                   onClick={() => onViewChange('tests')}
                                   className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                                        currentView === 'tests'
                                             ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                                             : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                                   }`}>
                                   Tests
                              </button>
                         </nav>

                         {/* Theme indicator and status */}
                         <div className="flex items-center space-x-4">
                              {/* Theme indicator */}
                              <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                                   <span>{isDark ? '🌙' : '☀️'}</span>
                                   <span className="hidden sm:inline">
                                        {isDark ? 'Dark' : 'Light'} mode
                                   </span>
                              </div>

                              {/* WebSocket connection status indicator */}
                              <div className="flex items-center space-x-2">
                                   <div
                                        className={`w-2 h-2 rounded-full ${
                                             wsConnected
                                                  ? 'bg-green-500 animate-pulse'
                                                  : 'bg-red-500'
                                        }`}></div>
                                   <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                                        {wsConnected
                                             ? 'Live Updates'
                                             : 'Disconnected'}
                                   </span>
                              </div>
                         </div>
                    </div>
               </div>
          </header>
     )
}
