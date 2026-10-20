import {IWebSocketService, WebSocketMessage} from '../types/service.types'
import {getWebSocketManager} from '../websocket/server'
import {Logger} from '../utils/logger.util'

export class WebSocketService implements IWebSocketService {
    broadcast(message: WebSocketMessage): void {
        const wsManager = getWebSocketManager()
        if (wsManager) {
            const clientCount = this.getConnectedClients()
            wsManager.broadcast(message)
            Logger.websocketBroadcast(message.type, clientCount)
        } else {
            Logger.warn('WebSocket manager not available for broadcasting')
        }
    }

    getConnectedClients(): number {
        const wsManager = getWebSocketManager()
        return wsManager ? (wsManager as any).clients.size : 0
    }

    broadcastRunStarted(runId: string, type: string, filePath?: string): void {
        this.broadcast({
            type: 'run:started',
            data: {runId, type, filePath},
        })
    }

    broadcastRunCompleted(runId: string, exitCode: number, type?: string, filePath?: string): void {
        this.broadcast({
            type: 'run:completed',
            data: {runId, exitCode, type, filePath},
        })
    }

    broadcastDiscoveryCompleted(total: number, saved: number, project?: string): void {
        this.broadcast({
            type: 'discovery:completed',
            data: {
                total,
                saved,
                project,
                timestamp: new Date().toISOString(),
            },
        })
    }

    broadcastDashboardRefresh(reason: string, additionalData?: any): void {
        this.broadcast({
            type: 'dashboard:refresh',
            data: {
                reason,
                timestamp: new Date().toISOString(),
                ...additionalData,
            },
        })
    }

    broadcastPipelineStarted(pipelineRunId: string, steps: PipelineStepSummary[]): void {
        this.broadcast({
            type: 'pipeline:started',
            data: {pipelineRunId, steps},
        })
    }

    broadcastPipelineStepStarted(pipelineRunId: string, project: string, runId: string): void {
        this.broadcast({
            type: 'pipeline:step-started',
            data: {pipelineRunId, project, runId},
        })
    }

    broadcastPipelineStepCompleted(pipelineRunId: string, step: PipelineStepSummary): void {
        this.broadcast({
            type: 'pipeline:step-completed',
            data: {pipelineRunId, step},
        })
    }

    /** A Stop is cleaning up; the UI shows "Stopping..." until run:cancelled. */
    broadcastRunStopping(reason: string): void {
        this.broadcast({type: 'run:stopping', data: {reason}})
    }

    /** Stop finished: the runs' data is gone and every test shows its previous result again. */
    broadcastRunCancelled(runIds: string[], reason: string, pipelineRunId?: string): void {
        this.broadcast({type: 'run:cancelled', data: {runIds, reason, pipelineRunId}})
    }

    broadcastPipelineQueueChanged(queue: PipelineQueueEntry[]): void {
        this.broadcast({
            type: 'pipeline:queue-changed',
            data: {queue},
        })
    }

    broadcastPipelineCompleted(
        pipelineRunId: string,
        status: PipelineFinishStatus,
        steps: PipelineStepSummary[]
    ): void {
        this.broadcast({
            type: 'pipeline:completed',
            data: {pipelineRunId, status, steps},
        })
    }
}

// 'paused' = CI auto-run paused between steps; 'cancelled' = stopped, the run's results were removed.
export type PipelineFinishStatus = 'completed' | 'stopped_early' | 'paused' | 'cancelled'

export interface PipelineQueueEntry {
    pipeline: string
    maxWorkers?: number
    queuedAt: string
}

export interface PipelineStepSummary {
    project: string
    displayName: string
    stopOnFailure: boolean
    status: 'queued' | 'running' | 'success' | 'failed' | 'skipped'
    workers?: number
    runId?: string
    passed?: number
    failed?: number
}
