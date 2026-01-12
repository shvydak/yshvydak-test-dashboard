const fs = require('fs')
const path = require('path')

// Load .env manually to access variables in this config file
const envPath = path.resolve(__dirname, '.env')
let envVars = {}
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach((line) => {
        const match = line.match(/^([^#=]+)=(.*)$/)
        if (match) {
            const key = match[1].trim()
            const value = match[2].trim().replace(/^["']|["']$/g, '')
            envVars[key] = value
        }
    })
}

module.exports = {
    apps: [
        {
            name: 'dashboard-server',
            cwd: './packages/server',
            script: 'dist/index.js',
            instances: 1,
            exec_mode: 'cluster',
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            env_file: '../../.env',
            // PM2 graceful shutdown configuration
            kill_timeout: 5000, // Wait 5 seconds for graceful shutdown before force kill
            wait_ready: true, // Wait for process.send('ready') before considering app as online
            listen_timeout: 10000, // Timeout for app to be ready (10 seconds)
            shutdown_with_message: true, // Allow shutdown via process messages
            // Logging
            error_file: '../../logs/server-error.log',
            out_file: '../../logs/server-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            time: true,
        },
        {
            name: 'dashboard-web',
            cwd: './packages/web',
            script: 'npx',
            args: `vite preview --host 0.0.0.0 --port ${envVars.VITE_PORT || '3000'}`,
            instances: 1,
            exec_mode: 'cluster',
            autorestart: true,
            watch: false,
            max_memory_restart: '256M',
            env_file: '../../.env',
            // PM2 graceful shutdown configuration
            kill_timeout: 5000,
            listen_timeout: 10000,
            // Logging
            error_file: '../../logs/web-error.log',
            out_file: '../../logs/web-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            time: true,
        },
    ],
}
