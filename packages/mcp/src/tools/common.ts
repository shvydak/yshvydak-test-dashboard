import type {CallToolResult} from '@modelcontextprotocol/server'
import type {z, ZodObject, ZodRawShape} from 'zod'
import {DashboardError} from '../auth'
import type {DashboardClient} from '../client'
import {HttpGuardError} from '../http'
import {json} from '../trim'
import type {JiraTicket, TestRow} from '../types'

export interface ToolDef {
    name: string
    title: string
    description: string
    input: ZodObject<ZodRawShape>
    // false = starts a run (not read-only); default true
    readOnly?: boolean
    handler: (args: never) => Promise<CallToolResult>
}

// Wraps the handler so every failure becomes a secret-free tool error; the single cast keeps
// ToolDef non-generic for the registry.
export function defineTool<S extends ZodObject<ZodRawShape>>(def: {
    name: string
    title: string
    description: string
    input: S
    readOnly?: boolean
    handler: (args: z.infer<S>) => Promise<CallToolResult>
}): ToolDef {
    return {...def, handler: safe(def.handler) as ToolDef['handler']}
}

export const textResult = (obj: unknown): CallToolResult => ({
    content: [{type: 'text', text: json(obj)}],
})

export function errorResult(err: unknown): CallToolResult {
    const known = err instanceof DashboardError || err instanceof HttpGuardError
    const message = err instanceof Error ? err.message : 'unknown error'
    return {
        isError: true,
        content: [{type: 'text', text: known ? message : `Unexpected error: ${message}`}],
    }
}

// Wraps a handler so every failure becomes a tool error with a fixed, secret-free message
export function safe<A>(fn: (args: A) => Promise<CallToolResult>) {
    return async (args: A): Promise<CallToolResult> => {
        try {
            return await fn(args)
        } catch (err) {
            return errorResult(err)
        }
    }
}

export const TICKET_TAG = /^@[A-Z][A-Z0-9]+-\d+$/

export const ticketKeys = (row: TestRow): string[] =>
    (row.metadata?.tags ?? []).filter((t) => TICKET_TAG.test(t)).map((t) => t.slice(1))

export const isFailing = (status: string) => status === 'failed' || status === 'timedOut'

export async function resolveTab(client: DashboardClient, tab: string): Promise<string> {
    const [tabs, summary] = await Promise.all([client.tabs(), client.summaryByProject()])
    const names = new Map<string, string>()
    for (const p of summary) names.set(p.project, p.project)
    if (tabs.ok) {
        for (const t of tabs.value) {
            names.set(t.project, t.project)
            if (t.displayName) names.set(t.displayName, t.project)
        }
    }
    if (names.has(tab)) return names.get(tab)!
    const wanted = tab.toLowerCase()
    for (const [name, project] of names) if (name.toLowerCase() === wanted) return project
    const display = new Map<string, string>()
    if (tabs.ok)
        for (const t of tabs.value) if (t.displayName) display.set(t.project, t.displayName)
    const known = [...new Set(names.values())].map((p) =>
        display.has(p) && display.get(p) !== p ? `${p} ("${display.get(p)}")` : p
    )
    throw new DashboardError(
        `Unknown tab "${tab}". Known tabs: ${known.join(', ') || 'none'}${
            tabs.ok ? '' : ' (display names unavailable: login is off)'
        }`
    )
}

export type TicketLookup =
    | {available: true; tickets: Map<string, JiraTicket>; asOf: string | null}
    | {available: false; reason: string}

export async function lookupTickets(
    client: DashboardClient,
    keys: string[]
): Promise<TicketLookup> {
    if (keys.length === 0) return {available: true, tickets: new Map(), asOf: null}
    const res = await client.jiraTickets([...new Set(keys)])
    return res.ok
        ? {available: true, ...res.value, asOf: res.value.lastSyncAt}
        : {available: false, reason: res.reason}
}

export const jiraUnavailable = (reason: string) => `Jira unavailable: ${reason}`
