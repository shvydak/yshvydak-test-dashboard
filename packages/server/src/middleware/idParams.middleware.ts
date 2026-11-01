import {Router} from 'express'
import {ResponseHelper} from '../utils/response.helper'
import {isSafeId} from '../utils/security.util'

/** 400 on any of these route params that is not a safe id (they end up in file paths and DB keys). */
export function requireSafeIdParams(router: Router, names: string[]): void {
    for (const name of names) {
        router.param(name, (req, res, next, value) => {
            if (!isSafeId(value)) return ResponseHelper.badRequest(res, `Invalid ${name}`)
            next()
        })
    }
}
