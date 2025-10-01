// Load environment variables FIRST, before any other imports
import {config} from 'dotenv'
config({path: '../../.env'})

// Now import other modules (they will see the loaded env vars)
import {startServer} from './server'

// Start the server
startServer()
