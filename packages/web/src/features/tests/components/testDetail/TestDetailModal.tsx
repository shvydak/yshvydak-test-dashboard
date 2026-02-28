import {useState, useMemo, useCallback} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {TestResult} from '@yshvydak/core'
import {TabKey} from '../../types/attachment.types'
import {useTestAttachments} from '../../hooks/useTestAttachments'
import {useTestExecutionHistory} from '../../hooks/useTestExecutionHistory'
import {useTestsStore} from '../../store/testsStore'
import {useWebSocket} from '../../../../hooks/useWebSocket'
import {getWebSocketUrl} from '@features/authentication/utils'
import {noteService} from '../../../../services/note.service'
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
    const [showDeleteExecutionConfirmation, setShowDeleteExecutionConfirmation] = useState(false)
    const [executionToDelete, setExecutionToDelete] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isDeletingExecution, setIsDeletingExecution] = useState(false)
    const [showMobileSidebar, setShowMobileSidebar] = useState(false)

    const queryClient = useQueryClient()
    const selectedExecutionId = useTestsStore((state) => state.selectedExecutionId)
    const selectExecution = useTestsStore((state) => state.selectExecution)
    const rerunTest = useTestsStore((state) => state.rerunTest)
    const deleteTest = useTestsStore((state) => state.deleteTest)
    const deleteExecution = useTestsStore((state) => state.deleteExecution)
    const runningTests = useTestsStore((state) => state.runningTests)
    const getIsAnyTestRunning = useTestsStore((state) => state.getIsAnyTestRunning)
    const activeProgress = useTestsStore((state) => state.activeProgress)

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
        setShowMobileSidebar(false)
        onClose()
    }

    const handleSelectExecution = (executionId: string) => {
        selectExecution(executionId)
        setShowMobileSidebar(false)
    }

    const handleDeleteClick = () => {
        setShowDeleteConfirmation(true)
    }

    const handleDeleteConfirm = async () => {
        if (!test?.testId) return

        try {
            setIsDeleting(true)
            await deleteTest(test.testId)

            // Invalidate storage stats cache to reflect updated storage after deletion
            queryClient.invalidateQueries({queryKey: ['storage-stats']})

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

    const handleDeleteExecutionClick = (executionId: string) => {
        setExecutionToDelete(executionId)
        setShowDeleteExecutionConfirmation(true)
    }

    const handleDeleteExecutionConfirm = async () => {
        if (!executionToDelete || !test?.testId) return

        try {
            setIsDeletingExecution(true)

            // If we deleted the currently selected execution, find the next one to select
            if (selectedExecutionId === executionToDelete && executions.length > 1) {
                // Find the next execution to select (the one after the deleted one)
                const deletedIndex = executions.findIndex((e) => e.id === executionToDelete)
                const nextExecution = executions[deletedIndex + 1] || executions[0]
                // Select the next execution before deleting
                if (nextExecution && nextExecution.id !== executionToDelete) {
                    selectExecution(nextExecution.id)
                }
            }

            await deleteExecution(test.testId, executionToDelete)

            // Refetch history to update the list
            refetchHistory()

            // Invalidate storage stats cache to reflect updated storage after deletion
            queryClient.invalidateQueries({queryKey: ['storage-stats']})
        } catch (error) {
            console.error('Failed to delete execution:', error)
        } finally {
            setIsDeletingExecution(false)
            setShowDeleteExecutionConfirmation(false)
            setExecutionToDelete(null)
        }
    }

    const handleDeleteExecutionCancel = () => {
        setShowDeleteExecutionConfirmation(false)
        setExecutionToDelete(null)
    }

    const handleSaveNote = async (note: string) => {
        if (!test?.testId) return

        await noteService.saveNote(test.testId, note)

        // Invalidate tests cache to refetch with updated note
        queryClient.invalidateQueries({queryKey: ['tests']})
        refetchHistory()
    }

    const handleDeleteNote = async () => {
        if (!test?.testId) return

        await noteService.deleteNote(test.testId)

        // Invalidate tests cache to refetch with updated note
        queryClient.invalidateQueries({queryKey: ['tests']})
        refetchHistory()
    }

    if (!isOpen || !test) return null

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-0 md:p-4">
                <ModalBackdrop onClick={handleClose} blur="sm" />

                <div className="relative bg-white dark:bg-gray-800 md:rounded-lg shadow-xl max-w-7xl w-full h-screen md:h-[90vh] flex flex-col overflow-hidden">
                    <TestDetailHeader
                        testName={test.name}
                        testStatus={currentExecution?.status || test.status}
                        executionDate={currentExecution?.createdAt}
                        isLatest={!selectedExecutionId}
                        onClose={handleClose}
                        onBackToLatest={() => selectExecution(null)}
                        onDelete={handleDeleteClick}
                        onRerun={() => handleRerun(currentExecution?.id || test.id)}
                        isRunning={
                            runningTests.has(currentExecution?.id || test.id) ||
                            !!activeProgress?.runningTests.find((t) => t.testId === test.testId)
                        }
                        isAnyTestRunning={getIsAnyTestRunning()}
                    />

                    {/* Tabs + mobile history toggle */}
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                        <TestDetailTabs activeTab={activeTab} onTabChange={setActiveTab} />

                        {/* Mobile history toggle button */}
                        <button
                            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
                            className="md:hidden flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span>History</span>
                            <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-full px-1.5 py-0.5">
                                {executions.length}
                            </span>
                        </button>
                    </div>

                    {/* Main Content with Sidebar Layout */}
                    <div className="flex flex-1 overflow-hidden relative">
                        {/* Tab Content Area */}
                        <div className="flex-1 p-3 md:p-6 overflow-y-auto">
                            {activeTab === 'overview' && (
                                <TestOverviewTab
                                    test={currentExecution!}
                                    attachments={attachments}
                                    attachmentsLoading={loading}
                                    attachmentsError={error}
                                    onAttachmentsError={setError}
                                    onSaveNote={handleSaveNote}
                                    onDeleteNote={handleDeleteNote}
                                />
                            )}

                            {activeTab === 'steps' && <TestStepsTab test={currentExecution!} />}
                        </div>

                        {/* Desktop History Sidebar */}
                        <div className="hidden md:block">
                            <ExecutionSidebar
                                executions={executions}
                                currentExecutionId={currentExecution?.id || test.id}
                                onSelectExecution={handleSelectExecution}
                                onDeleteExecution={handleDeleteExecutionClick}
                                testId={currentExecution?.id || test.id}
                                onRerun={handleRerun}
                                loading={historyLoading}
                                error={historyError || undefined}
                            />
                        </div>

                        {/* Mobile History Sidebar (slide-in overlay) */}
                        {showMobileSidebar && (
                            <div className="md:hidden absolute inset-0 z-20 flex">
                                <div
                                    className="flex-1 bg-black/30"
                                    onClick={() => setShowMobileSidebar(false)}
                                />
                                <div className="w-80 max-w-[85vw]">
                                    <ExecutionSidebar
                                        executions={executions}
                                        currentExecutionId={currentExecution?.id || test.id}
                                        onSelectExecution={handleSelectExecution}
                                        onDeleteExecution={handleDeleteExecutionClick}
                                        testId={currentExecution?.id || test.id}
                                        onRerun={handleRerun}
                                        loading={historyLoading}
                                        error={historyError || undefined}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Delete Test Confirmation Dialog */}
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

                {/* Delete Execution Confirmation Dialog */}
                <ConfirmationDialog
                    isOpen={showDeleteExecutionConfirmation}
                    title="Delete Execution"
                    description={`Are you sure you want to delete this test execution? This will permanently delete this execution record and all its attachments (screenshots, videos, traces). This action cannot be undone.`}
                    confirmText="Delete"
                    cancelText="Cancel"
                    variant="danger"
                    isLoading={isDeletingExecution}
                    onConfirm={handleDeleteExecutionConfirm}
                    onCancel={handleDeleteExecutionCancel}
                />
            </div>
        </div>
    )
}
