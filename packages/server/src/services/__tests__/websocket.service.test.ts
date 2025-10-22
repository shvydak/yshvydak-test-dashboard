/**
 * Tests for WebSocketService
 *
 * Real-time WebSocket broadcasting service for dashboard updates.
 *
 * Test Coverage:
 * - broadcast() - Generic message broadcasting
 * - getConnectedClients() - Client count retrieval
 * - broadcastRunStarted() - Run start notifications
 * - broadcastRunCompleted() - Run completion notifications
 * - broadcastDiscoveryCompleted() - Discovery completion notifications
 * - broadcastDashboardRefresh() - Dashboard refresh triggers
 * - WebSocket manager integration
 * - Error handling and edge cases
 *
 * Target Coverage: 85%+
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {WebSocketService} from '../websocket.service'
import * as WebSocketServer from '../../websocket/server'
import * as LoggerUtil from '../../utils/logger.util'

describe('WebSocketService', () => {
    let service: WebSocketService
    let mockWsManager: any

    beforeEach(() => {
        // Create mock WebSocket manager
        mockWsManager = {
            broadcast: vi.fn(),
            clients: new Map(),
        }

        // Mock getWebSocketManager to return our mock
        vi.spyOn(WebSocketServer, 'getWebSocketManager').mockReturnValue(mockWsManager)

        // Mock Logger methods
        vi.spyOn(LoggerUtil.Logger, 'websocketBroadcast').mockImplementation(() => {})
        vi.spyOn(LoggerUtil.Logger, 'warn').mockImplementation(() => {})

        // Create service instance
        service = new WebSocketService()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('broadcast()', () => {
        it('should broadcast message when WebSocket manager is available', () => {
            const message = {
                type: 'test:event',
                data: {testId: '123', status: 'passed'},
            }

            service.broadcast(message)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(message)
        })

        it('should log broadcast with client count', () => {
            mockWsManager.clients = new Map([
                ['client-1', {}],
                ['client-2', {}],
                ['client-3', {}],
            ])

            const message = {type: 'test:event', data: {}}

            service.broadcast(message)

            expect(LoggerUtil.Logger.websocketBroadcast).toHaveBeenCalledWith('test:event', 3)
        })

        it('should log warning when WebSocket manager is not available', () => {
            vi.spyOn(WebSocketServer, 'getWebSocketManager').mockReturnValue(null)

            const message = {type: 'test:event', data: {}}

            service.broadcast(message)

            expect(LoggerUtil.Logger.warn).toHaveBeenCalledWith(
                'WebSocket manager not available for broadcasting'
            )
            expect(mockWsManager.broadcast).not.toHaveBeenCalled()
        })

        it('should handle complex message data', () => {
            const message = {
                type: 'complex:event',
                data: {
                    nested: {
                        deep: {
                            value: 123,
                            array: [1, 2, 3],
                        },
                    },
                    timestamp: '2024-01-01T00:00:00Z',
                },
            }

            service.broadcast(message)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(message)
        })

        it('should handle message with undefined data', () => {
            const message = {type: 'test:event', data: undefined}

            service.broadcast(message)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(message)
        })

        it('should handle message with null data', () => {
            const message = {type: 'test:event', data: null}

            service.broadcast(message)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(message)
        })

        it('should handle empty message data', () => {
            const message = {type: 'test:event', data: {}}

            service.broadcast(message)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(message)
        })
    })

    describe('getConnectedClients()', () => {
        it('should return correct client count when clients are connected', () => {
            mockWsManager.clients = new Map([
                ['client-1', {}],
                ['client-2', {}],
                ['client-3', {}],
            ])

            const count = service.getConnectedClients()

            expect(count).toBe(3)
        })

        it('should return 0 when no clients are connected', () => {
            mockWsManager.clients = new Map()

            const count = service.getConnectedClients()

            expect(count).toBe(0)
        })

        it('should return 0 when WebSocket manager is not available', () => {
            vi.spyOn(WebSocketServer, 'getWebSocketManager').mockReturnValue(null)

            const count = service.getConnectedClients()

            expect(count).toBe(0)
        })

        it('should return 1 for single client', () => {
            mockWsManager.clients = new Map([['client-1', {}]])

            const count = service.getConnectedClients()

            expect(count).toBe(1)
        })

        it('should handle large number of clients', () => {
            const clients = new Map()
            for (let i = 0; i < 100; i++) {
                clients.set(`client-${i}`, {})
            }
            mockWsManager.clients = clients

            const count = service.getConnectedClients()

            expect(count).toBe(100)
        })
    })

    describe('broadcastRunStarted()', () => {
        it('should broadcast run started message with all parameters', () => {
            service.broadcastRunStarted('run-123', 'run-all', 'tests/example.spec.ts')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:started',
                data: {
                    runId: 'run-123',
                    type: 'run-all',
                    filePath: 'tests/example.spec.ts',
                },
            })
        })

        it('should broadcast run started message without filePath', () => {
            service.broadcastRunStarted('run-456', 'run-all')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:started',
                data: {
                    runId: 'run-456',
                    type: 'run-all',
                    filePath: undefined,
                },
            })
        })

        it('should handle run-group type', () => {
            service.broadcastRunStarted('run-789', 'run-group', 'tests/auth.spec.ts')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:started',
                data: {
                    runId: 'run-789',
                    type: 'run-group',
                    filePath: 'tests/auth.spec.ts',
                },
            })
        })

        it('should handle rerun type', () => {
            service.broadcastRunStarted('run-abc', 'rerun', 'tests/login.spec.ts')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:started',
                data: {
                    runId: 'run-abc',
                    type: 'rerun',
                    filePath: 'tests/login.spec.ts',
                },
            })
        })

        it('should handle empty filePath string', () => {
            service.broadcastRunStarted('run-empty', 'run-all', '')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:started',
                data: {
                    runId: 'run-empty',
                    type: 'run-all',
                    filePath: '',
                },
            })
        })
    })

    describe('broadcastRunCompleted()', () => {
        it('should broadcast run completed message with all parameters', () => {
            service.broadcastRunCompleted('run-123', 0, 'run-all', 'tests/example.spec.ts')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:completed',
                data: {
                    runId: 'run-123',
                    exitCode: 0,
                    type: 'run-all',
                    filePath: 'tests/example.spec.ts',
                },
            })
        })

        it('should handle successful exit code (0)', () => {
            service.broadcastRunCompleted('run-success', 0, 'run-all')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:completed',
                data: {
                    runId: 'run-success',
                    exitCode: 0,
                    type: 'run-all',
                    filePath: undefined,
                },
            })
        })

        it('should handle failed exit code (1)', () => {
            service.broadcastRunCompleted('run-failed', 1, 'run-all')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:completed',
                data: {
                    runId: 'run-failed',
                    exitCode: 1,
                    type: 'run-all',
                    filePath: undefined,
                },
            })
        })

        it('should handle error exit codes', () => {
            service.broadcastRunCompleted('run-error', 127, 'run-group')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:completed',
                data: {
                    runId: 'run-error',
                    exitCode: 127,
                    type: 'run-group',
                    filePath: undefined,
                },
            })
        })

        it('should broadcast without type and filePath', () => {
            service.broadcastRunCompleted('run-minimal', 0)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:completed',
                data: {
                    runId: 'run-minimal',
                    exitCode: 0,
                    type: undefined,
                    filePath: undefined,
                },
            })
        })

        it('should handle negative exit codes', () => {
            service.broadcastRunCompleted('run-negative', -1, 'rerun')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:completed',
                data: {
                    runId: 'run-negative',
                    exitCode: -1,
                    type: 'rerun',
                    filePath: undefined,
                },
            })
        })
    })

    describe('broadcastDiscoveryCompleted()', () => {
        it('should broadcast discovery completed message with correct data', () => {
            service.broadcastDiscoveryCompleted(50, 48)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'discovery:completed',
                data: {
                    total: 50,
                    saved: 48,
                    timestamp: expect.any(String),
                },
            })
        })

        it('should include ISO timestamp', () => {
            const beforeTime = new Date().toISOString()
            service.broadcastDiscoveryCompleted(10, 10)
            const afterTime = new Date().toISOString()

            const call = mockWsManager.broadcast.mock.calls[0][0]
            const timestamp = call.data.timestamp

            expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
            expect(timestamp >= beforeTime).toBe(true)
            expect(timestamp <= afterTime).toBe(true)
        })

        it('should handle zero tests', () => {
            service.broadcastDiscoveryCompleted(0, 0)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'discovery:completed',
                data: {
                    total: 0,
                    saved: 0,
                    timestamp: expect.any(String),
                },
            })
        })

        it('should handle large numbers', () => {
            service.broadcastDiscoveryCompleted(10000, 9999)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'discovery:completed',
                data: {
                    total: 10000,
                    saved: 9999,
                    timestamp: expect.any(String),
                },
            })
        })

        it('should handle saved being less than total (some tests skipped)', () => {
            service.broadcastDiscoveryCompleted(100, 95)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'discovery:completed',
                data: {
                    total: 100,
                    saved: 95,
                    timestamp: expect.any(String),
                },
            })
        })

        it('should handle saved equal to total', () => {
            service.broadcastDiscoveryCompleted(50, 50)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'discovery:completed',
                data: {
                    total: 50,
                    saved: 50,
                    timestamp: expect.any(String),
                },
            })
        })
    })

    describe('broadcastDashboardRefresh()', () => {
        it('should broadcast dashboard refresh with reason', () => {
            service.broadcastDashboardRefresh('test-completed')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'dashboard:refresh',
                data: {
                    reason: 'test-completed',
                    timestamp: expect.any(String),
                },
            })
        })

        it('should include ISO timestamp', () => {
            const beforeTime = new Date().toISOString()
            service.broadcastDashboardRefresh('manual-refresh')
            const afterTime = new Date().toISOString()

            const call = mockWsManager.broadcast.mock.calls[0][0]
            const timestamp = call.data.timestamp

            expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
            expect(timestamp >= beforeTime).toBe(true)
            expect(timestamp <= afterTime).toBe(true)
        })

        it('should merge additional data', () => {
            service.broadcastDashboardRefresh('test-completed', {
                testId: 'test-123',
                status: 'passed',
                duration: 1234,
            })

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'dashboard:refresh',
                data: {
                    reason: 'test-completed',
                    timestamp: expect.any(String),
                    testId: 'test-123',
                    status: 'passed',
                    duration: 1234,
                },
            })
        })

        it('should handle complex additional data', () => {
            service.broadcastDashboardRefresh('discovery-completed', {
                stats: {
                    total: 50,
                    passed: 45,
                    failed: 5,
                },
                metadata: {
                    startTime: '2024-01-01T00:00:00Z',
                },
            })

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'dashboard:refresh',
                data: {
                    reason: 'discovery-completed',
                    timestamp: expect.any(String),
                    stats: {
                        total: 50,
                        passed: 45,
                        failed: 5,
                    },
                    metadata: {
                        startTime: '2024-01-01T00:00:00Z',
                    },
                },
            })
        })

        it('should handle no additional data', () => {
            service.broadcastDashboardRefresh('manual-refresh')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'dashboard:refresh',
                data: {
                    reason: 'manual-refresh',
                    timestamp: expect.any(String),
                },
            })
        })

        it('should handle empty additional data object', () => {
            service.broadcastDashboardRefresh('refresh', {})

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'dashboard:refresh',
                data: {
                    reason: 'refresh',
                    timestamp: expect.any(String),
                },
            })
        })

        it('should handle null additional data', () => {
            service.broadcastDashboardRefresh('refresh', null as any)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'dashboard:refresh',
                data: {
                    reason: 'refresh',
                    timestamp: expect.any(String),
                },
            })
        })
    })

    describe('Integration Tests', () => {
        it('should complete full broadcast flow', () => {
            mockWsManager.clients = new Map([
                ['client-1', {}],
                ['client-2', {}],
            ])

            service.broadcast({type: 'test:event', data: {test: 'data'}})

            expect(mockWsManager.broadcast).toHaveBeenCalled()
            expect(LoggerUtil.Logger.websocketBroadcast).toHaveBeenCalledWith('test:event', 2)
        })

        it('should handle multiple sequential broadcasts', () => {
            service.broadcastRunStarted('run-1', 'run-all')
            service.broadcastDiscoveryCompleted(50, 50)
            service.broadcastRunCompleted('run-1', 0)

            expect(mockWsManager.broadcast).toHaveBeenCalledTimes(3)
        })

        it('should handle broadcast with manager becoming unavailable', () => {
            service.broadcast({type: 'test:1', data: {}})

            // Manager becomes unavailable
            vi.spyOn(WebSocketServer, 'getWebSocketManager').mockReturnValue(null)

            service.broadcast({type: 'test:2', data: {}})

            expect(mockWsManager.broadcast).toHaveBeenCalledTimes(1)
            expect(LoggerUtil.Logger.warn).toHaveBeenCalled()
        })

        it('should handle rapid broadcasts', () => {
            for (let i = 0; i < 100; i++) {
                service.broadcast({type: `test:${i}`, data: {index: i}})
            }

            expect(mockWsManager.broadcast).toHaveBeenCalledTimes(100)
        })

        it('should handle all broadcast methods in sequence', () => {
            service.broadcastRunStarted('run-1', 'run-all', 'tests/test.spec.ts')
            service.broadcastDiscoveryCompleted(10, 10)
            service.broadcastDashboardRefresh('test-completed', {testId: '123'})
            service.broadcastRunCompleted('run-1', 0, 'run-all')

            expect(mockWsManager.broadcast).toHaveBeenCalledTimes(4)

            const calls = mockWsManager.broadcast.mock.calls
            expect(calls[0][0].type).toBe('run:started')
            expect(calls[1][0].type).toBe('discovery:completed')
            expect(calls[2][0].type).toBe('dashboard:refresh')
            expect(calls[3][0].type).toBe('run:completed')
        })
    })

    describe('Edge Cases', () => {
        it('should handle very long runId', () => {
            const longRunId = 'a'.repeat(1000)
            service.broadcastRunStarted(longRunId, 'run-all')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith({
                type: 'run:started',
                data: {
                    runId: longRunId,
                    type: 'run-all',
                    filePath: undefined,
                },
            })
        })

        it('should handle special characters in runId', () => {
            const specialRunId = 'run-!@#$%^&*()_+-=[]{}|;:",.<>?'
            service.broadcastRunStarted(specialRunId, 'run-all')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        runId: specialRunId,
                    }),
                })
            )
        })

        it('should handle very long filePath', () => {
            const longPath = 'tests/' + 'deeply/nested/'.repeat(100) + 'test.spec.ts'
            service.broadcastRunStarted('run-1', 'run-group', longPath)

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        filePath: longPath,
                    }),
                })
            )
        })

        it('should handle Unicode characters in reason', () => {
            service.broadcastDashboardRefresh('тест-завершено-🎉')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        reason: 'тест-завершено-🎉',
                    }),
                })
            )
        })

        it('should handle concurrent broadcasts', async () => {
            const promises = []
            for (let i = 0; i < 10; i++) {
                promises.push(
                    Promise.resolve(service.broadcast({type: `concurrent:${i}`, data: {}}))
                )
            }

            await Promise.all(promises)

            expect(mockWsManager.broadcast).toHaveBeenCalledTimes(10)
        })

        it('should handle extremely large exit codes', () => {
            service.broadcastRunCompleted('run-large', 999999, 'run-all')

            expect(mockWsManager.broadcast).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        exitCode: 999999,
                    }),
                })
            )
        })
    })
})
