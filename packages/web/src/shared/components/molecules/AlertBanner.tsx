import {ReactNode} from 'react'
import {X} from 'lucide-react'

export type AlertBannerSeverity = 'warning' | 'danger' | 'neutral'

export interface AlertBannerAction {
    label: string
    onClick: () => void
}

export interface AlertBannerProps {
    severity: AlertBannerSeverity
    icon: ReactNode
    title: string
    message: string
    /** Extra content after the message (e.g. small status chips). */
    extra?: ReactNode
    primaryAction?: AlertBannerAction
    onDismiss?: () => void
}

const SEVERITY_STYLES: Record<
    AlertBannerSeverity,
    Record<
        'bannerClass' | 'iconClass' | 'titleClass' | 'textClass' | 'actionClass' | 'dismissClass',
        string
    >
> = {
    danger: {
        bannerClass:
            'bg-danger-50 border-danger-200 dark:bg-danger-500/10 dark:border-danger-400/20',
        iconClass: 'text-danger-600 dark:text-danger-400',
        titleClass: 'text-danger-800 dark:text-danger-200',
        textClass: 'text-danger-700 dark:text-danger-300',
        actionClass:
            'bg-danger-100 text-danger-700 hover:bg-danger-200 dark:bg-danger-500/20 dark:text-danger-300 dark:hover:bg-danger-500/30',
        dismissClass: 'text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-500/20',
    },
    warning: {
        bannerClass:
            'bg-warning-50 border-warning-200 dark:bg-warning-500/10 dark:border-warning-400/20',
        iconClass: 'text-warning-600 dark:text-warning-400',
        titleClass: 'text-warning-800 dark:text-warning-200',
        textClass: 'text-warning-700 dark:text-warning-300',
        actionClass:
            'bg-warning-100 text-warning-700 hover:bg-warning-200 dark:bg-warning-500/20 dark:text-warning-300 dark:hover:bg-warning-500/30',
        dismissClass: 'text-warning-500 hover:bg-warning-100 dark:hover:bg-warning-500/20',
    },
    neutral: {
        bannerClass: 'bg-gray-100 border-gray-200 dark:bg-white/[0.06] dark:border-white/10',
        iconClass: 'text-gray-500 dark:text-gray-400',
        titleClass: 'text-gray-800 dark:text-gray-100',
        textClass: 'text-gray-600 dark:text-gray-300',
        actionClass:
            'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20',
        dismissClass: 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-white/10',
    },
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
    extra,
    primaryAction,
    onDismiss,
}: AlertBannerProps) {
    const styles = SEVERITY_STYLES[severity]
    const {bannerClass, iconClass, titleClass, textClass, actionClass, dismissClass} = styles

    return (
        <div
            className={`shrink-0 border-b px-3 py-2.5 md:px-4 md:py-3 ${bannerClass}`}
            role="alert">
            <div className="container mx-auto flex items-center gap-3">
                <div className={`flex-shrink-0 ${iconClass}`}>{icon}</div>

                <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className={`text-sm font-semibold ${titleClass}`}>{title}</span>
                    <span className={`text-sm ${textClass}`}>{message}</span>
                    {extra}
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
