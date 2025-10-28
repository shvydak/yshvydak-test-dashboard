import {useState, useMemo, useCallback} from 'react'
import {TestResult} from '@yshvydak/core'
import {TabKey} from '../../types/attachment.types'
import {useTestAttachments} from '../../hooks/useTestAttachments'
import {useTestExecutionHistory} from '../../hooks/useTestExecutionHistory'
import {useTestsStore} from '../../store/testsStore'
import {useWebSocket} from '../../../../hooks/useWebSocket'
import {getWebSocketUrl} from '@features/authentication/utils'
import {ModalBackdrop, ConfirmationDialog} from '@shared/components/molecules'
import {TestDetailHeader} from './TestDetailHeader'
import {TestDetailTabs} from './TestDetailTabs'
import {TestOverviewTab} from './TestOverviewTab'
import {TestStepsTab} from './TestStepsTab'
import {ExecutionSidebar} from '../history/ExecutionSidebar'

export interface TestDetailModalProps {
    test: TestResult | null
    isOpen: boolean
    onClose: () => void
}

export function TestDetailModal({test, isOpen, onClose}: TestDetailModalProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('overview')
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const selectedExecutionId = useTestsStore((state) => state.selectedExecutionId)
    const selectExecution = useTestsStore((state) => state.selectExecution)
    const rerunTest = useTestsStore((state) => state.rerunTest)
    const deleteTest = useTestsStore((state) => state.deleteTest)

    const {
        executions,
        loading: historyLoading,
        error: historyError,
        refetch: refetchHistory,
    } = useTestExecutionHistory(test?.testId || '')

    // When selectedExecutionId is null, show the latest execution (first in array)
    // Otherwise, find the selected execution
    const currentExecution = selectedExecutionId
        ? executions.find((e) => e.id === selectedExecutionId) || test
        : executions.length > 0
          ? executions[0]
          : test

    const {attachments, loading, error, setError} = useTestAttachments(
        currentExecution?.id || null,
        isOpen
    )

    const webSocketUrl = useMemo(() => {
        if (!isOpen) return null
        return getWebSocketUrl()
    }, [isOpen])

    const handleRunCompleted = useCallback(
        (data: any) => {
            if (
                data.isRerun &&
                (data.testId === test?.testId || data.originalTestId === currentExecution?.id)
            ) {
                refetchHistory()
                selectExecution(null)
            }
        },
        [test?.testId, currentExecution?.id, refetchHistory, selectExecution]
    )

    useWebSocket(webSocketUrl, {
        onRunCompleted: handleRunCompleted,
    })

    const handleRerun = async (testId: string) => {
        await rerunTest(testId)
    }

    const handleClose = () => {
        selectExecution(null)
        setActiveTab('overview')
        onClose()
    }

    const handleSelectExecution = (executionId: string) => {
        selectExecution(executionId)
    }

    const handleDeleteClick = () => {
        setShowDeleteConfirmation(true)
    }

    const handleDeleteConfirm = async () => {
        if (!test?.testId) return

        try {
            setIsDeleting(true)
            await deleteTest(test.testId)
            handleClose()
        } catch (error) {
            console.error('Failed to delete test:', error)
        } finally {
            setIsDeleting(false)
            setShowDeleteConfirmation(false)
        }
    }

    const handleDeleteCancel = () => {
        setShowDeleteConfirmation(false)
    }

    if (!isOpen || !test) return null

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-4">
                <ModalBackdrop onClick={handleClose} blur="sm" />

                <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full h-[90vh] flex flex-col overflow-hidden">
                    <TestDetailHeader
                        testName={test.name}
                        testStatus={currentExecution?.status || test.status}
                        executionDate={currentExecution?.createdAt}
                        isLatest={!selectedExecutionId}
                        onClose={handleClose}
                        onBackToLatest={() => selectExecution(null)}
                        onDelete={handleDeleteClick}
                    />

                    <TestDetailTabs activeTab={activeTab} onTabChange={setActiveTab} />

                    {/* Main Content with Sidebar Layout */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Tab Content Area */}
                        <div className="flex-1 p-6 overflow-y-auto">
                            {activeTab === 'overview' && (
                                <TestOverviewTab
                                    test={currentExecution!}
                                    attachments={attachments}
                                    attachmentsLoading={loading}
                                    attachmentsError={error}
                                    onAttachmentsError={setError}
                                />
                            )}

                            {activeTab === 'steps' && <TestStepsTab test={currentExecution!} />}
                        </div>

                        {/* History Sidebar */}
                        <ExecutionSidebar
                            executions={executions}
                            currentExecutionId={currentExecution?.id || test.id}
                            onSelectExecution={handleSelectExecution}
                            testId={currentExecution?.id || test.id}
                            onRerun={handleRerun}
                            loading={historyLoading}
                            error={historyError || undefined}
                        />
                    </div>
                </div>

                {/* Delete Confirmation Dialog */}
                <ConfirmationDialog
                    isOpen={showDeleteConfirmation}
                    title="Delete Test"
                    description={`Are you sure you want to delete "${test.name}"? This will permanently delete all execution history and attachments for this test. This action cannot be undone.`}
                    confirmText="Delete"
                    cancelText="Cancel"
                    variant="danger"
                    isLoading={isDeleting}
                    onConfirm={handleDeleteConfirm}
                    onCancel={handleDeleteCancel}
                />
            </div>
        </div>
    )
}
