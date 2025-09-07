import { Request } from 'express'
import { TestService } from '../services/test.service'
import { PlaywrightService } from '../services/playwright.service'
import { WebSocketService } from '../services/websocket.service'
import { AttachmentService } from '../services/attachment.service'

// API Response types (compatible with yshvydakReporter.ts)
export interface ApiResponse<T = any> {
    success: boolean
    data?: T
    error?: string
    message?: string
    timestamp: string
    count?: number
}

// Test Discovery types
export interface TestDiscoveryResult {
    discovered: number
    saved: number
    timestamp: string
}

// Test Run types
export interface TestRunProcess {
    runId: string
    message: string
    timestamp: string
}

// Test Filters
export interface TestFilters {
    runId?: string
    status?: string
    limit?: number
}

// Request with injected services
export interface ServiceRequest extends Request {
    services?: {
        testService?: TestService
        playwrightService?: PlaywrightService
        websocketService?: WebSocketService
        attachmentService?: AttachmentService
    }
}

// Playlist Run Options
export interface PlaywrightRunOptions {
    type: 'run-all' | 'run-group' | 'rerun'
    filePath?: string
    testName?: string
    runId: string
}

// WebSocket Message
export interface WebSocketMessage {
    type: string
    data: any
}