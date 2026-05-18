import {config} from '@config/environment.config'
import {PasswordInput} from '@/shared/components/molecules'
import {applyThemeMode, type ThemeMode} from '@/hooks/useTheme'
import {useState, useEffect, type ChangeEvent, type FormEvent} from 'react'

interface LoginFormData {
    email: string
    password: string
}

export default function LoginPage() {
    const [formData, setFormData] = useState<LoginFormData>({
        email: '',
        password: '',
    })
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as ThemeMode | null
        const themeMode = savedTheme || 'auto'

        applyThemeMode(themeMode)

        if (themeMode === 'auto') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
            const handleChange = () => applyThemeMode('auto')
            mediaQuery.addEventListener('change', handleChange)
            return () => mediaQuery.removeEventListener('change', handleChange)
        }
    }, [])

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const {name, value} = e.target
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }))
        if (error) setError(null)
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch(`${config.api.baseUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            })

            const data = await response.json()

            if (response.ok && data.success) {
                // Calculate token expiration timestamp
                // Parse expiresIn (e.g., "30d", "24h", "60m") to milliseconds
                const expiresIn = data.data.expiresIn || '30d'
                let expirationMs = 0

                if (expiresIn.endsWith('d')) {
                    expirationMs = parseInt(expiresIn) * 24 * 60 * 60 * 1000
                } else if (expiresIn.endsWith('h')) {
                    expirationMs = parseInt(expiresIn) * 60 * 60 * 1000
                } else if (expiresIn.endsWith('m')) {
                    expirationMs = parseInt(expiresIn) * 60 * 1000
                } else if (expiresIn.endsWith('s')) {
                    expirationMs = parseInt(expiresIn) * 1000
                }

                const expiresAt = Date.now() + expirationMs

                // Store token in localStorage with expiration timestamp
                localStorage.setItem(
                    '_auth',
                    JSON.stringify({
                        auth: {
                            token: data.data.token,
                            type: 'Bearer',
                        },
                        user: data.data.user,
                        expiresAt, // Store expiration timestamp
                        expiresIn: data.data.expiresIn, // Store original expiration string
                    })
                )

                // Simple navigation to dashboard
                window.location.href = '/'
            } else {
                setError(data.message || 'Login failed. Please check your credentials.')
            }
        } catch {
            setError('Network error. Please check your connection and try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="relative min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md animate-slide-up">
                <div className="mb-8 text-center">
                    <div className="flex justify-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-glow">
                            <svg
                                className="w-8 h-8 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                    </div>
                    <h2 className="mt-6 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        YShvydak Test Dashboard
                    </h2>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Sign in to access your test dashboard
                    </p>
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-white p-8 shadow-card dark:border-white/[0.07] dark:bg-gray-800/70 dark:backdrop-blur-xl">
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div>
                                <label
                                    htmlFor="email"
                                    className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Email address
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-all duration-150 focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder-gray-500"
                                    placeholder="Enter your email address"
                                    disabled={isLoading}
                                />
                            </div>

                            <PasswordInput
                                id="password"
                                name="password"
                                label="Password"
                                autoComplete="current-password"
                                required
                                value={formData.password}
                                onChange={handleInputChange}
                                placeholder="Enter your password"
                                disabled={isLoading}
                                fullWidth
                            />
                        </div>

                        {error && (
                            <div className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50 p-4 dark:border-danger-500/30 dark:bg-danger-500/10">
                                <svg
                                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger-500"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    aria-hidden="true">
                                    <path
                                        fillRule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                <p className="text-sm text-danger-700 dark:text-danger-300">
                                    {error}
                                </p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all duration-150 hover:bg-primary-500 hover:shadow-glow active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-60 dark:bg-primary-500 dark:hover:bg-primary-400 dark:focus-visible:ring-offset-gray-900">
                            {isLoading ? (
                                <>
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    Signing in…
                                </>
                            ) : (
                                'Sign in'
                            )}
                        </button>

                        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                            Contact your administrator for login credentials
                        </p>
                    </form>
                </div>
            </div>
        </div>
    )
}
