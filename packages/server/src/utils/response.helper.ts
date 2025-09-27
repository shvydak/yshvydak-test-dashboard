import { Response } from 'express'
import { ApiResponse } from '../types/api.types'

export class ResponseHelper {
    static success<T>(res: Response, data: T, message?: string, count?: number): void {
        res.status(200).json({
            success: true,
            data,
            message,
            count,
            timestamp: new Date().toISOString()
        })
    }

    static error(res: Response, error: string, message?: string, status: number = 400): void {
        res.status(status).json({
            success: false,
            error,
            message,
            timestamp: new Date().toISOString()
        })
    }

    static notFound(res: Response, resource: string): void {
        res.status(404).json({
            success: false,
            error: `${resource} not found`,
            timestamp: new Date().toISOString()
        })
    }

    static badRequest(res: Response, message: string): void {
        res.status(400).json({
            success: false,
            error: 'Bad request',
            message,
            timestamp: new Date().toISOString()
        })
    }

    static unauthorized(res: Response, message?: string): void {
        res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: message || 'Authentication required',
            timestamp: new Date().toISOString()
        })
    }

    static forbidden(res: Response, message?: string): void {
        res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: message || 'Access denied',
            timestamp: new Date().toISOString()
        })
    }

    static serverError(res: Response, message?: string): void {
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message,
            timestamp: new Date().toISOString()
        })
    }

    // Legacy methods for backward compatibility (return objects instead of directly responding)
    static successData<T>(data: T, message?: string, count?: number): ApiResponse<T> {
        return {
            success: true,
            data,
            message,
            count,
            timestamp: new Date().toISOString()
        }
    }

    static errorData(error: string, message?: string): ApiResponse {
        return {
            success: false,
            error,
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