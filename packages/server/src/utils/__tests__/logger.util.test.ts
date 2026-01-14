/**
 * Logger Utility Tests
 *
 * These tests verify that logging works correctly in different environments.
 * This is IMPORTANT because:
 * 1. Ensures production logs are not cluttered with debug/info messages
 * 2. Verifies critical logs are always logged
 * 3. Tests environment-based logging behavior
 * 4. Validates message formatting
 *
 * Coverage target: 90%+
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {Logger} from '../logger.util'

describe('Logger', () => {
    let originalEnv: string | undefined
    let consoleLogSpy: ReturnType<typeof vi.spyOn>
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        // Save original NODE_ENV
        originalEnv = process.env.NODE_ENV

        // Spy on console methods
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        // Restore original NODE_ENV
        if (originalEnv !== undefined) {
            process.env.NODE_ENV = originalEnv
        } else {
            delete process.env.NODE_ENV
        }

        // Restore console spies
        vi.restoreAllMocks()
    })

    describe('Environment Detection', () => {
        it('should detect production environment', () => {
            process.env.NODE_ENV = 'production'
            Logger.info('Test message')
            expect(consoleLogSpy).not.toHaveBeenCalled()
        })

        it('should detect development environment', () => {
            process.env.NODE_ENV = 'development'
            Logger.info('Test message')
            expect(consoleLogSpy).toHaveBeenCalled()
        })

        it('should treat undefined NODE_ENV as development', () => {
            delete process.env.NODE_ENV
            Logger.info('Test message')
            expect(consoleLogSpy).toHaveBeenCalled()
        })
    })

    describe('info()', () => {
        it('should NOT log in production', () => {
            process.env.NODE_ENV = 'production'
            Logger.info('Test info message')
            expect(consoleLogSpy).not.toHaveBeenCalled()
        })

        it('should log in development', () => {
            process.env.NODE_ENV = 'development'
            Logger.info('Test info message')
            expect(consoleLogSpy).toHaveBeenCalled()
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('INFO: Test info message')
            )
        })

        it('should log when NODE_ENV is not set', () => {
            delete process.env.NODE_ENV
            Logger.info('Test info message')
            expect(consoleLogSpy).toHaveBeenCalled()
        })
    })

    describe('critical()', () => {
        it('should ALWAYS log in production', () => {
            process.env.NODE_ENV = 'production'
            Logger.critical('Critical message')
            expect(consoleLogSpy).toHaveBeenCalled()
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('INFO: Critical message')
            )
        })

        it('should ALWAYS log in development', () => {
            process.env.NODE_ENV = 'development'
            Logger.critical('Critical message')
            expect(consoleLogSpy).toHaveBeenCalled()
        })
    })

    describe('warn()', () => {
        it('should ALWAYS log in production', () => {
            process.env.NODE_ENV = 'production'
            Logger.warn('Warning message')
            expect(consoleWarnSpy).toHaveBeenCalled()
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('WARN: Warning message')
            )
        })

        it('should ALWAYS log in development', () => {
            process.env.NODE_ENV = 'development'
            Logger.warn('Warning message')
            expect(consoleWarnSpy).toHaveBeenCalled()
        })
    })

    describe('error()', () => {
        it('should ALWAYS log in production', () => {
            process.env.NODE_ENV = 'production'
            const testError = new Error('Test error')
            Logger.error('Error message', testError)
            expect(consoleErrorSpy).toHaveBeenCalledTimes(2) // Message + error object
            expect(consoleErrorSpy).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining('ERROR: Error message')
            )
            expect(consoleErrorSpy).toHaveBeenNthCalledWith(2, testError)
        })

        it('should ALWAYS log in development', () => {
            process.env.NODE_ENV = 'development'
            Logger.error('Error message')
            expect(consoleErrorSpy).toHaveBeenCalled()
        })

        it('should log error object when provided', () => {
            process.env.NODE_ENV = 'development'
            const testError = new Error('Test error')
            Logger.error('Error message', testError)
            expect(consoleErrorSpy).toHaveBeenCalledWith(testError)
        })

        it('should work without error object', () => {
            process.env.NODE_ENV = 'development'
            Logger.error('Error message')
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
        })
    })

    describe('success()', () => {
        it('should NOT log in production', () => {
            process.env.NODE_ENV = 'production'
            Logger.success('Success message')
            expect(consoleLogSpy).not.toHaveBeenCalled()
        })

        it('should log in development', () => {
            process.env.NODE_ENV = 'development'
            Logger.success('Success message')
            expect(consoleLogSpy).toHaveBeenCalled()
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('SUCCESS: Success message')
            )
        })
    })

    describe('debug()', () => {
        it('should NOT log in production', () => {
            process.env.NODE_ENV = 'production'
            Logger.debug('Debug message')
            expect(consoleLogSpy).not.toHaveBeenCalled()
        })

        it('should log in development', () => {
            process.env.NODE_ENV = 'development'
            Logger.debug('Debug message')
            expect(consoleLogSpy).toHaveBeenCalled()
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('DEBUG: Debug message')
            )
        })
    })

    describe('Message Formatting', () => {
        it('should format messages with timestamp and emoji', () => {
            process.env.NODE_ENV = 'development'
            Logger.info('Test message')
            const call = consoleLogSpy.mock.calls[0][0] as string
            expect(call).toMatch(/🔵 \[.*\] INFO: Test message/)
            expect(call).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // ISO timestamp
        })

        it('should include emoji for different log levels', () => {
            process.env.NODE_ENV = 'development'
            Logger.warn('Warning')
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️'))
            Logger.error('Error')
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('❌'))
            Logger.success('Success')
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅'))
            Logger.debug('Debug')
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🐛'))
        })

        it('should include additional arguments in JSON format', () => {
            process.env.NODE_ENV = 'development'
            Logger.info('Test message', {key: 'value'}, 123)
            const call = consoleLogSpy.mock.calls[0][0] as string
            expect(call).toContain('{"key":"value"}')
            expect(call).toContain('123')
        })
    })

    describe('Specific Logger Methods', () => {
        it('should use success() for testDiscovery', () => {
            process.env.NODE_ENV = 'development'
            Logger.testDiscovery(10, 8)
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Discovered 10 tests, saved 8')
            )
        })

        it('should use info() for testRun', () => {
            process.env.NODE_ENV = 'development'
            Logger.testRun('run-all', 'run-123')
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Starting run-all with run ID: run-123')
            )
        })

        it('should use info() for testRerun', () => {
            process.env.NODE_ENV = 'development'
            Logger.testRerun('Test Name', 'run-456')
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Rerunning test "Test Name" with run ID: run-456')
            )
        })

        it('should use debug() for websocketBroadcast', () => {
            process.env.NODE_ENV = 'development'
            Logger.websocketBroadcast('test:status', 5)
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Broadcasting test:status to 5 clients')
            )
        })

        it('should use critical() for serverStart', () => {
            process.env.NODE_ENV = 'production'
            Logger.serverStart(3001)
            expect(consoleLogSpy).toHaveBeenCalledTimes(2) // Two critical logs
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('🚀 YShvydak Test Dashboard Server running on port')
            )
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('📊 Health check: http://localhost:3001/api/health')
            )
        })
    })

    describe('Production Logging Behavior', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'production'
        })

        it('should only log critical, warn, and error in production', () => {
            Logger.info('Info message')
            Logger.debug('Debug message')
            Logger.success('Success message')
            Logger.critical('Critical message')
            Logger.warn('Warning message')
            Logger.error('Error message')

            // Only critical, warn, and error should be logged
            expect(consoleLogSpy).toHaveBeenCalledTimes(1) // Only critical
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1) // warn
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1) // error
        })
    })

    describe('Development Logging Behavior', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'development'
        })

        it('should log all levels in development', () => {
            Logger.info('Info message')
            Logger.debug('Debug message')
            Logger.success('Success message')
            Logger.critical('Critical message')
            Logger.warn('Warning message')
            Logger.error('Error message')

            // All should be logged
            expect(consoleLogSpy).toHaveBeenCalledTimes(4) // info, success, critical, debug
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1) // warn
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1) // error
        })
    })

    describe('Integration with Services', () => {
        it('should not log debug messages in production (WebSocket scenario)', () => {
            process.env.NODE_ENV = 'production'
            // Simulate WebSocket connection logging
            Logger.debug('WebSocket client connected: client-123')
            expect(consoleLogSpy).not.toHaveBeenCalled()
        })

        it('should not log info messages in production (AttachmentManager scenario)', () => {
            process.env.NODE_ENV = 'production'
            // Simulate attachment operation logging
            Logger.info('Copied attachment: /source/file.png -> /target/file.png')
            expect(consoleLogSpy).not.toHaveBeenCalled()
        })

        it('should always log critical messages in production (DatabaseManager scenario)', () => {
            process.env.NODE_ENV = 'production'
            // Simulate database connection logging
            Logger.critical('Database connected successfully: /path/to/db')
            expect(consoleLogSpy).toHaveBeenCalled()
        })

        it('should always log errors in production', () => {
            process.env.NODE_ENV = 'production'
            const error = new Error('Test error')
            Logger.error('Operation failed', error)
            expect(consoleErrorSpy).toHaveBeenCalledTimes(2) // Message + error
        })

        it('should always log warnings in production', () => {
            process.env.NODE_ENV = 'production'
            Logger.warn('Potential issue detected')
            expect(consoleWarnSpy).toHaveBeenCalled()
        })
    })
})
