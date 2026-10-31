import {useEffect, useId, useMemo, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Search, FileX} from 'lucide-react'
import {ModalBackdrop} from '@shared/components/molecules/ModalBackdrop'
import {StatusIcon, type TestStatus} from '@shared/components/atoms'
import type {ProjectTabConfig} from '@/hooks/useProjectTabs'
import type {TestSearchHit} from '@/services/testSearch.service'
import {SEARCH_MIN_CHARS, useTestSearch} from '../hooks/useTestSearch'

const STATUS_TEXT: Record<TestStatus, string> = {
    passed: 'text-success-600 dark:text-success-400',
    failed: 'text-danger-600 dark:text-danger-400',
    skipped: 'text-warning-600 dark:text-warning-400',
    pending: 'text-primary-600 dark:text-primary-400',
}

export interface CommandPaletteProps {
    isOpen: boolean
    onClose: () => void
    // All configured tabs: the tab label of a hit is its displayName, else the project name
    projectTabs: ProjectTabConfig[]
}

/** Same URL a shared test link has (`/tests?project=…&testId=…`): TestsList resolves it. */
export function buildTestLinkPath(hit: Pick<TestSearchHit, 'project' | 'testId'>): string {
    const params = new URLSearchParams()
    if (hit.project) params.set('project', hit.project)
    params.set('testId', hit.testId)
    return `/tests?${params.toString()}`
}

export function CommandPalette({isOpen, onClose, projectTabs}: CommandPaletteProps) {
    if (!isOpen) return null
    return <PaletteDialog onClose={onClose} projectTabs={projectTabs} />
}

function PaletteDialog({onClose, projectTabs}: Omit<CommandPaletteProps, 'isOpen'>) {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listId = useId()
    const {enabled, isLoading, error, results} = useTestSearch(query)

    const tabLabels = useMemo(
        () => new Map(projectTabs.map((tab) => [tab.project, tab.displayName])),
        [projectTabs]
    )

    // Focus the input on open, give focus back to what had it on close
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null
        inputRef.current?.focus()
        return () => previous?.focus?.()
    }, [])

    useEffect(() => {
        setActiveIndex(0)
    }, [results])

    useEffect(() => {
        document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({block: 'nearest'})
    }, [activeIndex, listId])

    // Capture + stopImmediatePropagation: Esc must not also close the modal/lightbox below (document listeners)
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            e.stopImmediatePropagation()
            onClose()
        }
        document.addEventListener('keydown', handleEscape, true)
        return () => document.removeEventListener('keydown', handleEscape, true)
    }, [onClose])

    const open = (hit: TestSearchHit) => {
        onClose()
        navigate(buildTestLinkPath(hit))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (results.length === 0) return
            const step = e.key === 'ArrowDown' ? 1 : -1
            setActiveIndex((i) => (i + step + results.length) % results.length)
        } else if (e.key === 'Enter') {
            e.preventDefault()
            // While a newer query loads the rows belong to an older one
            const hit = isLoading ? undefined : results[activeIndex]
            if (hit) open(hit)
        } else if (e.key === 'Tab') {
            // The input is the only stop; keep focus inside the dialog
            e.preventDefault()
        }
    }

    const hasResults = results.length > 0
    const showEmpty = enabled && !isLoading && !error && !hasResults

    return (
        <div className="fixed inset-0 z-[70]">
            <ModalBackdrop onClick={onClose} />
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center p-4 pt-[12vh]">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Search tests"
                    onKeyDown={handleKeyDown}
                    className="pointer-events-auto flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900">
                    <div className="flex items-center gap-3 border-b border-gray-100 px-4 dark:border-white/[0.06]">
                        <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            role="combobox"
                            aria-expanded={hasResults}
                            aria-controls={listId}
                            aria-autocomplete="list"
                            aria-activedescendant={
                                hasResults ? `${listId}-${activeIndex}` : undefined
                            }
                            aria-label="Search tests"
                            placeholder="Search tests by title, file or ticket"
                            autoComplete="off"
                            spellCheck={false}
                            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                        />
                        <kbd className="rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:border-white/10">
                            esc
                        </kbd>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {!enabled && (
                            <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                Type at least {SEARCH_MIN_CHARS} characters to search all projects
                            </p>
                        )}
                        {enabled && isLoading && !hasResults && (
                            <p
                                role="status"
                                className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                Searching...
                            </p>
                        )}
                        {error && (
                            <p
                                role="alert"
                                className="px-4 py-6 text-center text-sm text-danger-600 dark:text-danger-400">
                                Search failed. Try again
                            </p>
                        )}
                        {showEmpty && (
                            <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                No tests match
                            </p>
                        )}
                        <ul
                            id={listId}
                            role="listbox"
                            aria-label="Matching tests"
                            hidden={!hasResults}
                            className={`py-1 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
                            {results.map((hit, index) => (
                                <PaletteRow
                                    key={hit.testId}
                                    id={`${listId}-${index}`}
                                    hit={hit}
                                    tabLabel={tabLabels.get(hit.project) || hit.project}
                                    active={index === activeIndex}
                                    onHover={() => setActiveIndex(index)}
                                    onSelect={() => open(hit)}
                                />
                            ))}
                        </ul>
                    </div>

                    <div className="hidden items-center gap-4 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400 dark:border-white/[0.06] sm:flex">
                        <span>Up/Down move</span>
                        <span>Enter open</span>
                        <span>Esc close</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

interface PaletteRowProps {
    id: string
    hit: TestSearchHit
    tabLabel: string
    active: boolean
    onHover: () => void
    onSelect: () => void
}

function PaletteRow({id, hit, tabLabel, active, onHover, onSelect}: PaletteRowProps) {
    const notInCode = !!hit.notInCode
    return (
        <li
            id={id}
            role="option"
            aria-selected={active}
            onMouseEnter={onHover}
            onClick={onSelect}
            className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 ${
                active ? 'bg-primary-50 dark:bg-primary-500/10' : ''
            }`}>
            <StatusIcon
                status={hit.status}
                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${STATUS_TEXT[hit.status] ?? ''}`}
            />
            <div className="min-w-0 flex-1">
                <div
                    className={`truncate text-sm font-medium ${
                        notInCode
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-gray-900 dark:text-white'
                    }`}>
                    {hit.name}
                </div>
                <div className="flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
                    {notInCode && (
                        <span title="Not found in the latest Discover" className="flex-shrink-0">
                            <FileX className="h-3 w-3" aria-label="Not in code" />
                        </span>
                    )}
                    <span className="truncate">{hit.filePath}</span>
                </div>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
                {tabLabel && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                        {tabLabel}
                    </span>
                )}
                {hit.tickets.length > 0 && (
                    <span className="text-[11px] font-medium text-primary-600 dark:text-primary-400">
                        {hit.tickets.join(' ')}
                    </span>
                )}
            </div>
        </li>
    )
}
