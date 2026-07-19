import {ReactNode} from 'react'
import {X} from 'lucide-react'

export type AlertBannerSeverity = 'warning' | 'danger'

export interface AlertBannerAction {
    label: string
    onClick: () => void
}

export interface AlertBannerProps {
    severity: AlertBannerSeverity
    icon: ReactNode
    title: string
    message: string
    primaryAction?: AlertBannerAction
    onDismiss?: () => void
}

/**
 * Generic full-width banner for page-level notices (disk space, CI pipeline
 * outcomes, etc.) — icon + title + message + one optional action + dismiss.
 * Individual call sites own their copy and icon; this owns the chrome.
 */
export function AlertBanner({
    severity,
    icon,
    title,
    message,
    primaryAction,
    onDismiss,
}: AlertBannerProps) {
    const isDanger = severity === 'danger'

    const bannerClass = isDanger
        ? 'bg-danger-50 border-danger-200 dark:bg-danger-500/10 dark:border-danger-400/20'
        : 'bg-warning-50 border-warning-200 dark:bg-warning-500/10 dark:border-warning-400/20'

    const iconClass = isDanger
        ? 'text-danger-600 dark:text-danger-400'
        : 'text-warning-600 dark:text-warning-400'

    const titleClass = isDanger
        ? 'text-danger-800 dark:text-danger-200'
        : 'text-warning-800 dark:text-warning-200'

    const textClass = isDanger
        ? 'text-danger-700 dark:text-danger-300'
        : 'text-warning-700 dark:text-warning-300'

    const actionClass = isDanger
        ? 'bg-danger-100 text-danger-700 hover:bg-danger-200 dark:bg-danger-500/20 dark:text-danger-300 dark:hover:bg-danger-500/30'
        : 'bg-warning-100 text-warning-700 hover:bg-warning-200 dark:bg-warning-500/20 dark:text-warning-300 dark:hover:bg-warning-500/30'

    const dismissClass = isDanger
        ? 'text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-500/20'
        : 'text-warning-500 hover:bg-warning-100 dark:hover:bg-warning-500/20'

    return (
        <div
            className={`shrink-0 border-b px-3 py-2.5 md:px-4 md:py-3 ${bannerClass}`}
            role="alert">
            <div className="container mx-auto flex items-center gap-3">
                <div className={`flex-shrink-0 ${iconClass}`}>{icon}</div>

                <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className={`text-sm font-semibold ${titleClass}`}>{title}</span>
                    <span className={`text-sm ${textClass}`}>{message}</span>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                    {primaryAction && (
                        <button
                            onClick={primaryAction.onClick}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${actionClass}`}>
                            {primaryAction.label}
                        </button>
                    )}
                    {onDismiss && (
                        <button
                            onClick={onDismiss}
                            className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${dismissClass}`}
                            aria-label="Dismiss">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
