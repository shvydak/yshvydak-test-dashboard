export class Logger {
    private static isProduction(): boolean {
        return process.env.NODE_ENV === 'production'
    }

    private static isDevelopment(): boolean {
        return process.env.NODE_ENV === 'development'
    }

    private static formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString()
        const emoji = this.getEmoji(level)
        return `${emoji} [${timestamp}] ${level.toUpperCase()}: ${message} ${args.length ? JSON.stringify(args) : ''}`
    }

    private static getEmoji(level: string): string {
        switch (level.toLowerCase()) {
            case 'info':
                return '🔵'
            case 'warn':
                return '⚠️'
            case 'error':
                return '❌'
            case 'success':
                return '✅'
            case 'debug':
                return '🐛'
            default:
                return 'ℹ️'
        }
    }

    /**
     * Info logs - only critical operations in production
     * Use for: server startup, important state changes, critical operations
     */
    static info(message: string, ...args: any[]): void {
        // In production, only log if it's a critical operation
        // In development, log everything
        if (this.isDevelopment() || !this.isProduction()) {
            console.log(this.formatMessage('info', message, ...args))
        }
    }

    /**
     * Critical info - always logged (even in production)
     * Use for: server startup, shutdown, critical state changes
     */
    static critical(message: string, ...args: any[]): void {
        console.log(this.formatMessage('info', message, ...args))
    }

    /**
     * Warnings - always logged
     * Use for: potential issues, deprecated features, security warnings
     */
    static warn(message: string, ...args: any[]): void {
        console.warn(this.formatMessage('warn', message, ...args))
    }

    /**
     * Errors - always logged
     * Use for: errors, exceptions, failures
     */
    static error(message: string, error?: any): void {
        console.error(this.formatMessage('error', message))
        if (error) {
            console.error(error)
        }
    }

    /**
     * Success logs - only in development
     * Use for: successful operations (too verbose for production)
     */
    static success(message: string, ...args: any[]): void {
        if (this.isDevelopment()) {
            console.log(this.formatMessage('success', message, ...args))
        }
    }

    /**
     * Debug logs - only in development
     * Use for: detailed debugging information
     */
    static debug(message: string, ...args: any[]): void {
        if (this.isDevelopment()) {
            console.log(this.formatMessage('debug', message, ...args))
        }
    }

    // Specific loggers for our app
    static testDiscovery(discovered: number, saved: number): void {
        this.success(`Discovered ${discovered} tests, saved ${saved}`)
    }

    static testRun(type: string, runId: string): void {
        this.info(`Starting ${type} with run ID: ${runId}`)
    }

    static testRerun(testName: string, runId: string): void {
        this.info(`Rerunning test "${testName}" with run ID: ${runId}`)
    }

    static websocketBroadcast(type: string, clientCount: number): void {
        this.debug(`Broadcasting ${type} to ${clientCount} clients`)
    }

    static serverStart(port: number): void {
        // Server startup is critical - always log
        this.critical('🚀 YShvydak Test Dashboard Server running on port', port)
        this.critical(`📊 Health check: http://localhost:${port}/api/health`)
    }
}
