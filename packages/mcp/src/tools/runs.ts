import {z} from 'zod'
import type {DashboardClient} from '../client'
import {isSafeRunFilePath} from '../http'
import {
    MAX_ERROR_LINE_CHARS,
    MAX_FIELD_CHARS,
    RUN_DEFAULT_WORKERS,
    RUN_MAX_NAME_CHARS,
    RUN_MAX_TEST_NAMES,
    RUN_MAX_WORKERS,
    RUN_RESULTS_LIMIT,
} from '../constants'
import {cut, firstLine, fitRows, plain} from '../trim'
import {DashboardError} from '../auth'
import {defineTool, resolveTab, textResult, type ToolDef} from './common'

const maxWorkers = z
    .number()
    .int()
    .min(1)
    .max(RUN_MAX_WORKERS)
    .default(RUN_DEFAULT_WORKERS)
    .describe(
        `Parallel Playwright workers (default ${RUN_DEFAULT_WORKERS}, max ${RUN_MAX_WORKERS})`
    )

const START_NOTE =
    'The run is asynchronous: poll get_run_status with this runId. It adds a new execution to the test history. It cannot be stopped from here; stop it in the dashboard UI.'

export function rerunTestTool(client: DashboardClient): ToolDef {
    return defineTool({
        name: 'rerun_test',
        title: 'Rerun one test',
        readOnly: false,
        description:
            'Starts a rerun of one test on the dashboard (its latest execution), e.g. to see whether a failure is flaky. Refused when runs are disabled for this dashboard or when another run is active (no retry). Returns a runId; follow it with get_run_status.',
        input: z.object({
            testId: z.string().describe('Stable test id (test-xxxx)'),
            project: z
                .string()
                .optional()
                .describe(
                    'Tab/project to rerun in (name or display name). Default: the project of the latest execution of this test, whichever it is; the output says which ran'
                ),
            maxWorkers,
        }),
        handler: async ({testId, project, maxWorkers}) => {
            client.assertRunsEnabled()
            let latest
            if (project) {
                const name = await resolveTab(client, project)
                latest = await client.latestInProject(testId, name)
                if (!latest) throw new DashboardError(`Test ${testId} has no result in "${name}"`)
            } else {
                latest = await client.testByTestId(testId)
            }
            const runId = await client.rerunExecution(latest.id, maxWorkers)
            return textResult({
                started: true,
                runId,
                type: 'rerun',
                test: {
                    testId: latest.testId,
                    name: cut(latest.name, MAX_FIELD_CHARS),
                    project: cut(latest.project || undefined, MAX_FIELD_CHARS),
                },
                note: START_NOTE,
            })
        },
    })
}

export function runTestFileTool(client: DashboardClient): ToolDef {
    return defineTool({
        name: 'run_test_file',
        title: 'Run one test file',
        readOnly: false,
        description:
            'Starts a run of one spec file (the dashboard "run group"), optionally only the named tests of it. Only a spec file that the dashboard lists (plain path, no patterns). Playwright matches the path as a case-insensitive substring: if another listed file contains this path, the run is refused and those files are named. Refused when runs are disabled for this dashboard or when another run is active (no retry). Returns a runId; follow it with get_run_status.',
        input: z.object({
            filePath: z
                .string()
                .describe(
                    'Spec file path relative to the Playwright project, as in the "file" field of list_tests/get_test (a trailing :line is dropped)'
                ),
            testNames: z
                .array(z.string().min(1).max(RUN_MAX_NAME_CHARS))
                .min(1)
                .max(RUN_MAX_TEST_NAMES)
                .optional()
                .describe('Only tests with these exact titles; omit to run the whole file'),
            maxWorkers,
        }),
        handler: async ({filePath, testNames, maxWorkers}) => {
            client.assertRunsEnabled()
            const file = filePath.replace(/:\d+$/, '')
            if (!isSafeRunFilePath(file)) {
                throw new DashboardError(
                    'Invalid filePath: expected a plain relative spec file path such as tests/a.spec.ts (no patterns, no ..)'
                )
            }
            const {files, windowFull} = await client.knownFiles()
            if (!files.has(file)) {
                throw new DashboardError(
                    `Unknown file: the dashboard has no test with this filePath (use the "file" field of list_tests)${
                        windowFull ? ' (only the newest tests are checked)' : ''
                    }`
                )
            }
            // Playwright reads the path as a case-insensitive regex/substring: mirror it on the known files
            const filter = new RegExp(file, 'i')
            const also = [...files].filter((f) => f !== file && filter.test(f)).sort()
            if (also.length > 0) {
                throw new DashboardError(
                    `Not started: Playwright matches the path as a substring, so this run would also run ${also.length} other file(s): ${also
                        .slice(0, 10)
                        .map((f) => cut(f, MAX_FIELD_CHARS))
                        .join(', ')}${also.length > 10 ? ', ...' : ''}. Nothing was started.`
                )
            }
            const runId = await client.runFile(file, maxWorkers, testNames)
            return textResult({
                started: true,
                runId,
                type: 'run-group',
                file: cut(file, MAX_FIELD_CHARS),
                testNames: testNames?.map((n) => cut(n, MAX_FIELD_CHARS)),
                note: START_NOTE,
            })
        },
    })
}

export function runStatusTool(client: DashboardClient): ToolDef {
    return defineTool({
        name: 'get_run_status',
        title: 'Run status',
        description:
            'Status of one run by runId (from rerun_test / run_test_file, or the runId in get_test_history): running / completed / failed, counters, and the result of each test of the run so far. Read-only; works for runs started in the UI too. A run-group\'s counters fill only at its end, and a run can stay "running" if the reporter crashed: if no new results appear for a long time, check the dashboard UI.',
        input: z.object({runId: z.string().describe('Run id (UUID)')}),
        handler: async ({runId}) => {
            const [run, results] = await Promise.all([
                client.run(runId),
                client.runResults(runId, RUN_RESULTS_LIMIT),
            ])
            const tests = results.map((r) => ({
                testId: r.testId,
                name: cut(r.name, MAX_FIELD_CHARS),
                status: r.status,
                durationMs: r.duration,
                executionId: r.id,
                error: firstLine(plain(r.errorMessage), MAX_ERROR_LINE_CHARS),
            }))
            const times = results
                .map((r) => Date.parse(r.createdAt ?? ''))
                .filter((t) => !Number.isNaN(t))
            const started = client.runStartedAt(runId)
            const now = Date.now()
            const ageSec = (t: number) => Math.max(0, Math.round((now - t) / 1000))
            const first = times.length ? Math.min(...times) : undefined
            const last = times.length ? Math.max(...times) : undefined
            const note =
                run.status === 'running'
                    ? 'Still running as far as the dashboard knows. A run can stay "running" if its reporter crashed: if no new result appears for a long time, check the dashboard UI.'
                    : run.status === 'completed' && tests.length === 0
                      ? 'Completed with no results: no test matched (check the file, test title and project).'
                      : undefined
            return textResult(
                fitRows(tests, (kept) => ({
                    runId: run.id,
                    note,
                    startedSecondsAgo: started === undefined ? undefined : ageSec(started),
                    firstResultSecondsAgo: first === undefined ? undefined : ageSec(first),
                    lastResultSecondsAgo: last === undefined ? undefined : ageSec(last),
                    status: run.status,
                    type: cut(run.metadata?.type, MAX_FIELD_CHARS),
                    project: cut(run.metadata?.project, MAX_FIELD_CHARS),
                    counters: {
                        total: run.totalTests,
                        passed: run.passedTests,
                        failed: run.failedTests,
                        skipped: run.skippedTests,
                    },
                    resultsReturned: kept.length,
                    resultsTruncated:
                        kept.length < tests.length || tests.length >= RUN_RESULTS_LIMIT,
                    results: kept,
                }))
            )
        },
    })
}
