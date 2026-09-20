import {createContext} from 'react'

// Current list search query, so ticket chips deep in the table can highlight matches
// without drilling the prop through TestsContent > GroupedView > Group > Table > Row.
export const TicketSearchContext = createContext('')
