import {useState, ReactNode} from 'react'
import {AlignLeft, AlignRight, CornerDownRight} from 'lucide-react'
import {Button} from '@shared/components'
import {SettingsSection} from './SettingsSection'
import {useJiraSettings, ChipAlignment, TagMode} from '../../hooks/useJiraSettings'

const EXAMPLE_KEY = 'ABC-123'

const POSITION_OPTIONS: Array<{value: ChipAlignment; label: string; icon: ReactNode}> = [
    {value: 'left', label: 'Column, left', icon: <AlignLeft className="h-4 w-4" />},
    {value: 'right', label: 'Column, right', icon: <AlignRight className="h-4 w-4" />},
    {value: 'below', label: 'Under test name', icon: <CornerDownRight className="h-4 w-4" />},
]

const TAG_MODE_OPTIONS: Array<{value: TagMode; label: string}> = [
    {value: 'tickets', label: 'Ticket keys only'},
    {value: 'all', label: 'All tags'},
]

// Same look for both segmented controls
const segmentClass = (active: boolean) =>
    `flex-1 rounded-xl px-2 py-2 text-sm sm:px-4 font-medium transition-all duration-150 active:scale-[0.98] ${
        active
            ? 'bg-white text-primary-700 shadow-soft dark:bg-primary-500/15 dark:text-primary-300'
            : 'text-gray-500 hover:bg-white/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-white'
    }`

export function SettingsJiraSection() {
    const {settings, isLoading, saveSettings, isSaving, saveError, resetSaveError} =
        useJiraSettings()

    // Local drafts, null = untouched (show the saved value)
    const [baseUrlDraft, setBaseUrlDraft] = useState<string | null>(null)
    const [alignmentDraft, setAlignmentDraft] = useState<ChipAlignment | null>(null)
    const [tagModeDraft, setTagModeDraft] = useState<TagMode | null>(null)

    const baseUrl = baseUrlDraft ?? settings.baseUrl
    const chipAlignment = alignmentDraft ?? settings.chipAlignment
    const tagMode = tagModeDraft ?? settings.tagMode
    const isDirty =
        baseUrl.trim() !== settings.baseUrl ||
        chipAlignment !== settings.chipAlignment ||
        tagMode !== settings.tagMode

    const trimmedUrl = baseUrl.trim()
    const previewUrl = trimmedUrl
        ? `${trimmedUrl}${trimmedUrl.endsWith('/') ? '' : '/'}${EXAMPLE_KEY}`
        : null

    const handleSave = () => {
        saveSettings(
            {baseUrl: trimmedUrl, chipAlignment, tagMode},
            {
                onSuccess: () => {
                    setBaseUrlDraft(null)
                    setAlignmentDraft(null)
                    setTagModeDraft(null)
                },
            }
        )
    }

    return (
        <SettingsSection
            title="Tags & tickets"
            description="Playwright tags show as chips in the test list. Tags like @ABC-123 are ticket keys and link to your tracker. Applies to all users.">
            <div className="space-y-4">
                <div>
                    <label
                        htmlFor="jira-base-url"
                        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Jira base URL
                    </label>
                    <input
                        id="jira-base-url"
                        type="url"
                        value={baseUrl}
                        onChange={(e) => {
                            setBaseUrlDraft(e.target.value)
                            resetSaveError()
                        }}
                        disabled={isLoading}
                        placeholder="https://your-company.atlassian.net/browse/"
                        spellCheck={false}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-900 transition-all
                                 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500/60
                                 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-100 disabled:opacity-50"
                    />
                    <p className="mt-2 break-all text-sm text-gray-500 dark:text-gray-400">
                        {previewUrl ? (
                            <>
                                Chip{' '}
                                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-white/[0.06]">
                                    {EXAMPLE_KEY}
                                </code>{' '}
                                opens{' '}
                                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-white/[0.06]">
                                    {previewUrl}
                                </code>
                            </>
                        ) : (
                            'Empty: chips are shown as plain labels, without links.'
                        )}
                    </p>
                </div>

                <div>
                    <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Tags to show
                    </p>
                    <div
                        role="group"
                        aria-label="Tags to show"
                        className="flex gap-1.5 rounded-2xl bg-gray-100/70 p-1.5 dark:bg-white/[0.04]">
                        {TAG_MODE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={tagMode === option.value}
                                onClick={() => {
                                    setTagModeDraft(option.value)
                                    resetSaveError()
                                }}
                                className={segmentClass(tagMode === option.value)}>
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Ticket keys are tags like ABC-123 that link to the tracker. With "All tags",
                        every other tag is also shown, grey and not clickable.
                    </p>
                </div>

                <div>
                    <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Chip position
                    </p>
                    <div
                        role="group"
                        aria-label="Chip position"
                        className="flex gap-1.5 rounded-2xl bg-gray-100/70 p-1.5 dark:bg-white/[0.04]">
                        {POSITION_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={chipAlignment === option.value}
                                onClick={() => {
                                    setAlignmentDraft(option.value)
                                    resetSaveError()
                                }}
                                className={segmentClass(chipAlignment === option.value)}>
                                <span className="flex flex-col items-center justify-center gap-1.5 text-center sm:flex-row sm:gap-2">
                                    {option.icon}
                                    {option.label}
                                </span>
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Column: a column on wide screens, chips move under the test name on narrower
                        ones. Under test name: chips sit under the name at every width, no column.
                    </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-danger-600 dark:text-danger-400">
                        {saveError instanceof Error ? saveError.message : ''}
                    </p>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSave}
                        loading={isSaving}
                        disabled={isSaving || !isDirty}>
                        Save
                    </Button>
                </div>
            </div>
        </SettingsSection>
    )
}
