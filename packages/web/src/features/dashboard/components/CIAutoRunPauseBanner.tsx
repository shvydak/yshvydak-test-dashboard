import {useEffect, useState} from 'react'
import {PauseCircle} from 'lucide-react'

interface CIAutoRunPauseBannerProps {
    resumeAt: string | null
    onResume: () => void
}

function formatCountdown(resumeAt: string): string {
    const ms = new Date(resumeAt).getTime() - Date.now()
    if (ms <= 0) return ''
    const totalMinutes = Math.floor(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
}

export function CIAutoRunPauseBanner({resumeAt, onResume}: CIAutoRunPauseBannerProps) {
    const [countdown, setCountdown] = useState(() => (resumeAt ? formatCountdown(resumeAt) : ''))

    useEffect(() => {
        if (!resumeAt) return
        const interval = setInterval(() => {
            const remaining = formatCountdown(resumeAt)
            if (!remaining) {
                onResume()
                return
            }
            setCountdown(remaining)
        }, 60000)
        return () => clearInterval(interval)
    }, [resumeAt, onResume])

    return (
        <div className="border-b border-warning-200/70 bg-warning-50 dark:border-warning-400/20 dark:bg-warning-500/10">
            <div className="container mx-auto px-3 md:px-4 py-2">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <PauseCircle className="h-4 w-4 flex-shrink-0 text-warning-600 dark:text-warning-400" />
                        <p className="text-sm font-medium text-warning-800 dark:text-warning-200 truncate">
                            CI auto-run paused
                            {resumeAt && countdown ? (
                                <span className="font-normal text-warning-700 dark:text-warning-300">
                                    {' · '}Resumes in {countdown}
                                </span>
                            ) : (
                                <span className="font-normal text-warning-700 dark:text-warning-300">
                                    {' · '}No auto-resume scheduled
                                </span>
                            )}
                        </p>
                    </div>
                    <button
                        onClick={onResume}
                        className="flex-shrink-0 rounded-lg border border-warning-300 bg-warning-100 px-3 py-1 text-xs font-semibold text-warning-800 transition-colors hover:bg-warning-200 dark:border-warning-400/30 dark:bg-warning-500/20 dark:text-warning-200 dark:hover:bg-warning-500/30">
                        Resume now
                    </button>
                </div>
            </div>
        </div>
    )
}
