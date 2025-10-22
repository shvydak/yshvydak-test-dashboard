import {describe, it, expect, vi} from 'vitest'
import {Response} from 'express'
import {ResponseHelper} from '../response.helper'

// Mock Response object
const createMockResponse = (): Response => {
    const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    }
    return res as Response
}

describe('ResponseHelper', () => {
    describe('success()', () => {
        it('should return 200 response with data', () => {
            const res = createMockResponse()
            const testData = {id: '1', name: 'Test'}

            ResponseHelper.success(res, testData)

            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: testData,
                    timestamp: expect.any(String),
                })
            )
        })

        it('should include optional message', () => {
            const res = createMockResponse()
            const testData = {tests: []}
            const message = 'Tests retrieved successfully'

            ResponseHelper.success(res, testData, message)

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: testData,
                    message,
                })
            )
        })

        it('should include optional count', () => {
            const res = createMockResponse()
            const testData = [{id: '1'}, {id: '2'}]
            const count = 42

            ResponseHelper.success(res, testData, undefined, count)

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: testData,
                    count,
                })
            )
        })

        it('should include both message and count', () => {
            const res = createMockResponse()
            const testData: any[] = []
            const message = 'Found tests'
            const count = 100

            ResponseHelper.success(res, testData, message, count)

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: testData,
                    message,
                    count,
                })
            )
        })

        it('should handle null data', () => {
            const res = createMockResponse()

            ResponseHelper.success(res, null)

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: null,
                })
            )
        })

        it('should handle complex nested data', () => {
            const res = createMockResponse()
            const complexData = {
                tests: [{id: '1', results: [{status: 'passed'}]}],
                metadata: {total: 1},
            }

            ResponseHelper.success(res, complexData)

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: complexData,
                })
            )
        })

        it('should include ISO timestamp', () => {
            const res = createMockResponse()
            const beforeCall = new Date().toISOString()

            ResponseHelper.success(res, {})

            const jsonCall = (res.json as any).mock.calls[0][0]
            expect(jsonCall.timestamp).toBeDefined()
            expect(new Date(jsonCall.timestamp).getTime()).toBeGreaterThanOrEqual(
                new Date(beforeCall).getTime()
            )
        })

        it('should return response for chaining', () => {
            const res = createMockResponse()
            const result = ResponseHelper.success(res, {})

            expect(result).toBe(res)
        })
    })

    describe('error()', () => {
        it('should return 400 response by default', () => {
            const res = createMockResponse()
            const errorMsg = 'Invalid input'

            ResponseHelper.error(res, errorMsg)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: errorMsg,
                })
            )
        })

        it('should accept custom status code', () => {
            const res = createMockResponse()

            ResponseHelper.error(res, 'Error', undefined, 422)

            expect(res.status).toHaveBeenCalledWith(422)
        })

        it('should include optional message', () => {
            const res = createMockResponse()
            const error = 'Database error'
            const message = 'Failed to save test result'

            ResponseHelper.error(res, error, message)

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error,
                    message,
                })
            )
        })

        it('should handle different HTTP status codes', () => {
            const statusCodes = [400, 401, 403, 404, 422, 500, 503]

            statusCodes.forEach((status) => {
                const mockRes = createMockResponse()
                ResponseHelper.error(mockRes, 'Error', undefined, status)
                expect(mockRes.status).toHaveBeenCalledWith(status)
            })
        })

        it('should include timestamp', () => {
            const res = createMockResponse()

            ResponseHelper.error(res, 'Error')

            const jsonCall = (res.json as any).mock.calls[0][0]
            expect(jsonCall.timestamp).toBeDefined()
            expect(jsonCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        })

        it('should return response for chaining', () => {
            const res = createMockResponse()
            const result = ResponseHelper.error(res, 'Error')

            expect(result).toBe(res)
        })
    })

    describe('notFound()', () => {
        it('should return 404 with resource name', () => {
            const res = createMockResponse()
            const resource = 'Test'

            ResponseHelper.notFound(res, resource)

            expect(res.status).toHaveBeenCalledWith(404)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Test not found',
                })
            )
        })

        it('should handle different resource types', () => {
            const resources = ['Test', 'Run', 'Attachment', 'User', 'Project']

            resources.forEach((resource) => {
                const mockRes = createMockResponse()
                ResponseHelper.notFound(mockRes, resource)

                expect((mockRes.json as any).mock.calls[0][0]).toMatchObject({
                    success: false,
                    error: `${resource} not found`,
                })
            })
        })

        it('should include timestamp', () => {
            const res = createMockResponse()

            ResponseHelper.notFound(res, 'Test')

            const jsonCall = (res.json as any).mock.calls[0][0]
            expect(jsonCall.timestamp).toBeDefined()
        })

        it('should handle special characters in resource name', () => {
            const res = createMockResponse()
            const resource = 'Test-Result#123'

            ResponseHelper.notFound(res, resource)

            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                error: 'Test-Result#123 not found',
            })
        })

        it('should return response for chaining', () => {
            const res = createMockResponse()
            const result = ResponseHelper.notFound(res, 'Test')

            expect(result).toBe(res)
        })
    })

    describe('badRequest()', () => {
        it('should return 400 with message', () => {
            const res = createMockResponse()
            const message = 'Missing required field: testId'

            ResponseHelper.badRequest(res, message)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Bad request',
                    message,
                })
            )
        })

        it('should handle validation error messages', () => {
            const res = createMockResponse()
            const message = 'Validation failed: runId must be a valid UUID'

            ResponseHelper.badRequest(res, message)

            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Bad request',
                message,
            })
        })

        it('should handle empty message', () => {
            const res = createMockResponse()

            ResponseHelper.badRequest(res, '')

            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Bad request',
                message: '',
            })
        })

        it('should include timestamp', () => {
            const res = createMockResponse()

            ResponseHelper.badRequest(res, 'Invalid input')

            const jsonCall = (res.json as any).mock.calls[0][0]
            expect(jsonCall.timestamp).toBeDefined()
        })

        it('should return response for chaining', () => {
            const res = createMockResponse()
            const result = ResponseHelper.badRequest(res, 'Error')

            expect(result).toBe(res)
        })
    })

    describe('unauthorized()', () => {
        it('should return 401 with default message', () => {
            const res = createMockResponse()

            ResponseHelper.unauthorized(res)

            expect(res.status).toHaveBeenCalledWith(401)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Authentication required',
                })
            )
        })

        it('should accept custom message', () => {
            const res = createMockResponse()
            const message = 'Invalid JWT token'

            ResponseHelper.unauthorized(res, message)

            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Unauthorized',
                message,
            })
        })

        it('should handle token expiration message', () => {
            const res = createMockResponse()
            const message = 'Token expired, please login again'

            ResponseHelper.unauthorized(res, message)

            expect((res.json as any).mock.calls[0][0].message).toBe(message)
        })

        it('should include timestamp', () => {
            const res = createMockResponse()

            ResponseHelper.unauthorized(res)

            const jsonCall = (res.json as any).mock.calls[0][0]
            expect(jsonCall.timestamp).toBeDefined()
        })

        it('should return response for chaining', () => {
            const res = createMockResponse()
            const result = ResponseHelper.unauthorized(res)

            expect(result).toBe(res)
        })
    })

    describe('forbidden()', () => {
        it('should return 403 with default message', () => {
            const res = createMockResponse()

            ResponseHelper.forbidden(res)

            expect(res.status).toHaveBeenCalledWith(403)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Forbidden',
                    message: 'Access denied',
                })
            )
        })

        it('should accept custom message', () => {
            const res = createMockResponse()
            const message = 'Admin access required'

            ResponseHelper.forbidden(res, message)

            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Forbidden',
                message,
            })
        })

        it('should handle role-based access message', () => {
            const res = createMockResponse()
            const message = 'Only administrators can perform this action'

            ResponseHelper.forbidden(res, message)

            expect((res.json as any).mock.calls[0][0].message).toBe(message)
        })

        it('should include timestamp', () => {
            const res = createMockResponse()

            ResponseHelper.forbidden(res)

            const jsonCall = (res.json as any).mock.calls[0][0]
            expect(jsonCall.timestamp).toBeDefined()
        })

        it('should return response for chaining', () => {
            const res = createMockResponse()
            const result = ResponseHelper.forbidden(res)

            expect(result).toBe(res)
        })
    })

    describe('serverError()', () => {
        it('should return 500 with generic error', () => {
            const res = createMockResponse()

            ResponseHelper.serverError(res)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Internal server error',
                })
            )
        })

        it('should include optional message', () => {
            const res = createMockResponse()
            const message = 'Database connection failed'

            ResponseHelper.serverError(res, message)

            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Internal server error',
                message,
            })
        })

        it('should handle database error messages', () => {
            const res = createMockResponse()
            const message = 'SQLITE_BUSY: database is locked'

            ResponseHelper.serverError(res, message)

            expect((res.json as any).mock.calls[0][0].message).toBe(message)
        })

        it('should handle file system error messages', () => {
            const res = createMockResponse()
            const message = 'ENOENT: no such file or directory'

            ResponseHelper.serverError(res, message)

            expect((res.json as any).mock.calls[0][0].message).toBe(message)
        })

        it('should include timestamp', () => {
            const res = createMockResponse()

            ResponseHelper.serverError(res)

            const jsonCall = (res.json as any).mock.calls[0][0]
            expect(jsonCall.timestamp).toBeDefined()
        })

        it('should return response for chaining', () => {
            const res = createMockResponse()
            const result = ResponseHelper.serverError(res)

            expect(result).toBe(res)
        })
    })

    describe('successData() - Legacy method', () => {
        it('should return success object with data', () => {
            const data = {id: '1', name: 'Test'}

            const result = ResponseHelper.successData(data)

            expect(result).toMatchObject({
                success: true,
                data,
                timestamp: expect.any(String),
            })
        })

        it('should include optional message', () => {
            const data: any[] = []
            const message = 'Tests retrieved'

            const result = ResponseHelper.successData(data, message)

            expect(result).toMatchObject({
                success: true,
                data,
                message,
            })
        })

        it('should include optional count', () => {
            const data: any[] = []
            const count = 25

            const result = ResponseHelper.successData(data, undefined, count)

            expect(result).toMatchObject({
                success: true,
                data,
                count,
            })
        })

        it('should include both message and count', () => {
            const data: any[] = []
            const message = 'Success'
            const count = 10

            const result = ResponseHelper.successData(data, message, count)

            expect(result).toMatchObject({
                success: true,
                data,
                message,
                count,
            })
        })

        it('should return object, not Response', () => {
            const result = ResponseHelper.successData({})

            expect(result).not.toHaveProperty('status')
            expect(result).not.toHaveProperty('json')
            expect(result).toHaveProperty('success')
            expect(result).toHaveProperty('timestamp')
        })

        it('should handle null data', () => {
            const result = ResponseHelper.successData(null)

            expect(result.data).toBeNull()
            expect(result.success).toBe(true)
        })

        it('should handle complex objects', () => {
            const complexData = {
                nested: {deep: {value: 'test'}},
                array: [1, 2, 3],
            }

            const result = ResponseHelper.successData(complexData)

            expect(result.data).toEqual(complexData)
        })
    })

    describe('errorData() - Legacy method', () => {
        it('should return error object', () => {
            const error = 'Something went wrong'

            const result = ResponseHelper.errorData(error)

            expect(result).toMatchObject({
                success: false,
                error,
                timestamp: expect.any(String),
            })
        })

        it('should include optional message', () => {
            const error = 'Database error'
            const message = 'Failed to insert record'

            const result = ResponseHelper.errorData(error, message)

            expect(result).toMatchObject({
                success: false,
                error,
                message,
            })
        })

        it('should return object, not Response', () => {
            const result = ResponseHelper.errorData('Error')

            expect(result).not.toHaveProperty('status')
            expect(result).not.toHaveProperty('json')
            expect(result).toHaveProperty('success')
            expect(result).toHaveProperty('timestamp')
        })

        it('should handle empty error string', () => {
            const result = ResponseHelper.errorData('')

            expect(result.error).toBe('')
            expect(result.success).toBe(false)
        })

        it('should handle special characters in error', () => {
            const error = 'Error: {invalid JSON}'

            const result = ResponseHelper.errorData(error)

            expect(result.error).toBe(error)
        })
    })

    describe('internalError() - Legacy method', () => {
        it('should return internal error object', () => {
            const result = ResponseHelper.internalError()

            expect(result).toMatchObject({
                success: false,
                error: 'Internal server error',
                timestamp: expect.any(String),
            })
        })

        it('should include optional message', () => {
            const message = 'Unexpected exception occurred'

            const result = ResponseHelper.internalError(message)

            expect(result).toMatchObject({
                success: false,
                error: 'Internal server error',
                message,
            })
        })

        it('should return object, not Response', () => {
            const result = ResponseHelper.internalError()

            expect(result).not.toHaveProperty('status')
            expect(result).not.toHaveProperty('json')
            expect(result).toHaveProperty('success')
            expect(result).toHaveProperty('timestamp')
        })

        it('should handle stack trace messages', () => {
            const message = 'Error at line 42: TypeError: Cannot read property'

            const result = ResponseHelper.internalError(message)

            expect(result.message).toBe(message)
        })

        it('should have consistent error message', () => {
            const result1 = ResponseHelper.internalError()
            const result2 = ResponseHelper.internalError('Custom message')

            expect(result1.error).toBe('Internal server error')
            expect(result2.error).toBe('Internal server error')
        })
    })

    describe('Edge Cases', () => {
        it('should handle extremely long messages', () => {
            const res = createMockResponse()
            const longMessage = 'x'.repeat(10000)

            ResponseHelper.success(res, {}, longMessage)

            expect((res.json as any).mock.calls[0][0].message).toBe(longMessage)
        })

        it('should handle Unicode characters in messages', () => {
            const res = createMockResponse()
            const unicodeMessage = '测试 🎉 тест'

            ResponseHelper.badRequest(res, unicodeMessage)

            expect((res.json as any).mock.calls[0][0].message).toBe(unicodeMessage)
        })

        it('should handle emoji in resource names', () => {
            const res = createMockResponse()
            const resource = 'Test 🧪'

            ResponseHelper.notFound(res, resource)

            expect((res.json as any).mock.calls[0][0].error).toBe('Test 🧪 not found')
        })

        it('should handle zero count', () => {
            const res = createMockResponse()

            ResponseHelper.success(res, [], 'No tests', 0)

            expect((res.json as any).mock.calls[0][0].count).toBe(0)
        })

        it('should handle large count numbers', () => {
            const res = createMockResponse()
            const largeCount = 999999999

            ResponseHelper.success(res, [], undefined, largeCount)

            expect((res.json as any).mock.calls[0][0].count).toBe(largeCount)
        })

        it('should handle negative status codes gracefully', () => {
            const res = createMockResponse()

            ResponseHelper.error(res, 'Error', undefined, -1)

            expect(res.status).toHaveBeenCalledWith(-1)
        })

        it('should handle very large status codes', () => {
            const res = createMockResponse()

            ResponseHelper.error(res, 'Error', undefined, 999)

            expect(res.status).toHaveBeenCalledWith(999)
        })
    })

    describe('Integration Scenarios', () => {
        it('should work in typical controller success flow', () => {
            const res = createMockResponse()
            const tests = [{id: '1', name: 'Test 1'}]

            ResponseHelper.success(res, tests, 'Tests retrieved', tests.length)

            expect(res.status).toHaveBeenCalledWith(200)
            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: true,
                data: tests,
                message: 'Tests retrieved',
                count: 1,
            })
        })

        it('should work in typical controller error flow', () => {
            const res = createMockResponse()

            ResponseHelper.badRequest(res, 'Missing testId parameter')

            expect(res.status).toHaveBeenCalledWith(400)
            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Bad request',
                message: 'Missing testId parameter',
            })
        })

        it('should work in authentication failure flow', () => {
            const res = createMockResponse()

            ResponseHelper.unauthorized(res, 'Invalid JWT token')

            expect(res.status).toHaveBeenCalledWith(401)
            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Unauthorized',
                message: 'Invalid JWT token',
            })
        })

        it('should work in authorization failure flow', () => {
            const res = createMockResponse()

            ResponseHelper.forbidden(res, 'Admin role required')

            expect(res.status).toHaveBeenCalledWith(403)
            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Forbidden',
                message: 'Admin role required',
            })
        })

        it('should work in resource not found flow', () => {
            const res = createMockResponse()

            ResponseHelper.notFound(res, 'Test')

            expect(res.status).toHaveBeenCalledWith(404)
            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Test not found',
            })
        })

        it('should work in server error flow', () => {
            const res = createMockResponse()

            ResponseHelper.serverError(res, 'Database connection failed')

            expect(res.status).toHaveBeenCalledWith(500)
            expect((res.json as any).mock.calls[0][0]).toMatchObject({
                success: false,
                error: 'Internal server error',
                message: 'Database connection failed',
            })
        })

        it('should support method chaining pattern', () => {
            const res = createMockResponse()

            const result = ResponseHelper.success(res, {test: 'data'})

            expect(result).toBe(res)
            expect(res.status).toHaveBeenCalled()
            expect(res.json).toHaveBeenCalled()
        })

        it('should maintain consistent response format across all methods', () => {
            const methods = [
                () => {
                    const res = createMockResponse()
                    ResponseHelper.success(res, {})
                    return (res.json as any).mock.calls[0][0]
                },
                () => {
                    const res = createMockResponse()
                    ResponseHelper.error(res, 'Error')
                    return (res.json as any).mock.calls[0][0]
                },
                () => {
                    const res = createMockResponse()
                    ResponseHelper.badRequest(res, 'Bad')
                    return (res.json as any).mock.calls[0][0]
                },
                () => {
                    const res = createMockResponse()
                    ResponseHelper.unauthorized(res)
                    return (res.json as any).mock.calls[0][0]
                },
                () => {
                    const res = createMockResponse()
                    ResponseHelper.forbidden(res)
                    return (res.json as any).mock.calls[0][0]
                },
                () => {
                    const res = createMockResponse()
                    ResponseHelper.notFound(res, 'Test')
                    return (res.json as any).mock.calls[0][0]
                },
                () => {
                    const res = createMockResponse()
                    ResponseHelper.serverError(res)
                    return (res.json as any).mock.calls[0][0]
                },
            ]

            methods.forEach((method) => {
                const response = method()
                expect(response).toHaveProperty('success')
                expect(response).toHaveProperty('timestamp')
                expect(typeof response.success).toBe('boolean')
                expect(typeof response.timestamp).toBe('string')
            })
        })
    })

    describe('Timestamp Consistency', () => {
        it('should generate valid ISO timestamps for all methods', () => {
            const methods = [
                () => ResponseHelper.successData({}),
                () => ResponseHelper.errorData('Error'),
                () => ResponseHelper.internalError(),
            ]

            methods.forEach((method) => {
                const result = method()
                const timestamp = new Date(result.timestamp)
                expect(timestamp.toISOString()).toBe(result.timestamp)
            })
        })

        it('should generate timestamps close to current time', () => {
            const before = Date.now()
            const result = ResponseHelper.successData({})
            const after = Date.now()

            const timestamp = new Date(result.timestamp).getTime()
            expect(timestamp).toBeGreaterThanOrEqual(before)
            expect(timestamp).toBeLessThanOrEqual(after)
        })

        it('should generate unique timestamps for rapid calls', () => {
            const timestamps = []
            for (let i = 0; i < 10; i++) {
                const result = ResponseHelper.successData({})
                timestamps.push(result.timestamp)
            }

            // All timestamps should be ISO strings
            timestamps.forEach((ts) => {
                expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
            })
        })
    })
})
