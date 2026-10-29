import {McpServer} from '@modelcontextprotocol/server'
import type {ToolDef} from './tools/common'

export function createServer(tools: ToolDef[]): McpServer {
    const server = new McpServer({name: 'test-dashboard', version: '0.1.0'})
    for (const t of tools) {
        server.registerTool(
            t.name,
            {
                title: t.title,
                description: t.description,
                inputSchema: t.input,
                annotations: {readOnlyHint: true, idempotentHint: true, openWorldHint: false},
            },
            // The SDK infers the callback args from the schema; ToolDef erases it
            ((args: never) => t.handler(args)) as never
        )
    }
    return server
}
