import {ReactNode} from 'react'

export interface SettingsSectionProps {
    title: string
    description?: string
    children: ReactNode
}

export function SettingsSection({title, description, children}: SettingsSectionProps) {
    return (
        <div className="border-b border-gray-200 dark:border-gray-700 pb-6 last:border-b-0 last:pb-0">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                {description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</p>
                )}
            </div>
            <div>{children}</div>
        </div>
    )
}
