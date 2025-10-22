import {useState, useEffect} from 'react'
import {useTheme} from '@/hooks/useTheme'

interface HeaderProps {
    currentView: 'dashboard' | 'tests'
    onViewChange: (view: 'dashboard' | 'tests') => void
    wsConnected?: boolean
    user?: (() => {email: string; role?: string}) | {email: string; role?: string}
    onOpenSettings?: () => void
}

export default function Header({
    currentView,
    onViewChange,
    wsConnected = false,
    user,
    onOpenSettings,
}: HeaderProps) {
    const {isDark} = useTheme()
    const [showUserMenu, setShowUserMenu] = useState(false)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element
            if (showUserMenu && !target.closest('[data-user-menu]')) {
                setShowUserMenu(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showUserMenu])

    const handleLogout = () => {
        localStorage.removeItem('_auth')
        sessionStorage.removeItem('_auth')
        setShowUserMenu(false)
        window.location.reload()
    }

    // Get user data (handle both function and object types)
    const getUserData = () => {
        if (typeof user === 'function') {
            return user()
        }
        return user || null
    }

    return (
        <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    {/* Logo and title */}
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
                                <span className="text-white font-bold text-sm">YS</span>
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
                            Dashboard !!!
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

                    {/* Theme indicator, status, and user menu */}
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
                                    wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                                }`}></div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                                {wsConnected ? 'Live Updates' : 'Disconnected'}
                            </span>
                        </div>

                        {/* User menu */}
                        {user && (
                            <div className="relative" data-user-menu>
                                <button
                                    onClick={() => setShowUserMenu(!showUserMenu)}
                                    className="flex items-center space-x-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-md px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                        <span className="text-white text-xs font-medium">
                                            {getUserData()?.email?.[0]?.toUpperCase() || 'U'}
                                        </span>
                                    </div>
                                    <span className="hidden md:inline">
                                        {getUserData()?.email || 'User'}
                                    </span>
                                    <svg
                                        className="w-4 h-4"
                                        fill="currentColor"
                                        viewBox="0 0 20 20">
                                        <path
                                            fillRule="evenodd"
                                            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </button>

                                {/* Dropdown menu */}
                                {showUserMenu && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                                        <div className="py-1">
                                            <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                                                <div className="font-medium">
                                                    {getUserData()?.email || 'User'}
                                                </div>
                                                {getUserData()?.role && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                                                        {getUserData()?.role}
                                                    </div>
                                                )}
                                            </div>
                                            {onOpenSettings && (
                                                <button
                                                    onClick={() => {
                                                        onOpenSettings()
                                                        setShowUserMenu(false)
                                                    }}
                                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                                    ⚙️ Settings
                                                </button>
                                            )}
                                            <button
                                                onClick={handleLogout}
                                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                                🔓 Sign out
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    )
}
