import { Request, Response, NextFunction } from 'express'
import { ResponseHelper } from '../utils/response.helper'
import { Logger } from '../utils/logger.util'

export function errorHandler(
    error: any,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    Logger.error('Server error:', error)

    // Default error response
    let statusCode = 500
    let errorResponse = ResponseHelper.internalError(error.message)

    // Handle specific error types
    if (error.name === 'ValidationError') {
        statusCode = 400
        errorResponse = ResponseHelper.badRequest(error.message)
    } else if (error.name === 'NotFoundError') {
        statusCode = 404
        errorResponse = ResponseHelper.notFound(error.resource || 'Resource')
    }

    res.status(statusCode).json(errorResponse)
}

export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json({
        error: 'Not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    })
}