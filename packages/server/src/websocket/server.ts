import WebSocket from 'ws'
import {Server} from 'http'
import {v4 as uuidv4} from 'uuid'

export interface WebSocketMessage {
     type: string
     data?: any
     timestamp?: string
     clientId?: string
}

export interface TestStatusUpdate {
     testId: string
     status: 'running' | 'passed' | 'failed' | 'skipped' | 'timeout'
     progress?: number
     message?: string
}

export interface TestProgressUpdate {
     testId: string
     currentStep: string
     progress: number
     totalSteps?: number
}

export class WebSocketManager {
     private wss: WebSocket.Server
     private clients: Map<string, WebSocket> = new Map()

     constructor(server: Server) {
          this.wss = new WebSocket.Server({
               server,
               path: '/ws',
               perMessageDeflate: false,
          })

          this.wss.on('connection', (ws: WebSocket, request) => {
               const clientId = uuidv4()
               this.clients.set(clientId, ws)

               console.log(`WebSocket client connected: ${clientId}`)

               // Send welcome message
               this.sendToClient(clientId, {
                    type: 'connection',
                    data: {
                         clientId,
                         message: 'Connected to YShvydak Test Dashboard',
                    },
               })

               // Handle incoming messages
               ws.on('message', (data: WebSocket.Data) => {
                    try {
                         const message: WebSocketMessage = JSON.parse(
                              data.toString(),
                         )
                         this.handleClientMessage(clientId, message)
                    } catch (error) {
                         console.error(
                              'Error parsing WebSocket message:',
                              error,
                         )
                         this.sendToClient(clientId, {
                              type: 'error',
                              data: {message: 'Invalid message format'},
                         })
                    }
               })

               // Handle client disconnect
               ws.on('close', () => {
                    console.log(`WebSocket client disconnected: ${clientId}`)
                    this.clients.delete(clientId)
               })

               // Handle errors
               ws.on('error', (error) => {
                    console.error(
                         `WebSocket error for client ${clientId}:`,
                         error,
                    )
                    this.clients.delete(clientId)
               })

               // Send periodic ping to keep connection alive
               const pingInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                         ws.ping()
                    } else {
                         clearInterval(pingInterval)
                    }
               }, 30000) // Ping every 30 seconds
          })

          console.log('WebSocket server initialized on /ws')
     }

     private handleClientMessage(
          clientId: string,
          message: WebSocketMessage,
     ): void {
          switch (message.type) {
               case 'ping':
                    this.sendToClient(clientId, {type: 'pong'})
                    break

               case 'subscribe':
                    // Handle subscription to specific events (e.g., specific test updates)
                    console.log(
                         `Client ${clientId} subscribed to:`,
                         message.data,
                    )
                    break

               case 'unsubscribe':
                    // Handle unsubscription
                    console.log(
                         `Client ${clientId} unsubscribed from:`,
                         message.data,
                    )
                    break

               default:
                    console.log(
                         `Unknown message type from client ${clientId}:`,
                         message.type,
                    )
          }
     }

     private sendToClient(clientId: string, message: WebSocketMessage): void {
          const client = this.clients.get(clientId)
          if (client && client.readyState === WebSocket.OPEN) {
               const messageWithTimestamp: WebSocketMessage = {
                    ...message,
                    timestamp: new Date().toISOString(),
                    clientId,
               }

               client.send(JSON.stringify(messageWithTimestamp))
          }
     }

     // Public methods for sending updates

     // Broadcast to all connected clients
     public broadcast(message: WebSocketMessage): void {
          const messageWithTimestamp: WebSocketMessage = {
               ...message,
               timestamp: new Date().toISOString(),
          }

          const messageString = JSON.stringify(messageWithTimestamp)

          this.clients.forEach((client, clientId) => {
               if (client.readyState === WebSocket.OPEN) {
                    try {
                         client.send(messageString)
                    } catch (error) {
                         console.error(
                              `Error sending message to client ${clientId}:`,
                              error,
                         )
                         this.clients.delete(clientId)
                    }
               } else {
                    this.clients.delete(clientId)
               }
          })
     }

     // Send test status update
     public broadcastTestStatus(update: TestStatusUpdate): void {
          this.broadcast({
               type: 'test:status',
               data: update,
          })
     }

     // Send test progress update
     public broadcastTestProgress(update: TestProgressUpdate): void {
          this.broadcast({
               type: 'test:progress',
               data: update,
          })
     }

     // Send test completion
     public broadcastTestCompleted(testId: string, result: any): void {
          this.broadcast({
               type: 'test:completed',
               data: {testId, result},
          })
     }

     // Send run status update
     public broadcastRunStatus(
          runId: string,
          status: string,
          data?: any,
     ): void {
          this.broadcast({
               type: 'run:status',
               data: {runId, status, ...data},
          })
     }

     // Send dashboard stats update
     public broadcastStatsUpdate(stats: any): void {
          this.broadcast({
               type: 'stats:update',
               data: stats,
          })
     }

     // Get connection info
     public getConnectionInfo(): {connectedClients: number; clients: string[]} {
          return {
               connectedClients: this.clients.size,
               clients: Array.from(this.clients.keys()),
          }
     }

     // Close all connections
     public close(callback?: () => void): void {
          console.log('Closing WebSocket server...')

          // Close all client connections
          this.clients.forEach((client, clientId) => {
               if (client.readyState === WebSocket.OPEN) {
                    client.close(1000, 'Server shutting down')
               }
          })

          this.clients.clear()

          // Close the server
          this.wss.close(callback)
     }
}

// Factory function to create WebSocket server
export function createWebSocketServer(server: Server): WebSocketManager {
     return new WebSocketManager(server)
}

// Export singleton instance for use across the application
let wsManager: WebSocketManager | null = null

export function getWebSocketManager(): WebSocketManager | null {
     return wsManager
}

export function setWebSocketManager(manager: WebSocketManager): void {
     wsManager = manager
}
