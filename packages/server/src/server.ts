import {createApp} from './app'
import {createWebSocketServer, setWebSocketManager} from './websocket/server'
import {config} from './config/environment.config'
import {Logger} from './utils/logger.util'
import {DatabaseManager} from './database/database.manager'

async function startServer() {
    try {
        const {app, serviceContainer} = await createApp()

        // Create database manager instance for cleanup
        const dbManager = new DatabaseManager(config.storage.outputDir)

        // Start HTTP server
        const server = app.listen(config.server.port, () => {
            Logger.serverStart(config.server.port)
            Logger.info(`📁 Output directory: ${config.storage.outputDir}`)
            Logger.info(`🎭 Playwright project directory: ${config.playwright.projectDir}`)

            // Signal PM2 that the app is ready (for cluster mode with wait_ready: true)
            if (process.send) {
                process.send('ready')
                Logger.info('✅ Sent ready signal to PM2')
            }
        })

        // Start WebSocket server
        const wsServer = createWebSocketServer(server)
        setWebSocketManager(wsServer)

        // Graceful shutdown handler
        const gracefulShutdown = (signal: string) => {
            Logger.info(`🛑 Received ${signal}, shutting down gracefully...`)

            // Stop accepting new connections
            server.close(() => {
                Logger.info('✅ HTTP server closed - no longer accepting connections')

                // Close all WebSocket connections
                wsServer.close(() => {
                    Logger.info('✅ WebSocket server closed - all connections terminated')

                    // Close database connection
                    dbManager.close()
                    Logger.info('✅ Database connection closed')

                    Logger.info('🎉 Graceful shutdown completed')
                    process.exit(0)
                })
            })

            // Force shutdown if graceful shutdown takes too long
            setTimeout(() => {
                Logger.error('⚠️ Graceful shutdown timeout exceeded, forcing exit')
                process.exit(1)
            }, 4500) // 4.5 seconds (slightly less than PM2's kill_timeout of 5s)
        }

        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM')) // PM2 stop/restart
        process.on('SIGINT', () => gracefulShutdown('SIGINT')) // Ctrl+C in terminal
        process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')) // PM2 reload (cluster mode)

        // Handle PM2 shutdown message (cluster mode)
        process.on('message', (msg) => {
            if (msg === 'shutdown') {
                gracefulShutdown('PM2_SHUTDOWN_MESSAGE')
            }
        })

        return {server, wsServer, serviceContainer}
    } catch (error) {
        Logger.error('❌ Failed to start server:', error)
        process.exit(1)
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    startServer().catch((error) => {
        Logger.error('❌ Unhandled error during server startup:', error)
        process.exit(1)
    })
}

export {startServer, createApp}
