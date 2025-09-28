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

    // Handle specific error types
    if (error.name === 'ValidationError') {
        ResponseHelper.badRequest(res, error.message)
    } else if (error.name === 'NotFoundError') {
        ResponseHelper.notFound(res, error.resource || 'Resource')
    } else {
        ResponseHelper.serverError(res, error.message)
    }
}

export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json({
        error: 'Not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    })
}