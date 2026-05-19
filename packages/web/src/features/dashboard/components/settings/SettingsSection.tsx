import {ReactNode} from 'react'

export interface SettingsSectionProps {
    title: string
    description?: string
    children: ReactNode
}

export function SettingsSection({title, description, children}: SettingsSectionProps) {
    return (
        <div className="rounded-2xl border border-gray-200/70 bg-gray-50/60 p-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="mb-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {title}
                </h3>
                {description && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
                )}
            </div>
            <div>{children}</div>
        </div>
    )
}
