import { ApiResponse } from '../types/api.types'

export class ResponseHelper {
    static success<T>(data: T, message?: string, count?: number): ApiResponse<T> {
        return {
            success: true,
            data,
            message,
            count,
            timestamp: new Date().toISOString()
        }
    }

    static error(error: string, message?: string): ApiResponse {
        return {
            success: false,
            error,
            message,
            timestamp: new Date().toISOString()
        }
    }

    static notFound(resource: string): ApiResponse {
        return {
            success: false,
            error: `${resource} not found`,
            timestamp: new Date().toISOString()
        }
    }

    static badRequest(message: string): ApiResponse {
        return {
            success: false,
            error: 'Bad request',
            message,
            timestamp: new Date().toISOString()
        }
    }

    static internalError(message?: string): ApiResponse {
        return {
            success: false,
            error: 'Internal server error',
            message,
            timestamp: new Date().toISOString()
        }
    }
}