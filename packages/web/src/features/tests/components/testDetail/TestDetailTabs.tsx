import {ClipboardList} from 'lucide-react'
import {TabKey} from '../../types/attachment.types'

export interface TestDetailTabsProps {
    activeTab: TabKey
    onTabChange: (tab: TabKey) => void
}

export function TestDetailTabs({activeTab, onTabChange}: TestDetailTabsProps) {
    const tabs = [
        {
            key: 'overview' as TabKey,
            label: 'Overview',
            icon: <ClipboardList className="h-4 w-4" />,
        },
    ]

    return (
        <div className="flex-1">
            <nav className="flex items-center gap-1 px-3 md:px-4 py-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => onTabChange(tab.key)}
                        className={`relative inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
                            activeTab === tab.key
                                ? 'bg-primary-50 text-primary-700 shadow-soft dark:bg-primary-500/15 dark:text-primary-300'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/[0.06]'
                        }`}>
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </nav>
        </div>
    )
}
