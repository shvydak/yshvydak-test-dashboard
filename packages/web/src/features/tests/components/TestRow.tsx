import React, {useState, useEffect} from 'react'
import {Play, MessageSquare} from 'lucide-react'
import {TestResult} from '@yshvydak/core'
import {StatusBadge, ActionButton, LoadingSpinner, Badge} from '@shared/components'
import {formatDuration, formatLastRun} from '../utils'
import {useTestsStore} from '../store/testsStore'
import {LinkifiedText} from '@/components/atoms/LinkifiedText'
import {truncateText} from '@/utils/linkify.util'
import {useNoteImages} from '../hooks/useNoteImages'
import {parseNoteContent} from '@/utils/noteContent.util'
import {createProtectedFileURL} from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'
import {NoteImage} from '@yshvydak/core'

export interface TestRowProps {
    test: TestResult
    selected: boolean
    onSelect: (test: TestResult) => void
    onRerun: (testId: string) => void
}

export function TestRow({test, selected, onSelect, onRerun}: TestRowProps) {
    const {runningTests, getIsAnyTestRunning, activeProgress} = useTestsStore()
    const isAnyTestRunning = getIsAnyTestRunning()

    // Load note images for this test
    const {images: noteImages} = useNoteImages(
        test.note?.content ? test.testId : null,
        !!test.note?.content
    )

    // Find if this test is currently running in the active progress
    const runningInfo = activeProgress?.runningTests.find((t) => t.testId === test.testId)

    // Check if test is running from either source:
    // 1. runningTests Set (for single test reruns)
    // 2. activeProgress.runningTests (for group/all runs)
    const isRunning = runningTests.has(test.id) || !!runningInfo

    // Parse note content to extract images
    const noteParts = test.note?.content ? parseNoteContent(test.note.content, noteImages) : []

    return (
        <tr
            className={`cursor-pointer border-b border-gray-100 transition-colors duration-150 dark:border-white/[0.04] ${
                isRunning
                    ? 'bg-primary-50/60 ring-1 ring-inset ring-primary-400/40 animate-pulse dark:bg-primary-500/10'
                    : selected
                      ? 'bg-primary-50 shadow-[inset_3px_0_0_0_theme(colors.primary.500)] dark:bg-primary-500/10'
                      : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
            }`}
            onClick={() => onSelect(test)}>
            <td className="py-3.5 px-3 md:px-6 w-24 md:w-32">
                {isRunning ? (
                    <Badge variant="info" size="md">
                        <LoadingSpinner size="sm" className="mr-1" />
                        <span className="hidden sm:inline">Running...</span>
                        <span className="sm:hidden">Run</span>
                    </Badge>
                ) : (
                    <StatusBadge status={test.status as any} />
                )}
            </td>
            <td className="py-3.5 px-3 md:px-6">
                <div className="font-medium tracking-tight text-gray-900 dark:text-white text-sm md:text-base">
                    {test.name}
                </div>
                {/* On mobile, show duration inline under name */}
                <div className="sm:hidden text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono tabular-nums">
                    {formatDuration(test.duration)}
                </div>
                {!runningInfo && test.errorMessage && (
                    <div className="text-xs font-mono text-danger-600 dark:text-danger-400 mt-1.5 truncate max-w-[200px] md:max-w-xs">
                        {test.errorMessage}
                    </div>
                )}
                {!runningInfo && test.note?.content && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 max-w-[200px] md:max-w-xs flex items-center gap-1 flex-wrap">
                        <MessageSquare className="h-3 w-3 flex-shrink-0" />
                        {noteParts.map((part, index) => {
                            if (part.type === 'image' && part.image) {
                                return (
                                    <NoteImageMiniThumbnail
                                        key={`img-${part.imageId}-${index}`}
                                        image={part.image}
                                    />
                                )
                            }
                            // Show all text parts, but truncate each one
                            if (part.type === 'text' && part.content.trim()) {
                                return (
                                    <LinkifiedText
                                        key={`text-${index}`}
                                        text={truncateText(part.content, 50)}
                                        className="truncate"
                                    />
                                )
                            }
                            return null
                        })}
                    </div>
                )}
            </td>
            <td className="py-3.5 px-6 text-sm font-mono tabular-nums text-gray-500 dark:text-gray-400 w-24 hidden sm:table-cell">
                {formatDuration(test.duration)}
            </td>
            <td className="py-3.5 px-6 text-sm text-gray-500 dark:text-gray-400 w-48 hidden lg:table-cell">
                {formatLastRun(test)}
            </td>
            <td className="py-3.5 px-3 md:px-6 w-20 md:w-40 hidden sm:table-cell">
                <ActionButton
                    size="sm"
                    variant="primary"
                    isRunning={isRunning}
                    runningText="Running..."
                    icon={<Play className="h-3.5 w-3.5" />}
                    disabled={isAnyTestRunning}
                    onClick={(e) => {
                        e.stopPropagation()
                        onRerun(test.id)
                    }}>
                    Run
                </ActionButton>
            </td>
        </tr>
    )
}

// Small thumbnail component for table rows (16x16px)
function NoteImageMiniThumbnail({image}: {image: NoteImage}) {
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let isMounted = true

        const loadImage = async () => {
            try {
                const url = await createProtectedFileURL(image.url, config.api.serverUrl)
                if (isMounted) {
                    setImageUrl(url)
                    setLoading(false)
                }
            } catch {
                if (isMounted) {
                    setLoading(false)
                }
            }
        }

        loadImage()

        return () => {
            isMounted = false
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl)
            }
        }
    }, [image.url])

    if (loading || !imageUrl) {
        return (
            <span className="skeleton inline-block h-4 w-4 rounded-md ring-1 ring-inset ring-gray-500/10 dark:ring-white/10" />
        )
    }

    return (
        <img
            src={imageUrl}
            alt=""
            className="inline-block h-4 w-4 rounded-md object-cover ring-1 ring-inset ring-gray-500/15 dark:ring-white/10"
            style={{verticalAlign: 'middle'}}
            onClick={(e) => e.stopPropagation()}
        />
    )
}
