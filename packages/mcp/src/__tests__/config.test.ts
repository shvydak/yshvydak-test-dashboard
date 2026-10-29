import {describe, expect, it} from 'vitest'
import {loadConfig} from '../config'

describe('loadConfig', () => {
    it('strips trailing slash and /api', () => {
        expect(loadConfig({DASHBOARD_URL: 'https://dashboard.example.com/api/'}).root).toBe(
            'https://dashboard.example.com'
        )
    })
    it('keeps a reverse-proxy prefix', () => {
        expect(loadConfig({DASHBOARD_URL: 'https://dashboard.example.com/qa/api'}).root).toBe(
            'https://dashboard.example.com/qa'
        )
    })
    it('requires a http(s) URL', () => {
        expect(() => loadConfig({})).toThrow(/DASHBOARD_URL/)
        expect(() => loadConfig({DASHBOARD_URL: 'file:///etc/passwd'})).toThrow(/http/)
    })
})
