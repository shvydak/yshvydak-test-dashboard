import {createApp} from './app'
import {createWebSocketServer, setWebSocketManager} from './websocket/server'
import {config} from './config/environment.config'
import {Logger} from './utils/logger.util'
import {DatabaseManager} from './database/database.manager'

function startServer() {
    const {app, serviceContainer} = createApp()

    // Create database manager instance for cleanup
    const dbManager = new DatabaseManager(config.storage.outputDir)

    // Start HTTP server
    const server = app.listen(config.server.port, () => {
        Logger.serverStart(config.server.port)
        Logger.info(`📁 Output directory: ${config.storage.outputDir}`)
        Logger.info(`🎭 Playwright project directory: ${config.playwright.projectDir}`)
    })

    // Start WebSocket server
    const wsServer = createWebSocketServer(server)
    setWebSocketManager(wsServer)

    // Graceful shutdown
    const gracefulShutdown = () => {
        Logger.info('🛑 Shutting down gracefully...')

        server.close(() => {
            Logger.info('HTTP server closed')

            wsServer.close(() => {
                Logger.info('WebSocket server closed')

                dbManager.close()
                process.exit(0)
            })
        })
    }

    process.on('SIGTERM', gracefulShutdown)
    process.on('SIGINT', gracefulShutdown)

    return {server, wsServer, serviceContainer}
}

// Start the server if this file is run directly
if (require.main === module) {
    startServer()
}

export {startServer, createApp}
