import {z} from 'zod'
import type {DashboardClient} from '../client'
import {
    LIST_DEFAULT_LIMIT,
    LIST_MAX_LIMIT,
    MAX_ERROR_LINE_CHARS,
    MAX_FIELD_CHARS,
    MAX_NOTE_CHARS_IN_LIST,
} from '../constants'
import {cut, fileWithLine, firstLine, fitRows, plain} from '../trim'
import type {JiraStatusCategory, JiraTicket, TestRow} from '../types'
import {
    defineTool,
    isFailing,
    jiraUnavailable,
    lookupTickets,
    resolveTab,
    textResult,
    ticketKeys,
    type TicketLookup,
    type ToolDef,
} from './common'

const input = z.object({
    tab: z
        .string()
        .optional()
        .describe(
            'Tab: project name or display name (see dashboard_overview). Omit for all tests whose latest run has a project.'
        ),
    status: z
        .enum(['passed', 'failed', 'skipped', 'pending', 'timedOut'])
        .optional()
        .describe('Latest status. "failed" includes timedOut.'),
    tag: z.string().optional().describe('Exact tag, e.g. "@to-fix" or "@ABC-123"'),
    search: z.string().optional().describe('Case-insensitive substring of test name or file path'),
    includeNotInCode: z
        .boolean()
        .default(false)
        .describe('Include tests no longer found in the code (default: hidden)'),
    ticketStatusCategory: z
        .enum(['new', 'indeterminate', 'done'])
        .optional()
        .describe(
            'Keep tests whose Jira tickets are in this status category ("done" = closed). Needs Jira data; fails loudly when it is unavailable.'
        ),
    allTicketsMustMatch: z
        .boolean()
        .default(true)
        .describe(
            'With ticketStatusCategory: true = every ticket of the test must match (tests without tickets or with unknown tickets are dropped); false = at least one.'
        ),
    limit: z.number().int().min(1).max(LIST_MAX_LIMIT).default(LIST_DEFAULT_LIMIT),
    offset: z.number().int().min(0).default(0),
})

const statusMatches = (row: TestRow, status?: string) =>
    !status || (status === 'failed' ? isFailing(row.status) : row.status === status)

function ticketsOf(row: TestRow, lookup: TicketLookup) {
    if (!lookup.available) return {known: [] as JiraTicket[], unknown: [] as string[]}
    const keys = ticketKeys(row)
    return {
        known: keys.flatMap((k) => lookup.tickets.get(k) ?? []),
        unknown: keys.filter((k) => !lookup.tickets.has(k)),
    }
}

function ticketMatch(
    row: TestRow,
    lookup: TicketLookup,
    category: JiraStatusCategory,
    all: boolean
): boolean {
    const {known, unknown} = ticketsOf(row, lookup)
    if (known.length === 0) return false
    const matching = known.filter((t) => t.statusCategory === category)
    return all ? unknown.length === 0 && matching.length === known.length : matching.length > 0
}

export function listTestsTool(client: DashboardClient): ToolDef {
    return defineTool({
        name: 'list_tests',
        title: 'List tests',
        description:
            'Latest result per test, optionally for one tab. Filters: status, tag, search, Jira ticket status (e.g. tab "to-fix" tests whose tickets are Done: ticketStatusCategory="done"). Rows carry tags and Jira tickets when available. Returns {total, returned, truncated}; page with offset. Without a tab, tests whose latest run has no project are not included.',
        input,
        handler: async (args) => {
            const project = args.tab ? await resolveTab(client, args.tab) : undefined
            const {rows, windowFull} = await client.listTests(project)

            const tag = args.tag && (args.tag.startsWith('@') ? args.tag : `@${args.tag}`)
            const needle = args.search?.toLowerCase()
            let matched = rows.filter(
                (r) =>
                    (args.includeNotInCode || !r.notInCode) &&
                    statusMatches(r, args.status) &&
                    (!tag || (r.metadata?.tags ?? []).includes(tag)) &&
                    (!needle ||
                        r.name.toLowerCase().includes(needle) ||
                        r.filePath.toLowerCase().includes(needle))
            )

            const category = args.ticketStatusCategory
            const base = {
                sourceWindowFull: windowFull || undefined,
            }
            // The ticket filter needs every candidate's tickets; otherwise only the page's rows
            let lookup: TicketLookup
            if (category) {
                lookup = await lookupTickets(client, matched.flatMap(ticketKeys))
                if (!lookup.available) {
                    return textResult({
                        ...base,
                        total: 0,
                        returned: 0,
                        truncated: false,
                        jira: jiraUnavailable(lookup.reason),
                        note: 'The ticket filter could not be applied, so no tests are listed.',
                        tests: [],
                    })
                }
                matched = matched.filter((r) =>
                    ticketMatch(r, lookup, category, args.allTicketsMustMatch)
                )
            }

            const page = matched.slice(args.offset, args.offset + args.limit)
            if (!category) lookup = await lookupTickets(client, page.flatMap(ticketKeys))
            const resolved = lookup!

            const fullRows = page.map((r) => {
                const {known, unknown} = ticketsOf(r, resolved)
                const note = cut(r.note?.content, MAX_NOTE_CHARS_IN_LIST)
                return {
                    testId: r.testId,
                    name: cut(r.name, 500),
                    file: cut(fileWithLine(r), 500),
                    project: cut(r.project || undefined, MAX_FIELD_CHARS),
                    status: r.status,
                    durationMs: r.duration,
                    lastRunAt: r.createdAt ?? r.timestamp,
                    tags: (r.metadata?.tags ?? []).slice(0, 20).map((t) => cut(t, 100)),
                    notInCode: r.notInCode || undefined,
                    note,
                    error: firstLine(plain(r.errorMessage), MAX_ERROR_LINE_CHARS),
                    tickets:
                        resolved.available && known.length > 0 ? known.map(pickTicket) : undefined,
                    ticketsWithoutJiraData: unknown.length > 0 ? unknown.slice(0, 20) : undefined,
                }
            })

            const out = fitRows(fullRows, (kept) => ({
                ...base,
                total: matched.length,
                returned: kept.length,
                truncated: args.offset + kept.length < matched.length,
                jira: resolved.available
                    ? resolved.asOf
                        ? {asOf: resolved.asOf}
                        : undefined
                    : jiraUnavailable(resolved.reason),
                tests: kept,
            }))
            return textResult(out)
        },
    })
}

const pickTicket = (t: JiraTicket) => ({
    key: t.key,
    issueType: t.issueType,
    statusName: t.statusName,
    statusCategory: t.statusCategory,
})
