import type {DashboardClient} from '../client'
import type {ToolDef} from './common'
import {getTestTool} from './getTest'
import {historyTool} from './history'
import {listTestsTool} from './listTests'
import {overviewTool} from './overview'
import {screenshotsTool} from './screenshots'

export function createTools(client: DashboardClient, host: string): ToolDef[] {
    return [
        overviewTool(client, host),
        listTestsTool(client),
        getTestTool(client),
        historyTool(client),
        screenshotsTool(client),
    ]
}
