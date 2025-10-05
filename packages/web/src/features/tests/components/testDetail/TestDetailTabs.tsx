import {TabKey} from '../../types/attachment.types'

export interface TestDetailTabsProps {
    activeTab: TabKey
    onTabChange: (tab: TabKey) => void
    attachmentsCount: number
    executionCount: number
}

export function TestDetailTabs({
    activeTab,
    onTabChange,
    attachmentsCount,
    executionCount,
}: TestDetailTabsProps) {
    const tabs = [
        {
            key: 'overview' as TabKey,
            label: 'Overview',
            icon: '📋',
        },
        {
            key: 'attachments' as TabKey,
            label: `Attachments (${attachmentsCount})`,
            icon: '📎',
        },
        {
            key: 'steps' as TabKey,
            label: 'Test Steps',
            icon: '🔄',
        },
        {
            key: 'history' as TabKey,
            label: `History (${executionCount})`,
            icon: '🕐',
        },
    ]

    return (
        <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8 px-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => onTabChange(tab.key)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === tab.key
                                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}>
                        <span className="mr-2">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </nav>
        </div>
    )
}
