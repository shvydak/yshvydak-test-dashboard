import {useState} from 'react'
import {TestResult} from '@yshvydak/core'
import {TabKey} from '../../types/attachment.types'
import {useTestAttachments} from '../../hooks/useTestAttachments'
import {TestDetailHeader} from './TestDetailHeader'
import {TestDetailTabs} from './TestDetailTabs'
import {TestOverviewTab} from './TestOverviewTab'
import {TestAttachmentsTab} from './TestAttachmentsTab'
import {TestStepsTab} from './TestStepsTab'

export interface TestDetailModalProps {
    test: TestResult | null
    isOpen: boolean
    onClose: () => void
}

export function TestDetailModal({test, isOpen, onClose}: TestDetailModalProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('overview')
    const {attachments, loading, error, setError} = useTestAttachments(test?.id || null, isOpen)

    if (!isOpen || !test) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden">
                <TestDetailHeader testName={test.name} testStatus={test.status} onClose={onClose} />

                <TestDetailTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    attachmentsCount={attachments.length}
                />

                <div className="p-6 overflow-y-auto flex-grow">
                    {activeTab === 'overview' && (
                        <TestOverviewTab
                            test={test}
                            attachmentsCount={attachments.length}
                            loading={loading}
                        />
                    )}

                    {activeTab === 'attachments' && (
                        <TestAttachmentsTab
                            attachments={attachments}
                            loading={loading}
                            error={error}
                            onError={setError}
                        />
                    )}

                    {activeTab === 'steps' && <TestStepsTab test={test} />}
                </div>
            </div>
        </div>
    )
}
