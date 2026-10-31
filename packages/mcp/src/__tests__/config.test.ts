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

    describe('allowRuns', () => {
        const runs = (url: string, flag?: string) =>
            loadConfig({DASHBOARD_URL: url, DASHBOARD_ALLOW_RUNS: flag}).allowRuns

        it.each([
            'http://localhost:8200',
            'http://127.0.0.1:3001',
            'http://[::1]:3001',
            'https://localhost/qa',
        ])('is on by default for local %s', (url) => {
            expect(runs(url)).toBe(true)
        })

        it.each([
            'https://dashboard.example.com',
            'http://localhost.example.com',
            'http://127.0.0.1.example.com',
            'http://192.168.1.5:3001',
            'http://0.0.0.0:3001',
        ])('is off by default for %s', (url) => {
            expect(runs(url)).toBe(false)
        })

        it('DASHBOARD_ALLOW_RUNS=true turns it on for a remote host', () => {
            expect(runs('https://dashboard.example.com', 'true')).toBe(true)
        })

        it('DASHBOARD_ALLOW_RUNS=false turns it off for a local host', () => {
            expect(runs('http://localhost:8200', 'false')).toBe(false)
        })

        it('rejects any other value', () => {
            expect(() => runs('https://dashboard.example.com', 'yes')).toThrow(/ALLOW_RUNS/)
        })
    })
})
