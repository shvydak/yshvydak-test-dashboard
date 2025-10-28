/**
 * Test fixtures for integration tests
 * Provides consistent mock data across test files
 */

export const fixtures = {
    /**
     * Valid test result data
     */
    validTestResult: {
        id: 'result-123',
        testId: 'test-abc-456',
        runId: 'run-789',
        name: 'Example Test',
        filePath: 'tests/example.spec.ts',
        status: 'passed' as const,
        duration: 1500,
        errorMessage: null,
        errorStack: null,
        retryCount: 0,
        metadata: {},
    },

    /**
     * Failed test result with error
     */
    failedTestResult: {
        id: 'result-456',
        testId: 'test-def-789',
        runId: 'run-789',
        name: 'Failed Test',
        filePath: 'tests/failed.spec.ts',
        status: 'failed' as const,
        duration: 2100,
        errorMessage: 'Expected 200 but got 500',
        errorStack: 'Error: Expected 200 but got 500\n    at ...',
        retryCount: 2,
        metadata: {},
    },

    /**
     * Test result with attachments
     */
    testResultWithAttachments: {
        id: 'result-789',
        testId: 'test-ghi-123',
        runId: 'run-789',
        name: 'Test with Screenshot',
        filePath: 'tests/screenshot.spec.ts',
        status: 'passed' as const,
        duration: 1800,
        attachments: [
            {
                type: 'screenshot',
                fileName: 'screenshot-123.png',
                path: '/tmp/screenshot-123.png',
            },
            {
                type: 'video',
                fileName: 'video-456.webm',
                path: '/tmp/video-456.webm',
            },
        ],
    },

    /**
     * Minimal test result (only required fields)
     */
    minimalTestResult: {
        id: 'result-minimal',
        testId: 'test-minimal',
        runId: 'run-minimal',
        name: 'Minimal Test',
        filePath: '',
        status: 'passed' as const,
        duration: 0,
    },

    /**
     * Multiple test results for same testId (historical tracking)
     */
    historicalTestResults: [
        {
            id: 'result-hist-1',
            testId: 'test-historical',
            runId: 'run-001',
            name: 'Historical Test',
            filePath: 'tests/historical.spec.ts',
            status: 'passed' as const,
            duration: 1000,
            createdAt: '2025-10-01 10:00:00',
        },
        {
            id: 'result-hist-2',
            testId: 'test-historical',
            runId: 'run-002',
            name: 'Historical Test',
            filePath: 'tests/historical.spec.ts',
            status: 'failed' as const,
            duration: 1200,
            createdAt: '2025-10-02 11:00:00',
        },
        {
            id: 'result-hist-3',
            testId: 'test-historical',
            runId: 'run-003',
            name: 'Historical Test',
            filePath: 'tests/historical.spec.ts',
            status: 'passed' as const,
            duration: 1100,
            createdAt: '2025-10-03 12:00:00',
        },
    ],

    /**
     * Invalid test result data (for validation tests)
     */
    invalidTestResults: {
        missingId: {
            testId: 'test-abc',
            runId: 'run-789',
            name: 'Test',
        },
        missingTestId: {
            id: 'result-123',
            runId: 'run-789',
            name: 'Test',
        },
        missingRunId: {
            id: 'result-123',
            testId: 'test-abc',
            name: 'Test',
        },
        missingName: {
            id: 'result-123',
            testId: 'test-abc',
            runId: 'run-789',
        },
        emptyObject: {},
    },

    /**
     * Mock Playwright list output for discovery tests
     */
    playwrightListOutput: {
        suites: [
            {
                title: '',
                file: 'tests/auth.spec.ts',
                line: 1,
                column: 1,
                specs: [
                    {
                        title: 'User Login',
                        ok: true,
                        tags: [],
                        tests: [
                            {
                                timeout: 30000,
                                annotations: [],
                                expectedStatus: 'passed',
                                projectId: '',
                                projectName: '',
                                results: [],
                                status: 'skipped',
                            },
                        ],
                        id: 'abc-123',
                        file: 'tests/auth.spec.ts',
                        line: 5,
                        column: 3,
                    },
                    {
                        title: 'User Logout',
                        ok: true,
                        tags: [],
                        tests: [
                            {
                                timeout: 30000,
                                annotations: [],
                                expectedStatus: 'passed',
                                projectId: '',
                                projectName: '',
                                results: [],
                                status: 'skipped',
                            },
                        ],
                        id: 'def-456',
                        file: 'tests/auth.spec.ts',
                        line: 10,
                        column: 3,
                    },
                ],
                suites: [],
            },
            {
                title: 'Dashboard Tests',
                file: 'tests/dashboard.spec.ts',
                line: 1,
                column: 1,
                specs: [],
                suites: [
                    {
                        title: 'Statistics',
                        file: 'tests/dashboard.spec.ts',
                        line: 5,
                        column: 1,
                        specs: [
                            {
                                title: 'Display test stats',
                                ok: true,
                                tags: [],
                                tests: [
                                    {
                                        timeout: 30000,
                                        annotations: [],
                                        expectedStatus: 'passed',
                                        projectId: '',
                                        projectName: '',
                                        results: [],
                                        status: 'skipped',
                                    },
                                ],
                                id: 'ghi-789',
                                file: 'tests/dashboard.spec.ts',
                                line: 7,
                                column: 5,
                            },
                        ],
                        suites: [],
                    },
                ],
            },
        ],
    },
}
