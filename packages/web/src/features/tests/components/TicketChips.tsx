import {useJiraSettings} from '@features/dashboard/hooks/useJiraSettings'
import {buildJiraUrl, displayTagMatchesQuery, DisplayTag} from '../utils/jiraTags'

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
