import {createContext} from 'react'
import {JiraTicketInfo} from '../hooks/useJiraTicketInfo'

// Resolved Jira ticket info (type/status/summary/assignee) for the tests currently on screen,
// keyed by ticket key, so chips deep in the table can render the Option-4 lozenge without
// drilling the map through TestsContent > GroupedView > Group > Table > Row (same reasoning as
// TicketSearchContext). Default = empty map: a chip with no ancestor Provider (e.g. in tests
// that don't set one up) simply renders the pre-existing plain-link chip for every key.
export const JiraTicketInfoContext = createContext<Map<string, JiraTicketInfo>>(new Map())
