import {useContext, useEffect, useId, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Bug, CheckSquare, Bookmark, Zap, Tag, LucideIcon} from 'lucide-react'
import {useJiraSettings} from '@features/dashboard/hooks/useJiraSettings'
import {buildJiraUrl, displayTagMatchesQuery, DisplayTag} from '../utils/jiraTags'
import {JiraTicketInfoContext} from './JiraTicketInfoContext'
import {JiraStatusCategory, JiraTicketInfo} from '../hooks/useJiraTicketInfo'

// Renders ticket chips AND (in tag mode 'all') neutral chips for other tags; name kept for churn.

export interface TicketChipsProps {
    tags: DisplayTag[]
    /** Chip alignment inside the Tickets column. Default left. */
    align?: 'left' | 'right'
    className?: string
    /** Active list search: chips whose label matches are drawn solid. Omit for no highlight. */
    searchQuery?: string
}

// Colours live in separate normal/hit strings (never appended over each other):
// conflicting Tailwind utilities resolve by CSS source order, not class order.
const chipBase = 'inline-block rounded-md border px-2 py-0.5 font-mono text-xs font-semibold'
const chipNormal =
    'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-300'
const chipHit =
    'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-400 dark:text-gray-900'
// Other (non-ticket) tags: neutral grey, never clickable, no hover cue
const otherNormal =
    'border-gray-200 bg-gray-100 text-gray-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300'
const otherHit =
    'border-gray-600 bg-gray-600 text-white dark:border-gray-300 dark:bg-gray-300 dark:text-gray-900'

// Links: hover cue is a stronger border/background, never an underline
const linkBase =
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60'
const linkHoverNormal =
    'hover:border-primary-400 hover:bg-primary-100 dark:hover:border-primary-400/60 dark:hover:bg-primary-500/25'
const linkHoverHit = 'hover:border-primary-500 hover:bg-primary-500 dark:hover:bg-primary-300'

// ---------------------------------------------------------------------------------------------
// Jira-enriched ticket chip (design "Option 4"): icon for issue type, background colored like a
// Jira status lozenge (grey/blue/green from statusCategory — never red/green-as-pass/fail, see
// STATUS_CATEGORY_CLASS), custom tooltip with the full picture. Only rendered once a ticket's
// info has actually resolved (JiraTicketInfoContext); until then, or if the integration isn't
// configured, the ticket falls through to the plain chip below — pixel-identical to before.
// ---------------------------------------------------------------------------------------------

const ISSUE_TYPE_ICONS: Record<string, LucideIcon> = {
    bug: Bug,
    task: CheckSquare,
    subtask: CheckSquare,
    'sub-task': CheckSquare,
    story: Bookmark,
    epic: Zap,
}

function normalizeIssueType(issueType: string): string {
    return issueType.trim().toLowerCase()
}

// Unknown/new Jira issue types (anything not in the map above) fall back to a generic tag icon
// rather than guessing — a type this dashboard has never seen must not break the chip.
function issueTypeIcon(issueType: string): LucideIcon {
    return ISSUE_TYPE_ICONS[normalizeIssueType(issueType)] ?? Tag
}

// Tooltip-only: colors the type icon/label like Jira does (Bug red, Task blue, Story green,
// Epic purple), so the tooltip reads at a glance instead of everything being one color. Never
// applied to the chip itself — the chip's color is the statusCategory lozenge, not the type.
const TYPE_COLOR_CLASS: Record<string, string> = {
    bug: 'text-jiraRed-600 dark:text-jiraRed-400',
    task: 'text-jiraBlue-600 dark:text-jiraBlue-400',
    subtask: 'text-jiraBlue-600 dark:text-jiraBlue-400',
    'sub-task': 'text-jiraBlue-600 dark:text-jiraBlue-400',
    story: 'text-jiraGreen-600 dark:text-jiraGreen-400',
    epic: 'text-jiraPurple-600 dark:text-jiraPurple-400',
}
const TYPE_COLOR_FALLBACK = 'text-gray-500 dark:text-gray-400'

function issueTypeColorClass(issueType: string): string {
    return TYPE_COLOR_CLASS[normalizeIssueType(issueType)] ?? TYPE_COLOR_FALLBACK
}

// Deliberately not `border-danger-*`/`border-success-*` (or the remapped `blue-*`/`green-*`,
// which alias to indigo/emerald) — see tailwind.config.js jiraBlue/jiraGreen for why.
const STATUS_CATEGORY_CLASS: Record<JiraStatusCategory, string> = {
    new: 'border-gray-200 bg-gray-100 text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300',
    indeterminate:
        'border-jiraBlue-200 bg-jiraBlue-50 text-jiraBlue-700 dark:border-jiraBlue-500/30 dark:bg-jiraBlue-500/15 dark:text-jiraBlue-300',
    done: 'border-jiraGreen-200 bg-jiraGreen-50 text-jiraGreen-700 dark:border-jiraGreen-500/30 dark:bg-jiraGreen-500/15 dark:text-jiraGreen-300',
}

const jiraChipBase =
    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60'

// Search-hit ring, keyed by category rather than a single indigo ring for every category: a
// bold indigo outline on top of the pale done/new/indeterminate fills (light theme especially —
// they're deliberately pastel, see STATUS_CATEGORY_CLASS) visually drowned out the category
// color, so a match looked the same regardless of category. Same hue family as the fill instead.
const HIT_RING_CLASS: Record<JiraStatusCategory, string> = {
    new: 'ring-2 ring-gray-400 dark:ring-gray-300',
    indeterminate: 'ring-2 ring-jiraBlue-500 dark:ring-jiraBlue-400',
    done: 'ring-2 ring-jiraGreen-500 dark:ring-jiraGreen-400',
}

// Rough tooltip height (content varies a little with a 2-line summary, but not enough to matter
// here) plus its own margin — how much room below/above the chip counts as "enough" before
// flipping the tooltip to the other vertical side.
const TOOLTIP_SPACE_NEEDED_PX = 150

// Tailwind's `w-60` (the tooltip's fixed width) — used to decide whether a left-aligned tooltip
// would overflow past the right edge of the viewport.
const TOOLTIP_WIDTH_PX = 240

// Gap between the chip and the tooltip — matches the old `mb-2`/`mt-2` (0.5rem).
const TOOLTIP_GAP_PX = 8

interface TooltipPosition {
    top: number
    left: number
    openUpward: boolean
}

/**
 * Where to place a fixed-position tooltip for a chip at `rect`, purely from viewport edges —
 * no scroll-ancestor walk needed, because a `position: fixed` tooltip portaled to `document.body`
 * is never clipped by an ancestor's `overflow`/stacking context (which is exactly the bug this
 * replaced: a sticky group header sitting on top of the old absolutely-positioned tooltip).
 */
function computeTooltipPosition(rect: DOMRect): TooltipPosition {
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    // Neither side has the full amount needed: open on whichever side actually has more room,
    // instead of always flipping up and clipping worse than staying put. A tie keeps the old
    // default (flip up) — below already failed the direct check.
    const openUpward =
        spaceBelow < TOOLTIP_SPACE_NEEDED_PX &&
        (spaceAbove >= TOOLTIP_SPACE_NEEDED_PX || spaceAbove >= spaceBelow)

    const alignRight = window.innerWidth - rect.left < TOOLTIP_WIDTH_PX

    return {
        top: openUpward ? rect.top - TOOLTIP_GAP_PX : rect.bottom + TOOLTIP_GAP_PX,
        left: alignRight ? rect.right - TOOLTIP_WIDTH_PX : rect.left,
        openUpward,
    }
}

function JiraEnrichedChip({
    label,
    info,
    url,
    hit,
}: {
    label: string
    info: JiraTicketInfo
    url: string | null
    hit: boolean
}) {
    const wrapRef = useRef<HTMLSpanElement>(null)
    const [position, setPosition] = useState<TooltipPosition | null>(null)
    const tooltipId = useId()
    const Icon = issueTypeIcon(info.issueType)
    const className =
        `${jiraChipBase} ${STATUS_CATEGORY_CLASS[info.statusCategory]} ${hit ? HIT_RING_CLASS[info.statusCategory] : ''}`.trim()

    const open = () => {
        if (wrapRef.current) {
            setPosition(computeTooltipPosition(wrapRef.current.getBoundingClientRect()))
        }
    }
    const close = () => setPosition(null)

    // A fixed-position tooltip is anchored to a rect measured once, at open time — it would
    // drift away from the chip on any scroll (the page, or a scrollable ancestor like
    // TestsList's overflow-y-auto pane) or on a viewport resize. Closing on either is simpler
    // than re-measuring and re-portaling on every tick, and the chip is one hover/focus away
    // regardless. Escape also closes it (WCAG 1.4.13 — dismissible on-hover/-focus content).
    useEffect(() => {
        if (!position) return
        const closeOnEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close()
        }
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)
        window.addEventListener('keydown', closeOnEscape)
        return () => {
            window.removeEventListener('scroll', close, true)
            window.removeEventListener('resize', close)
            window.removeEventListener('keydown', closeOnEscape)
        }
    }, [position])

    const content = (
        <>
            <Icon className="h-3 w-3 flex-shrink-0" />
            {label}
        </>
    )

    return (
        <span
            ref={wrapRef}
            className="relative inline-block"
            onMouseEnter={open}
            onMouseLeave={close}
            onFocus={open}
            onBlur={close}>
            {url ? (
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    data-kind="ticket"
                    data-hit={hit || undefined}
                    aria-describedby={position ? tooltipId : undefined}
                    className={className}>
                    {content}
                </a>
            ) : (
                // tabIndex so a chip with no link target is still keyboard-reachable to open its
                // tooltip — this branch only renders once Jira info has resolved for this key, so
                // there's always tooltip content behind it.
                <span
                    tabIndex={0}
                    data-kind="ticket"
                    data-hit={hit || undefined}
                    aria-describedby={position ? tooltipId : undefined}
                    className={className}>
                    {content}
                </span>
            )}
            {position &&
                createPortal(
                    <JiraTicketTooltip
                        id={tooltipId}
                        label={label}
                        info={info}
                        position={position}
                    />,
                    document.body
                )}
        </span>
    )
}

function JiraTicketTooltip({
    id,
    label,
    info,
    position,
}: {
    id: string
    label: string
    info: JiraTicketInfo
    position: TooltipPosition
}) {
    const Icon = issueTypeIcon(info.issueType)
    const typeColorClass = issueTypeColorClass(info.issueType)

    return (
        <div
            id={id}
            role="tooltip"
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                transform: position.openUpward ? 'translateY(-100%)' : undefined,
            }}
            className="pointer-events-none z-20 w-60 animate-fade-in rounded-xl border border-gray-200
                bg-white p-3 shadow-xl dark:border-white/10 dark:bg-gray-800">
            <div className="flex items-center gap-1.5 text-xs">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${typeColorClass}`} />
                <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {label}
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className={`font-medium ${typeColorClass}`}>{info.issueType}</span>
            </div>
            {info.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-gray-700 dark:text-gray-200">
                    {info.summary}
                </p>
            )}
            <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Status:</span>
                    <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CATEGORY_CLASS[info.statusCategory]}`}>
                        {info.statusName}
                    </span>
                </div>
                <div>
                    <span className="text-gray-500 dark:text-gray-400">Assignee:</span>{' '}
                    {info.assignee ? (
                        <span className="text-gray-800 dark:text-gray-200">{info.assignee}</span>
                    ) : (
                        <span className="italic text-gray-400 dark:text-gray-500">Unassigned</span>
                    )}
                </div>
            </div>
        </div>
    )
}

export function TicketChips(props: TicketChipsProps) {
    // Split so ticketless rows (most of them) never mount a query observer
    if (props.tags.length === 0) return null
    return <TicketChipList {...props} />
}

function TicketChipList({
    tags,
    align = 'left',
    className = '',
    searchQuery = '',
}: TicketChipsProps) {
    // enabled=false: read the cache filled once at App level, never fetch per row
    const {settings} = useJiraSettings(false)
    // Default (no ancestor Provider, e.g. most existing tests): empty map, every key falls back
    // to the plain chip below — same behavior as before this feature existed.
    const jiraTicketInfo = useContext(JiraTicketInfoContext)

    const justify = align === 'right' ? 'justify-end' : ''

    return (
        <div className={`flex min-w-0 flex-wrap gap-1.5 ${justify} ${className}`.trim()}>
            {tags.map(({label, kind}) => {
                const hit = displayTagMatchesQuery(label, searchQuery)
                if (kind === 'other') {
                    return (
                        <span
                            key={label}
                            data-kind="other"
                            data-hit={hit || undefined}
                            className={`${chipBase} ${hit ? otherHit : otherNormal}`}>
                            {label}
                        </span>
                    )
                }
                const url = buildJiraUrl(settings.baseUrl, label)

                const info = jiraTicketInfo.get(label)
                if (info) {
                    return (
                        <JiraEnrichedChip
                            key={label}
                            label={label}
                            info={info}
                            url={url}
                            hit={hit}
                        />
                    )
                }

                const color = hit ? chipHit : chipNormal
                if (!url) {
                    return (
                        <span
                            key={label}
                            data-kind="ticket"
                            data-hit={hit || undefined}
                            className={`${chipBase} ${color}`}>
                            {label}
                        </span>
                    )
                }
                return (
                    <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        data-kind="ticket"
                        data-hit={hit || undefined}
                        className={`${chipBase} ${color} ${linkBase} ${hit ? linkHoverHit : linkHoverNormal}`}>
                        {label}
                    </a>
                )
            })}
        </div>
    )
}
