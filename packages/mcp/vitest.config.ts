import {defineConfig, mergeConfig} from 'vitest/config'
import rootConfig from '../../vitest.config'

// The integration test boots the real server harness, so it shares the server's env setup
// (temp OUTPUT_DIR, blanked Jira env) and runs in a single fork like the server project.
export default mergeConfig(
    rootConfig,
    defineConfig({
        test: {
            name: 'mcp',
            environment: 'node',
            include: ['src/**/__tests__/**/*.test.ts'],
            setupFiles: ['../server/vitest.setup.ts'],
            pool: 'forks',
            poolOptions: {forks: {singleFork: true}},
        },
    })
)
