import {useState} from 'react'
import {TestResult} from '@yshvydak/core'
import {TabKey} from '../../types/attachment.types'
import {useTestAttachments} from '../../hooks/useTestAttachments'
import {useTestExecutionHistory} from '../../hooks/useTestExecutionHistory'
import {useTestsStore} from '../../store/testsStore'
import {TestDetailHeader} from './TestDetailHeader'
import {TestDetailTabs} from './TestDetailTabs'
import {TestOverviewTab} from './TestOverviewTab'
import {TestAttachmentsTab} from './TestAttachmentsTab'
import {TestStepsTab} from './TestStepsTab'
import {TestHistoryTab} from '../history/TestHistoryTab'

export interface TestDetailModalProps {
    test: TestResult | null
    isOpen: boolean
    onClose: () => void
}

export function TestDetailModal({test, isOpen, onClose}: TestDetailModalProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('overview')

    const selectedExecutionId = useTestsStore((state) => state.selectedExecutionId)
    const selectExecution = useTestsStore((state) => state.selectExecution)

    const {executions} = useTestExecutionHistory(test?.testId || '')

    const currentExecution = selectedExecutionId
        ? executions.find((e) => e.id === selectedExecutionId) || test
        : test

    const {attachments, loading, error, setError} = useTestAttachments(
        currentExecution?.id || null,
        isOpen
    )

    const handleClose = () => {
        selectExecution(null)
        setActiveTab('overview')
        onClose()
    }

    const handleSelectExecution = (executionId: string) => {
        selectExecution(executionId)
        setActiveTab('overview')
    }

    if (!isOpen || !test) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden">
                <TestDetailHeader
                    testName={test.name}
                    testStatus={currentExecution?.status || test.status}
                    executionDate={currentExecution?.createdAt}
                    isLatest={!selectedExecutionId}
                    onClose={handleClose}
                    onBackToLatest={() => selectExecution(null)}
                />

                <TestDetailTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    attachmentsCount={attachments.length}
                    executionCount={executions.length}
                />

                <div className="p-6 overflow-y-auto flex-grow">
                    {activeTab === 'overview' && (
                        <TestOverviewTab
                            test={currentExecution!}
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

                    {activeTab === 'steps' && <TestStepsTab test={currentExecution!} />}

                    {activeTab === 'history' && (
                        <TestHistoryTab
                            testId={test.testId}
                            currentExecutionId={currentExecution?.id || test.id}
                            onSelectExecution={handleSelectExecution}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
