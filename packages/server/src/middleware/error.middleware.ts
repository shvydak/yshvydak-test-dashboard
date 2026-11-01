import {Request, Response, NextFunction} from 'express'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'

export function errorHandler(error: any, req: Request, res: Response, _next: NextFunction): void {
    if (error.code !== 'LIMIT_FILE_SIZE') Logger.error('Server error:', error)

    // Handle specific error types
    if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
            success: false,
            error: 'File too large',
            message: 'Image size exceeds maximum of 5MB',
            timestamp: new Date().toISOString(),
        })
        return
    }
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
        timestamp: new Date().toISOString(),
    })
}
