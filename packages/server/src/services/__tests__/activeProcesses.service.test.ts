/**
 * Tests for ActiveProcessesTracker
 *
 * In-memory tracking of active test execution processes for UI state consistency.
 *
 * Test Coverage:
 * - Process management (add, remove)
 * - Active process queries (groups, tests, run-all)
 * - Connection status (WebSocket integration)
 * - Automatic cleanup (30min timeout)
 * - Force reset functionality
 * - Edge cases and concurrent operations
 *
 * Target Coverage: 85%+
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {ActiveProcessesTracker} from '../activeProcesses.service'
import * as LoggerUtil from '../../utils/logger.util'

describe('ActiveProcessesTracker', () => {
    let tracker: ActiveProcessesTracker

    beforeEach(() => {
        // Mock Logger methods
        vi.spyOn(LoggerUtil.Logger, 'info').mockImplementation(() => {})
        vi.spyOn(LoggerUtil.Logger, 'warn').mockImplementation(() => {})
        vi.spyOn(LoggerUtil.Logger, 'debug').mockImplementation(() => {})

        // Clear date mocks
        vi.useRealTimers()

        // Create fresh tracker instance
        tracker = new ActiveProcessesTracker()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Initialization', () => {
        it('should initialize with no active processes', () => {
            const processes = tracker.getActiveProcesses()
            expect(processes).toHaveLength(0)
        })

        it('should log initialization', () => {
            expect(LoggerUtil.Logger.info).toHaveBeenCalledWith(
                'ActiveProcessesTracker initialized'
            )
        })

        it('should not have any running processes initially', () => {
            expect(tracker.isAnyProcessRunning()).toBe(false)
        })

        it('should not have run-all active initially', () => {
            expect(tracker.isRunAllActive()).toBe(false)
        })

        it('should return empty array for active groups initially', () => {
            expect(tracker.getActiveGroups()).toHaveLength(0)
        })
    })

    describe('addProcess()', () => {
        it('should add run-all process', () => {
            tracker.addProcess({
                runId: 'run-all-1',
                type: 'run-all',
                totalTests: 100,
            })

            const processes = tracker.getActiveProcesses()
            expect(processes).toHaveLength(1)
            expect(processes[0]).toMatchObject({
                id: 'run-all-1',
                type: 'run-all',
                details: {
                    runId: 'run-all-1',
                    totalTests: 100,
                },
            })
        })

        it('should add run-group process', () => {
            tracker.addProcess({
                runId: 'run-group-1',
                type: 'run-group',
                filePath: 'tests/example.spec.ts',
                totalTests: 10,
            })

            const processes = tracker.getActiveProcesses()
            expect(processes).toHaveLength(1)
            expect(processes[0]).toMatchObject({
                id: 'run-group-1',
                type: 'run-group',
                details: {
                    filePath: 'tests/example.spec.ts',
                },
            })
        })

        it('should add rerun process', () => {
            tracker.addProcess({
                runId: 'rerun-1',
                type: 'rerun',
                testId: 'test-123',
                originalTestId: 'original-test-123',
            })

            const processes = tracker.getActiveProcesses()
            expect(processes).toHaveLength(1)
            expect(processes[0]).toMatchObject({
                id: 'rerun-1',
                type: 'rerun',
                details: {
                    testId: 'test-123',
                    originalTestId: 'original-test-123',
                },
            })
        })

        it('should include startedAt timestamp', () => {
            const beforeTime = new Date().toISOString()
            tracker.addProcess({runId: 'test-1', type: 'run-all'})
            const afterTime = new Date().toISOString()

            const processes = tracker.getActiveProcesses()
            const startedAt = processes[0].startedAt

            expect(startedAt >= beforeTime).toBe(true)
            expect(startedAt <= afterTime).toBe(true)
        })

        it('should log process addition', () => {
            tracker.addProcess({
                runId: 'test-1',
                type: 'run-all',
            })

            expect(LoggerUtil.Logger.info).toHaveBeenCalledWith(
                'Added active process: test-1 (run-all)'
            )
        })

        it('should add multiple processes', () => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})
            tracker.addProcess({runId: 'run-2', type: 'run-group', filePath: 'test.spec.ts'})
            tracker.addProcess({runId: 'run-3', type: 'rerun', testId: 'test-123'})

            const processes = tracker.getActiveProcesses()
            expect(processes).toHaveLength(3)
        })

        it('should handle duplicate runId by overwriting', () => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})
            tracker.addProcess({runId: 'run-1', type: 'run-group', filePath: 'test.spec.ts'})

            const processes = tracker.getActiveProcesses()
            expect(processes).toHaveLength(1)
            expect(processes[0].type).toBe('run-group')
        })
    })

    describe('removeProcess()', () => {
        beforeEach(() => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})
            tracker.addProcess({runId: 'run-2', type: 'run-group', filePath: 'test.spec.ts'})
        })

        it('should remove existing process', () => {
            tracker.removeProcess('run-1')

            const processes = tracker.getActiveProcesses()
            expect(processes).toHaveLength(1)
            expect(processes[0].id).toBe('run-2')
        })

        it('should log successful removal', () => {
            tracker.removeProcess('run-1')

            expect(LoggerUtil.Logger.info).toHaveBeenCalledWith('Removed active process: run-1')
        })

        it('should log warning for non-existent process', () => {
            tracker.removeProcess('non-existent')

            expect(LoggerUtil.Logger.warn).toHaveBeenCalledWith(
                'Attempted to remove non-existent process: non-existent'
            )
        })

        it('should handle removing all processes', () => {
            tracker.removeProcess('run-1')
            tracker.removeProcess('run-2')

            expect(tracker.getActiveProcesses()).toHaveLength(0)
            expect(tracker.isAnyProcessRunning()).toBe(false)
        })

        it('should not throw when removing from empty tracker', () => {
            const emptyTracker = new ActiveProcessesTracker()

            expect(() => emptyTracker.removeProcess('run-1')).not.toThrow()
        })
    })

    describe('getActiveProcesses()', () => {
        it('should return all active processes', () => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})
            tracker.addProcess({runId: 'run-2', type: 'run-group', filePath: 'test.spec.ts'})

            const processes = tracker.getActiveProcesses()

            expect(processes).toHaveLength(2)
            expect(processes[0].id).toBe('run-1')
            expect(processes[1].id).toBe('run-2')
        })

        it('should return empty array when no processes', () => {
            const processes = tracker.getActiveProcesses()

            expect(processes).toEqual([])
        })

        it('should return copy of processes (not affect internal state)', () => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})

            const processes = tracker.getActiveProcesses()
            processes.push({
                id: 'fake',
                type: 'run-all',
                startedAt: new Date().toISOString(),
                details: {},
            } as any)

            expect(tracker.getActiveProcesses()).toHaveLength(1)
        })
    })

    describe('getActiveGroups()', () => {
        it('should return file paths for run-group processes', () => {
            tracker.addProcess({
                runId: 'group-1',
                type: 'run-group',
                filePath: 'tests/auth.spec.ts',
            })
            tracker.addProcess({
                runId: 'group-2',
                type: 'run-group',
                filePath: 'tests/login.spec.ts',
            })

            const groups = tracker.getActiveGroups()

            expect(groups).toHaveLength(2)
            expect(groups).toContain('tests/auth.spec.ts')
            expect(groups).toContain('tests/login.spec.ts')
        })

        it('should not include run-all processes', () => {
            tracker.addProcess({runId: 'run-all-1', type: 'run-all'})
            tracker.addProcess({
                runId: 'group-1',
                type: 'run-group',
                filePath: 'tests/test.spec.ts',
            })

            const groups = tracker.getActiveGroups()

            expect(groups).toHaveLength(1)
            expect(groups[0]).toBe('tests/test.spec.ts')
        })

        it('should not include rerun processes', () => {
            tracker.addProcess({runId: 'rerun-1', type: 'rerun', testId: 'test-123'})
            tracker.addProcess({
                runId: 'group-1',
                type: 'run-group',
                filePath: 'tests/test.spec.ts',
            })

            const groups = tracker.getActiveGroups()

            expect(groups).toHaveLength(1)
        })

        it('should return empty array when no groups running', () => {
            tracker.addProcess({runId: 'run-all-1', type: 'run-all'})

            const groups = tracker.getActiveGroups()

            expect(groups).toEqual([])
        })

        it('should filter out groups without filePath', () => {
            tracker.addProcess({runId: 'group-1', type: 'run-group'} as any)
            tracker.addProcess({
                runId: 'group-2',
                type: 'run-group',
                filePath: 'tests/test.spec.ts',
            })

            const groups = tracker.getActiveGroups()

            expect(groups).toHaveLength(1)
            expect(groups[0]).toBe('tests/test.spec.ts')
        })
    })

    describe('isAnyProcessRunning()', () => {
        it('should return true when processes are running', () => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})

            expect(tracker.isAnyProcessRunning()).toBe(true)
        })

        it('should return false when no processes running', () => {
            expect(tracker.isAnyProcessRunning()).toBe(false)
        })

        it('should return false after removing all processes', () => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})
            tracker.removeProcess('run-1')

            expect(tracker.isAnyProcessRunning()).toBe(false)
        })
    })

    describe('isProcessRunning()', () => {
        beforeEach(() => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})
        })

        it('should return true for running process', () => {
            expect(tracker.isProcessRunning('run-1')).toBe(true)
        })

        it('should return false for non-existent process', () => {
            expect(tracker.isProcessRunning('non-existent')).toBe(false)
        })

        it('should return false after process is removed', () => {
            tracker.removeProcess('run-1')

            expect(tracker.isProcessRunning('run-1')).toBe(false)
        })
    })

    describe('isRunAllActive()', () => {
        it('should return true when run-all is active', () => {
            tracker.addProcess({runId: 'run-all-1', type: 'run-all'})

            expect(tracker.isRunAllActive()).toBe(true)
        })

        it('should return false when only groups are running', () => {
            tracker.addProcess({
                runId: 'group-1',
                type: 'run-group',
                filePath: 'tests/test.spec.ts',
            })

            expect(tracker.isRunAllActive()).toBe(false)
        })

        it('should return false when no processes running', () => {
            expect(tracker.isRunAllActive()).toBe(false)
        })

        it('should return true when run-all is running alongside groups', () => {
            tracker.addProcess({runId: 'run-all-1', type: 'run-all'})
            tracker.addProcess({
                runId: 'group-1',
                type: 'run-group',
                filePath: 'tests/test.spec.ts',
            })

            expect(tracker.isRunAllActive()).toBe(true)
        })
    })

    describe('isGroupRunning()', () => {
        beforeEach(() => {
            tracker.addProcess({
                runId: 'group-1',
                type: 'run-group',
                filePath: 'tests/auth.spec.ts',
            })
        })

        it('should return true when specific group is running', () => {
            expect(tracker.isGroupRunning('tests/auth.spec.ts')).toBe(true)
        })

        it('should return false for non-running group', () => {
            expect(tracker.isGroupRunning('tests/login.spec.ts')).toBe(false)
        })

        it('should return false when run-all is active but not specific group', () => {
            tracker.addProcess({runId: 'run-all-1', type: 'run-all'})

            expect(tracker.isGroupRunning('tests/other.spec.ts')).toBe(false)
        })

        it('should be case-sensitive for file paths', () => {
            expect(tracker.isGroupRunning('tests/Auth.spec.ts')).toBe(false)
            expect(tracker.isGroupRunning('tests/auth.spec.ts')).toBe(true)
        })
    })

    describe('isTestRunning()', () => {
        beforeEach(() => {
            tracker.addProcess({
                runId: 'rerun-1',
                type: 'rerun',
                testId: 'test-123',
                originalTestId: 'original-123',
            })
        })

        it('should return true when test is running by testId', () => {
            expect(tracker.isTestRunning('test-123')).toBe(true)
        })

        it('should return true when test is running by originalTestId', () => {
            expect(tracker.isTestRunning('original-123')).toBe(true)
        })

        it('should return false for non-running test', () => {
            expect(tracker.isTestRunning('test-456')).toBe(false)
        })

        it('should return false for non-rerun processes', () => {
            tracker.addProcess({runId: 'run-all-1', type: 'run-all'})

            expect(tracker.isTestRunning('any-test')).toBe(false)
        })
    })

    describe('getConnectionStatus()', () => {
        it('should return connection status with active processes', () => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})
            tracker.addProcess({
                runId: 'group-1',
                type: 'run-group',
                filePath: 'tests/test.spec.ts',
            })

            const status = tracker.getConnectionStatus()

            expect(status).toMatchObject({
                activeRuns: expect.arrayContaining([
                    expect.objectContaining({id: 'run-1'}),
                    expect.objectContaining({id: 'group-1'}),
                ]),
                activeGroups: ['tests/test.spec.ts'],
                isAnyProcessRunning: true,
            })
        })

        it('should return empty status when no processes running', () => {
            const status = tracker.getConnectionStatus()

            expect(status).toMatchObject({
                activeRuns: [],
                activeGroups: [],
                isAnyProcessRunning: false,
            })
        })

        it('should trigger cleanup of old processes', () => {
            vi.useFakeTimers()
            const now = new Date('2024-01-01T12:00:00Z')
            vi.setSystemTime(now)

            // Add old process (31 minutes ago)
            tracker.addProcess({runId: 'old-run', type: 'run-all'})

            // Move time forward 31 minutes
            vi.setSystemTime(new Date('2024-01-01T12:31:00Z'))

            const status = tracker.getConnectionStatus()

            // Old process should be cleaned up (>30 min)
            expect(status.activeRuns).toHaveLength(0)
            expect(LoggerUtil.Logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up old process: old-run')
            )

            vi.useRealTimers()
        })
    })

    describe('cleanupOldProcesses()', () => {
        it('should remove processes older than 30 minutes by default', () => {
            vi.useFakeTimers()
            const now = new Date('2024-01-01T12:00:00Z')
            vi.setSystemTime(now)

            tracker.addProcess({runId: 'old-run', type: 'run-all'})

            // Move time forward 31 minutes
            vi.setSystemTime(new Date('2024-01-01T12:31:00Z'))

            tracker.cleanupOldProcesses()

            expect(tracker.getActiveProcesses()).toHaveLength(0)
            expect(LoggerUtil.Logger.info).toHaveBeenCalledWith('Cleaned up 1 old processes')

            vi.useRealTimers()
        })

        it('should keep processes younger than 30 minutes', () => {
            vi.useFakeTimers()
            const now = new Date('2024-01-01T12:00:00Z')
            vi.setSystemTime(now)

            tracker.addProcess({runId: 'recent-run', type: 'run-all'})

            // Move time forward 29 minutes (not enough for cleanup)
            vi.setSystemTime(new Date('2024-01-01T12:29:00Z'))

            tracker.cleanupOldProcesses()

            expect(tracker.getActiveProcesses()).toHaveLength(1)

            vi.useRealTimers()
        })

        it('should accept custom max age in minutes', () => {
            vi.useFakeTimers()
            const now = new Date('2024-01-01T12:00:00Z')
            vi.setSystemTime(now)

            tracker.addProcess({runId: 'run-1', type: 'run-all'})

            // Move time forward 11 minutes
            vi.setSystemTime(new Date('2024-01-01T12:11:00Z'))

            tracker.cleanupOldProcesses(10) // 10 minute timeout

            expect(tracker.getActiveProcesses()).toHaveLength(0)

            vi.useRealTimers()
        })

        it('should not log when no processes to clean', () => {
            tracker.cleanupOldProcesses()

            expect(LoggerUtil.Logger.info).not.toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up')
            )
        })

        it('should clean multiple old processes', () => {
            vi.useFakeTimers()
            const now = new Date('2024-01-01T12:00:00Z')
            vi.setSystemTime(now)

            tracker.addProcess({runId: 'old-1', type: 'run-all'})
            tracker.addProcess({runId: 'old-2', type: 'run-group', filePath: 'test.spec.ts'})

            vi.setSystemTime(new Date('2024-01-01T12:31:00Z'))

            tracker.cleanupOldProcesses()

            expect(tracker.getActiveProcesses()).toHaveLength(0)
            expect(LoggerUtil.Logger.info).toHaveBeenCalledWith('Cleaned up 2 old processes')

            vi.useRealTimers()
        })
    })

    describe('forceReset()', () => {
        beforeEach(() => {
            tracker.addProcess({runId: 'run-1', type: 'run-all'})
            tracker.addProcess({runId: 'run-2', type: 'run-group', filePath: 'test.spec.ts'})
            tracker.addProcess({runId: 'run-3', type: 'rerun', testId: 'test-123'})
        })

        it('should clear all processes', () => {
            tracker.forceReset()

            expect(tracker.getActiveProcesses()).toHaveLength(0)
            expect(tracker.isAnyProcessRunning()).toBe(false)
        })

        it('should log force reset with count', () => {
            tracker.forceReset()

            expect(LoggerUtil.Logger.warn).toHaveBeenCalledWith(
                '🚨 Force reset: cleared 3 processes'
            )
        })

        it('should work on empty tracker', () => {
            const emptyTracker = new ActiveProcessesTracker()

            emptyTracker.forceReset()

            expect(LoggerUtil.Logger.warn).toHaveBeenCalledWith(
                '🚨 Force reset: cleared 0 processes'
            )
        })

        it('should reset all tracking state', () => {
            tracker.forceReset()

            expect(tracker.isRunAllActive()).toBe(false)
            expect(tracker.getActiveGroups()).toHaveLength(0)
            expect(tracker.isGroupRunning('test.spec.ts')).toBe(false)
            expect(tracker.isTestRunning('test-123')).toBe(false)
        })
    })

    describe('Edge Cases and Concurrent Operations', () => {
        it('should handle rapid process additions', () => {
            for (let i = 0; i < 100; i++) {
                tracker.addProcess({runId: `run-${i}`, type: 'run-all'})
            }

            expect(tracker.getActiveProcesses()).toHaveLength(100)
        })

        it('should handle rapid process removals', () => {
            for (let i = 0; i < 50; i++) {
                tracker.addProcess({runId: `run-${i}`, type: 'run-all'})
            }

            for (let i = 0; i < 50; i++) {
                tracker.removeProcess(`run-${i}`)
            }

            expect(tracker.getActiveProcesses()).toHaveLength(0)
        })

        it('should handle concurrent operations', async () => {
            const promises = []

            for (let i = 0; i < 10; i++) {
                promises.push(
                    Promise.resolve(tracker.addProcess({runId: `run-${i}`, type: 'run-all'}))
                )
            }

            await Promise.all(promises)

            expect(tracker.getActiveProcesses()).toHaveLength(10)
        })

        it('should handle very long runId', () => {
            const longRunId = 'a'.repeat(10000)

            tracker.addProcess({runId: longRunId, type: 'run-all'})

            expect(tracker.isProcessRunning(longRunId)).toBe(true)
        })

        it('should handle special characters in runId', () => {
            const specialRunId = 'run-!@#$%^&*()_+-=[]{}|;:",.<>?'

            tracker.addProcess({runId: specialRunId, type: 'run-all'})

            expect(tracker.isProcessRunning(specialRunId)).toBe(true)
        })

        it('should handle Unicode in file paths', () => {
            tracker.addProcess({
                runId: 'unicode-run',
                type: 'run-group',
                filePath: 'tests/тест.spec.ts',
            })

            expect(tracker.isGroupRunning('tests/тест.spec.ts')).toBe(true)
        })

        it('should maintain isolation between different process types', () => {
            tracker.addProcess({runId: 'same-id', type: 'run-all'})
            // This will overwrite the previous one
            tracker.addProcess({runId: 'same-id', type: 'run-group', filePath: 'test.spec.ts'})

            expect(tracker.getActiveProcesses()).toHaveLength(1)
            expect(tracker.getActiveProcesses()[0].type).toBe('run-group')
        })
    })
})
