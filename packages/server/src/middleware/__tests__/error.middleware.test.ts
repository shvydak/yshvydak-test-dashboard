/**
 * Error Middleware Tests (CRITICAL)
 *
 * These tests verify the error handling middleware functions correctly.
 * This is CRITICAL because:
 * 1. All errors in the application flow through this middleware
 * 2. Proper error responses ensure good API design
 * 3. Security - preventing stack trace leaks in production
 * 4. User experience - clear error messages
 *
 * Coverage target: 75%+
 */

import {describe, it, expect, beforeEach, vi, Mock} from 'vitest'
import {Request, Response, NextFunction} from 'express'
import {errorHandler, notFoundHandler} from '../error.middleware'
import {ResponseHelper} from '../../utils/response.helper'
import {Logger} from '../../utils/logger.util'

// Mock Logger
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}))

// Mock ResponseHelper
vi.mock('../../utils/response.helper', () => ({
    ResponseHelper: {
        badRequest: vi.fn(),
        notFound: vi.fn(),
        serverError: vi.fn(),
    },
}))

// Helper function to create mock Express request
function createMockRequest(overrides?: Partial<Request>): Partial<Request> {
    return {
        path: '/api/tests',
        method: 'GET',
        originalUrl: '/api/tests',
        headers: {},
        ...overrides,
    }
}

// Helper function to create mock Express response
function createMockResponse(): Partial<Response> {
    const res: Partial<Response> = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    }
    return res
}

// Helper function to create mock NextFunction
function createMockNext(): NextFunction {
    return vi.fn()
}

describe('Error Middleware', () => {
    let req: Partial<Request>
    let res: Partial<Response>
    let next: NextFunction

    beforeEach(() => {
        vi.clearAllMocks()
        req = createMockRequest()
        res = createMockResponse()
        next = createMockNext()
    })

    describe('errorHandler', () => {
        describe('Error Types', () => {
            it('should handle ValidationError with 400 status', () => {
                // Arrange
                const error = new Error('Invalid input')
                error.name = 'ValidationError'

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.badRequest).toHaveBeenCalledWith(res, 'Invalid input')
            })

            it('should handle NotFoundError with 404 status', () => {
                // Arrange
                const error = {
                    name: 'NotFoundError',
                    message: 'Test not found',
                    resource: 'Test',
                }

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.notFound).toHaveBeenCalledWith(res, 'Test')
            })

            it('should handle NotFoundError without resource field', () => {
                // Arrange
                const error = {
                    name: 'NotFoundError',
                    message: 'Not found',
                }

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.notFound).toHaveBeenCalledWith(res, 'Resource')
            })

            it('should handle generic Error with 500 status', () => {
                // Arrange
                const error = new Error('Something went wrong')

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, 'Something went wrong')
            })

            it('should handle custom error types as server errors', () => {
                // Arrange
                const error = {
                    name: 'CustomError',
                    message: 'Custom error occurred',
                }

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(
                    res,
                    'Custom error occurred'
                )
            })

            it('should handle error without message', () => {
                // Arrange
                const error = new Error()

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, '')
            })

            it('should handle non-Error objects', () => {
                // Arrange
                const error = 'String error'

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, undefined)
            })

            it('should handle errors with undefined message property', () => {
                // Arrange
                const error = {name: 'CustomError'}

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, undefined)
            })
        })

        describe('Error Logging', () => {
            it('should always log errors to Logger.error', () => {
                // Arrange
                const error = new Error('Test error')

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledTimes(1)
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
            })

            it('should log ValidationError', () => {
                // Arrange
                const error = new Error('Validation failed')
                error.name = 'ValidationError'

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
            })

            it('should log NotFoundError', () => {
                // Arrange
                const error = {name: 'NotFoundError', message: 'Not found', resource: 'User'}

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
            })
        })

        describe('Response Formatting', () => {
            it('should use ResponseHelper.badRequest for ValidationError', () => {
                // Arrange
                const error = new Error('Invalid data')
                error.name = 'ValidationError'

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(ResponseHelper.badRequest).toHaveBeenCalledWith(res, 'Invalid data')
                expect(ResponseHelper.notFound).not.toHaveBeenCalled()
                expect(ResponseHelper.serverError).not.toHaveBeenCalled()
            })

            it('should use ResponseHelper.notFound for NotFoundError', () => {
                // Arrange
                const error = {name: 'NotFoundError', message: 'Not found', resource: 'Test'}

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(ResponseHelper.notFound).toHaveBeenCalledWith(res, 'Test')
                expect(ResponseHelper.badRequest).not.toHaveBeenCalled()
                expect(ResponseHelper.serverError).not.toHaveBeenCalled()
            })

            it('should use ResponseHelper.serverError for generic errors', () => {
                // Arrange
                const error = new Error('Server error')

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, 'Server error')
                expect(ResponseHelper.badRequest).not.toHaveBeenCalled()
                expect(ResponseHelper.notFound).not.toHaveBeenCalled()
            })
        })

        describe('Edge Cases', () => {
            it('should handle errors with special characters in message', () => {
                // Arrange
                const error = new Error('Error: <script>alert("xss")</script>')

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(
                    res,
                    'Error: <script>alert("xss")</script>'
                )
            })

            it('should handle errors with very long messages', () => {
                // Arrange
                const longMessage = 'A'.repeat(10000)
                const error = new Error(longMessage)

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, longMessage)
            })

            it('should handle errors with Unicode characters', () => {
                // Arrange
                const error = new Error('Ошибка сервера 🚨')

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, 'Ошибка сервера 🚨')
            })

            it('should handle errors with stack traces', () => {
                // Arrange
                const error = new Error('Error with stack')
                error.stack =
                    'Error: Error with stack\n    at Object.<anonymous> (/path/to/file.js:10:15)'

                // Act
                errorHandler(error, req as Request, res as Response, next)

                // Assert
                expect(Logger.error).toHaveBeenCalledWith('Server error:', error)
                expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, 'Error with stack')
            })
        })
    })

    describe('notFoundHandler', () => {
        it('should return 404 with error message', () => {
            // Arrange
            const req = createMockRequest({originalUrl: '/api/nonexistent'})
            const res = createMockResponse()

            // Act
            notFoundHandler(req as Request, res as Response)

            // Assert
            expect(res.status).toHaveBeenCalledWith(404)
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not found',
                path: '/api/nonexistent',
                timestamp: expect.any(String),
            })
        })

        it('should include the original URL in response', () => {
            // Arrange
            const req = createMockRequest({originalUrl: '/api/tests/123/unknown'})
            const res = createMockResponse()

            // Act
            notFoundHandler(req as Request, res as Response)

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not found',
                path: '/api/tests/123/unknown',
                timestamp: expect.any(String),
            })
        })

        it('should include valid ISO timestamp', () => {
            // Arrange
            const req = createMockRequest()
            const res = createMockResponse()

            // Act
            notFoundHandler(req as Request, res as Response)

            // Assert
            const jsonCall = (res.json as Mock).mock.calls[0][0]
            expect(jsonCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
            expect(() => new Date(jsonCall.timestamp)).not.toThrow()
        })

        it('should handle paths with query parameters', () => {
            // Arrange
            const req = createMockRequest({originalUrl: '/api/tests?status=failed'})
            const res = createMockResponse()

            // Act
            notFoundHandler(req as Request, res as Response)

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not found',
                path: '/api/tests?status=failed',
                timestamp: expect.any(String),
            })
        })

        it('should handle paths with special characters', () => {
            // Arrange
            const req = createMockRequest({originalUrl: '/api/tests/test%20name'})
            const res = createMockResponse()

            // Act
            notFoundHandler(req as Request, res as Response)

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not found',
                path: '/api/tests/test%20name',
                timestamp: expect.any(String),
            })
        })

        it('should handle root path', () => {
            // Arrange
            const req = createMockRequest({originalUrl: '/'})
            const res = createMockResponse()

            // Act
            notFoundHandler(req as Request, res as Response)

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not found',
                path: '/',
                timestamp: expect.any(String),
            })
        })

        it('should handle very long URLs', () => {
            // Arrange
            const longPath = '/api/' + 'a'.repeat(1000)
            const req = createMockRequest({originalUrl: longPath})
            const res = createMockResponse()

            // Act
            notFoundHandler(req as Request, res as Response)

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not found',
                path: longPath,
                timestamp: expect.any(String),
            })
        })
    })

    describe('Integration Scenarios', () => {
        it('should handle ValidationError followed by generic error', () => {
            // Arrange
            const validationError = new Error('Invalid input')
            validationError.name = 'ValidationError'
            const genericError = new Error('Server error')

            // Act
            errorHandler(validationError, req as Request, res as Response, next)
            vi.clearAllMocks()
            errorHandler(genericError, req as Request, res as Response, next)

            // Assert - Second error should also be handled correctly
            expect(ResponseHelper.serverError).toHaveBeenCalledWith(res, 'Server error')
        })

        it('should handle multiple NotFoundError calls', () => {
            // Arrange
            const error1 = {name: 'NotFoundError', message: 'Not found', resource: 'Test'}
            const error2 = {name: 'NotFoundError', message: 'Not found', resource: 'User'}

            // Act
            errorHandler(error1, req as Request, res as Response, next)
            vi.clearAllMocks()
            errorHandler(error2, req as Request, res as Response, next)

            // Assert
            expect(ResponseHelper.notFound).toHaveBeenCalledWith(res, 'User')
        })

        it('should handle error after 404 handler', () => {
            // Arrange
            const req1 = createMockRequest({originalUrl: '/api/nonexistent'})
            const res1 = createMockResponse()
            const error = new Error('Server error')
            const req2 = createMockRequest()
            const res2 = createMockResponse()

            // Act
            notFoundHandler(req1 as Request, res1 as Response)
            vi.clearAllMocks()
            errorHandler(error, req2 as Request, res2 as Response, next)

            // Assert
            expect(ResponseHelper.serverError).toHaveBeenCalledWith(res2, 'Server error')
        })
    })
})
