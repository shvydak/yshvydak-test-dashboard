import {useState, useMemo, useCallback, useEffect, useRef} from 'react'
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
    const [swipeOffset, setSwipeOffset] = useState(0)

    const swipeStartY = useRef<number | null>(null)
    const headerRef = useRef<HTMLDivElement>(null)

    const queryClient = useQueryClient()
    const selectedExecutionId = useTestsStore((state) => state.selectedExecutionId)
    const selectExecution = useTestsStore((state) => state.selectExecution)
    const rerunTest = useTestsStore((state) => state.rerunTest)
    const deleteTest = useTestsStore((state) => state.deleteTest)
    const deleteExecution = useTestsStore((state) => state.deleteExecution)
    const runningTests = useTestsStore((state) => state.runningTests)
    const getIsAnyTestRunning = useTestsStore((state) => state.getIsAnyTestRunning)
    const activeProgress = useTestsStore((state) => state.activeProgress)

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            const scrollY = window.scrollY
            document.body.style.position = 'fixed'
            document.body.style.top = `-${scrollY}px`
            document.body.style.left = '0'
            document.body.style.right = '0'
            document.body.style.overflow = 'hidden'

            return () => {
                document.body.style.position = ''
                document.body.style.top = ''
                document.body.style.left = ''
                document.body.style.right = ''
                document.body.style.overflow = ''
                window.scrollTo(0, scrollY)
            }
        }
    }, [isOpen])

    // Swipe-down-to-close on header (mobile only)
    useEffect(() => {
        const header = headerRef.current
        if (!header || !isOpen) return

        const handleTouchStart = (e: TouchEvent) => {
            swipeStartY.current = e.touches[0].clientY
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (swipeStartY.current === null) return
            const deltaY = e.touches[0].clientY - swipeStartY.current
            if (deltaY > 0) {
                setSwipeOffset(Math.min(deltaY, 150))
                e.preventDefault()
            }
        }

        const handleTouchEnd = () => {
            if (swipeOffset > 80) {
                handleClose()
            }
            setSwipeOffset(0)
            swipeStartY.current = null
        }

        header.addEventListener('touchstart', handleTouchStart, {passive: true})
        header.addEventListener('touchmove', handleTouchMove, {passive: false})
        header.addEventListener('touchend', handleTouchEnd, {passive: true})

        return () => {
            header.removeEventListener('touchstart', handleTouchStart)
            header.removeEventListener('touchmove', handleTouchMove)
            header.removeEventListener('touchend', handleTouchEnd)
        }
    }, [isOpen, swipeOffset])

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

    const swipeOpacity = swipeOffset > 0 ? Math.max(0.3, 1 - swipeOffset / 200) : 1

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="flex min-h-screen items-center justify-center p-0 md:p-4">
                <ModalBackdrop onClick={handleClose} blur="sm" />

                <div
                    className="relative bg-white dark:bg-gray-800 md:rounded-lg shadow-xl max-w-7xl w-full h-screen md:h-[90vh] flex flex-col overflow-hidden"
                    style={
                        swipeOffset > 0
                            ? {
                                  transform: `translateY(${swipeOffset}px)`,
                                  opacity: swipeOpacity,
                                  transition: 'none',
                              }
                            : {transition: 'transform 0.2s ease-out, opacity 0.2s ease-out'}
                    }>
                    {/* Swipe indicator - visible on mobile when dragging */}
                    {swipeOffset > 0 && (
                        <div className="md:hidden absolute top-0 left-0 right-0 flex justify-center py-1 z-10">
                            <div className="w-10 h-1 bg-gray-400 dark:bg-gray-500 rounded-full" />
                        </div>
                    )}

                    {/* Mobile swipe handle area */}
                    <div
                        ref={headerRef}
                        className="md:cursor-default cursor-grab active:cursor-grabbing">
                        {/* Swipe pill hint (mobile only, always visible) */}
                        <div className="md:hidden flex justify-center pt-2 pb-0">
                            <div className="w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
                        </div>

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
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200 dark:border-gray-700">
                        <TestDetailTabs activeTab={activeTab} onTabChange={setActiveTab} />
                    </div>

                    {/* Main Content with Sidebar Layout */}
                    <div className="flex flex-1 overflow-hidden relative">
                        {/* Tab Content Area */}
                        <div className="flex-1 p-3 md:p-6 overflow-y-auto overscroll-contain">
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
