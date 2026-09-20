/**
 * Parity: for the same logical Playwright test, the reporter (a real run) and Discover
 * (`playwright test --list --reporter=json`) must produce equal describe / annotations /
 * line / column / tags / timeout / expectedStatus. The dashboard shows the LATEST row per
 * testId, so any difference makes values flicker between a run and a Discover.
 *
 * The reporter package cannot be imported normally from here (separate tsconfig rootDir),
 * so it is loaded by absolute path at runtime; inputs mirror Playwright's real object shapes
 * (Suite tree with `type`, and the JSON reporter's file-suite/describe-suite nesting).
 */
import path from 'path'
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {PlaywrightService} from '../playwright.service'

vi.mock('../../config/environment.config', () => ({
    config: {
        playwright: {projectDir: '/test/project', reporterPath: 'playwright-dashboard-reporter'},
        api: {baseUrl: 'http://localhost:3000'},
        server: {environment: 'test', port: 3000},
    },
}))

interface LogicalTest {
    file: string
    describes: string[]
    title: string
    tags: string[] // with '@', as Playwright's TestCase.tags
    annotations: Array<{type: string; description?: string}>
    line: number
    column: number
    timeout: number
    expectedStatus: string
}

const PARITY_KEYS = [
    'describe',
    'annotations',
    'line',
    'column',
    'tags',
    'timeout',
    'expectedStatus',
] as const

const cases: Record<string, LogicalTest> = {
    'nested describes with tags and annotations': {
        file: 'login.spec.ts',
        describes: ['Auth', 'Login'],
        title: 'logs in',
        tags: ['@ABC-123', '@smoke'],
        annotations: [
            {type: 'issue', description: 'https://tracker.example/ABC-123'},
            {type: 'skip', description: 'flaky on CI'},
        ],
        line: 12,
        column: 5,
        timeout: 30000,
        expectedStatus: 'passed',
    },
    'top-level test without describes, tags or annotations': {
        file: 'plain.spec.ts',
        describes: [],
        title: 'plain',
        tags: [],
        annotations: [],
        line: 3,
        column: 1,
        timeout: 60000,
        expectedStatus: 'passed',
    },
    'single describe and an expected failure': {
        file: 'known.spec.ts',
        describes: ['Known bugs'],
        title: 'still broken',
        tags: ['@api'],
        annotations: [{type: 'fail'}],
        line: 30,
        column: 7,
        timeout: 30000,
        expectedStatus: 'failed',
    },
    'over-limit annotations (count and lengths)': {
        file: 'many.spec.ts',
        describes: ['Many'],
        title: 'lots',
        tags: [],
        annotations: [
            {type: 'long', description: 'd'.repeat(900)},
            {type: 'x'.repeat(250)},
            {type: 'dup', description: 'same'},
            {type: 'dup', description: 'same'},
            ...Array.from({length: 20}, (_, i) => ({type: `t${i}`})),
        ],
        line: 8,
        column: 2,
        timeout: 30000,
        expectedStatus: 'passed',
    },
}

// Playwright Suite tree: root('') > project > file > describes > test
function reporterTestCase(t: LogicalTest) {
    const root = {title: '', type: 'root'}
    const project = {title: 'chromium', type: 'project', parent: root}
    const file = {title: t.file, type: 'file', parent: project}
    const parent = t.describes.reduce<any>(
        (p, title) => ({title, type: 'describe', parent: p}),
        file
    )
    return {
        title: t.title,
        location: {file: path.resolve(t.file), line: t.line, column: t.column},
        parent,
        tags: t.tags,
        annotations: t.annotations,
        expectedStatus: t.expectedStatus,
        retries: 0,
        timeout: t.timeout,
        outcome: () => 'expected',
    }
}

// Playwright JSON reporter: file suite (title = file path) > nested describe suites > specs
function jsonFileSuite(t: LogicalTest) {
    const spec = {
        title: t.title,
        ok: true,
        tags: t.tags.map((tag) => tag.substring(1)), // JSON reporter strips '@'
        tests: [
            {
                timeout: t.timeout,
                annotations: t.annotations,
                expectedStatus: t.expectedStatus,
                projectId: 'chromium',
                projectName: 'chromium',
                results: [],
                status: 'skipped',
            },
        ],
        id: `id-${t.title}`,
        file: t.file,
        line: t.line,
        column: t.column,
    }
    const nest = (describes: string[]): any =>
        describes.length === 0
            ? null
            : {
                  title: describes[0],
                  file: t.file,
                  line: 1,
                  column: 1,
                  specs: describes.length === 1 ? [spec] : [],
                  suites: describes.length > 1 ? [nest(describes.slice(1))] : undefined,
              }
    const nested = nest(t.describes)
    return {
        title: t.file,
        file: t.file,
        line: 0,
        column: 0,
        specs: nested ? [] : [spec],
        suites: nested ? [nested] : undefined,
    }
}

describe('reporter vs Discover metadata parity', () => {
    const mockFetch = vi.fn()
    let ReporterClass: any

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        global.fetch = mockFetch as any
        mockFetch.mockResolvedValue({ok: true, json: async () => ({})})
        const reporterEntry = path.resolve(__dirname, '../../../../reporter/src/index.ts')
        ReporterClass = (await import(/* @vite-ignore */ reporterEntry)).default
    })

    afterEach(() => {
        vi.restoreAllMocks()
        process.removeAllListeners('SIGINT')
        process.removeAllListeners('SIGTERM')
        process.removeAllListeners('uncaughtException')
        process.removeAllListeners('unhandledRejection')
    })

    const viaReporter = (t: LogicalTest) => {
        const reporter = new ReporterClass()
        reporter.onTestEnd(reporterTestCase(t), {
            status: 'passed',
            duration: 1,
            attachments: [],
            errors: [],
            annotations: [],
            retry: 0,
            workerIndex: 0,
            parallelIndex: 0,
            startTime: new Date(),
        })
        const call = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/api/tests'))
        return JSON.parse(call![1].body)
    }

    const viaDiscover = async (t: LogicalTest) => {
        const service = new PlaywrightService()
        vi.spyOn(service as any, 'executePlaywrightListCommand').mockResolvedValue({
            suites: [jsonFileSuite(t)],
        })
        const [discovered] = await service.discoverTests()
        return discovered
    }

    const pick = (metadata: Record<string, unknown>) =>
        Object.fromEntries(PARITY_KEYS.filter((k) => k in metadata).map((k) => [k, metadata[k]]))

    it.each(Object.keys(cases))('same values for: %s', async (name) => {
        const logical = cases[name]

        const fromReporter = viaReporter(logical)
        const fromDiscover = await viaDiscover(logical)

        expect(pick(fromDiscover.metadata as any)).toEqual(pick(fromReporter.metadata))
        // ...and the identity fields the row is keyed on agree too
        expect(fromDiscover.testId).toBe(fromReporter.testId)
        expect(fromDiscover.name).toBe(fromReporter.name)
        expect(fromDiscover.filePath).toBe(fromReporter.filePath)
    })

    it('empty describe/annotations are omitted on both sides, not sent as []', async () => {
        const logical = cases['top-level test without describes, tags or annotations']

        const reporterMeta = viaReporter(logical).metadata
        const discoverMeta = (await viaDiscover(logical)).metadata as any

        for (const meta of [reporterMeta, discoverMeta]) {
            expect(meta).not.toHaveProperty('describe')
            expect(meta).not.toHaveProperty('annotations')
            expect(meta.tags).toEqual([])
        }
    })

    it('exercises the caps: 10 annotations, 300-char descriptions, 100-char types', async () => {
        const meta = viaReporter(cases['over-limit annotations (count and lengths)']).metadata

        expect(meta.annotations).toHaveLength(10)
        expect(meta.annotations[0].description).toHaveLength(300)
        expect(meta.annotations[1].type).toHaveLength(100)
    })
})
