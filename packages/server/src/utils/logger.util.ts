export class Logger {
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

    static info(message: string, ...args: any[]): void {
        console.log(this.formatMessage('info', message, ...args))
    }

    static warn(message: string, ...args: any[]): void {
        console.warn(this.formatMessage('warn', message, ...args))
    }

    static error(message: string, error?: any): void {
        console.error(this.formatMessage('error', message))
        if (error) {
            console.error(error)
        }
    }

    static success(message: string, ...args: any[]): void {
        console.log(this.formatMessage('success', message, ...args))
    }

    static debug(message: string, ...args: any[]): void {
        if (process.env.NODE_ENV === 'development') {
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
        console.log('🚀 YShvydak Test Dashboard Server running on port', port)
        console.log(`📊 Health check: http://localhost:${port}/api/health`)
    }
}
