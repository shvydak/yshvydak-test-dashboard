import {useState, useEffect} from 'react'
import {useNavigate, useLocation} from 'react-router-dom'
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
    const navigate = useNavigate()
    const location = useLocation()
    const [showUserMenu, setShowUserMenu] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false)
    }, [location.pathname])

    // Prevent body scroll when mobile menu is open
    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [mobileMenuOpen])

    const handleLogout = () => {
        localStorage.removeItem('_auth')
        sessionStorage.removeItem('_auth')
        setShowUserMenu(false)
        setMobileMenuOpen(false)
        window.location.reload()
    }

    // Get user data (handle both function and object types)
    const getUserData = () => {
        if (typeof user === 'function') {
            return user()
        }
        return user || null
    }

    // Handle view changes with URL preservation
    const handleViewChange = (view: 'dashboard' | 'tests') => {
        if (view === 'tests') {
            const params = new URLSearchParams(location.search)
            const filter = params.get('filter')
            navigate(filter ? `/tests?filter=${filter}` : '/tests')
        } else {
            navigate('/dashboard')
        }
        onViewChange(view)
        setMobileMenuOpen(false)
    }

    const navItemClass = (active: boolean) =>
        `relative px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
            active
                ? 'bg-primary-50 text-primary-700 shadow-soft dark:bg-primary-500/15 dark:text-primary-300'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/[0.06]'
        }`

    return (
        <>
            <header className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-gray-950/70">
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between h-14 md:h-16">
                        {/* Logo and title */}
                        <div className="flex items-center space-x-2 md:space-x-4 min-w-0">
                            <div className="flex items-center space-x-3 min-w-0">
                                <a
                                    href="https://github.com/shvydak/yshvydak-test-dashboard"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group relative w-9 h-9 flex-shrink-0 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-glow transition-transform hover:scale-105 active:scale-95"
                                    title="View project on GitHub">
                                    <span className="text-white font-bold text-sm tracking-tight">
                                        YS
                                    </span>
                                </a>
                                <div className="min-w-0">
                                    <h1 className="text-base md:text-lg font-bold tracking-tight text-gray-900 dark:text-white truncate">
                                        <a
                                            href="https://github.com/shvydak/yshvydak-test-dashboard"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                            title="View project on GitHub">
                                            Test Dashboard
                                        </a>
                                    </h1>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block -mt-0.5">
                                        by{' '}
                                        <a
                                            href="https://github.com/shvydak/yshvydak-test-dashboard"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                            title="View project on GitHub">
                                            Yurii Shvydak
                                        </a>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-1 rounded-2xl bg-gray-100/60 p-1 dark:bg-white/[0.04]">
                            <button
                                onClick={() => handleViewChange('dashboard')}
                                className={navItemClass(currentView === 'dashboard')}>
                                Dashboard
                            </button>
                            <button
                                onClick={() => handleViewChange('tests')}
                                className={navItemClass(currentView === 'tests')}>
                                Tests
                            </button>
                        </nav>

                        {/* Desktop: status + user menu */}
                        <div className="hidden md:flex items-center gap-3">
                            <div className="flex items-center gap-2 rounded-full bg-gray-100/70 px-3 py-1.5 dark:bg-white/[0.04]">
                                <span
                                    className={`relative flex h-2 w-2 ${
                                        wsConnected ? '' : 'opacity-70'
                                    }`}>
                                    {wsConnected && (
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
                                    )}
                                    <span
                                        className={`relative inline-flex h-2 w-2 rounded-full ${
                                            wsConnected ? 'bg-success-500' : 'bg-danger-500'
                                        }`}
                                    />
                                </span>
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:inline">
                                    {wsConnected ? 'Live' : 'Offline'}
                                </span>
                            </div>

                            {user && (
                                <div className="relative" data-user-menu>
                                    <button
                                        onClick={() => setShowUserMenu(!showUserMenu)}
                                        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
                                            <span className="text-xs font-semibold text-white">
                                                {getUserData()?.email?.[0]?.toUpperCase() || 'U'}
                                            </span>
                                        </div>
                                        <span className="hidden lg:inline max-w-[140px] truncate">
                                            {getUserData()?.email || 'User'}
                                        </span>
                                        <svg
                                            className={`w-4 h-4 text-gray-400 transition-transform ${
                                                showUserMenu ? 'rotate-180' : ''
                                            }`}
                                            fill="currentColor"
                                            viewBox="0 0 20 20">
                                            <path
                                                fillRule="evenodd"
                                                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </button>

                                    {showUserMenu && (
                                        <div className="absolute right-0 mt-2 w-56 origin-top-right animate-scale-in overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-pop dark:border-white/10 dark:bg-gray-800">
                                            <div className="border-b border-gray-200/70 px-4 py-3 dark:border-white/[0.06]">
                                                <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                    {getUserData()?.email || 'User'}
                                                </div>
                                                {getUserData()?.role && (
                                                    <div className="text-xs capitalize text-gray-400 dark:text-gray-500">
                                                        {getUserData()?.role}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-1.5">
                                                {onOpenSettings && (
                                                    <button
                                                        onClick={() => {
                                                            onOpenSettings()
                                                            setShowUserMenu(false)
                                                        }}
                                                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white">
                                                        <span className="text-base">⚙️</span>
                                                        Settings
                                                    </button>
                                                )}
                                                <button
                                                    onClick={handleLogout}
                                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger-600 transition-colors hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/10">
                                                    <span className="text-base">🔓</span>
                                                    Sign out
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Mobile: compact status + hamburger */}
                        <div className="flex md:hidden items-center gap-3">
                            <span
                                className={`relative flex h-2.5 w-2.5 ${
                                    wsConnected ? '' : 'opacity-70'
                                }`}>
                                {wsConnected && (
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
                                )}
                                <span
                                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                                        wsConnected ? 'bg-success-500' : 'bg-danger-500'
                                    }`}
                                />
                            </span>

                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                                aria-label="Toggle menu">
                                {mobileMenuOpen ? (
                                    <svg
                                        className="w-6 h-6"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                ) : (
                                    <svg
                                        className="w-6 h-6"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 6h16M4 12h16M4 18h16"
                                        />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile menu overlay */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                    <div
                        className="fixed inset-0 bg-gray-950/40 backdrop-blur-sm animate-fade-in"
                        onClick={() => setMobileMenuOpen(false)}
                    />

                    <div className="fixed top-14 right-0 bottom-0 w-72 animate-slide-in-right overflow-y-auto border-l border-gray-200/70 bg-white shadow-pop dark:border-white/[0.06] dark:bg-gray-900">
                        <div className="p-4 space-y-1">
                            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                Navigation
                            </p>
                            <button
                                onClick={() => handleViewChange('dashboard')}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                                    currentView === 'dashboard'
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]'
                                }`}>
                                <span className="text-base">📊</span> Dashboard
                            </button>
                            <button
                                onClick={() => handleViewChange('tests')}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                                    currentView === 'tests'
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]'
                                }`}>
                                <span className="text-base">🧪</span> Tests
                            </button>

                            <div className="my-3 border-t border-gray-200/70 dark:border-white/[0.06]" />

                            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                Status
                            </p>
                            <div className="flex items-center justify-between px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                                <span>Theme</span>
                                <span>{isDark ? '🌙 Dark' : '☀️ Light'} mode</span>
                            </div>
                            <div className="flex items-center justify-between px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                                <span>Connection</span>
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`h-2 w-2 rounded-full ${
                                            wsConnected
                                                ? 'bg-success-500 animate-pulse'
                                                : 'bg-danger-500'
                                        }`}
                                    />
                                    <span>{wsConnected ? 'Live Updates' : 'Disconnected'}</span>
                                </div>
                            </div>

                            <div className="my-3 border-t border-gray-200/70 dark:border-white/[0.06]" />

                            {user && (
                                <>
                                    <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                        Account
                                    </p>
                                    <div className="flex items-center gap-3 px-3 py-2">
                                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600">
                                            <span className="text-sm font-semibold text-white">
                                                {getUserData()?.email?.[0]?.toUpperCase() || 'U'}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                                {getUserData()?.email || 'User'}
                                            </p>
                                            {getUserData()?.role && (
                                                <p className="text-xs capitalize text-gray-400 dark:text-gray-500">
                                                    {getUserData()?.role}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {onOpenSettings && (
                                        <button
                                            onClick={() => {
                                                onOpenSettings()
                                                setMobileMenuOpen(false)
                                            }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]">
                                            <span className="text-base">⚙️</span> Settings
                                        </button>
                                    )}
                                    <button
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-danger-600 transition-colors hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/10">
                                        <span className="text-base">🔓</span> Sign out
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
