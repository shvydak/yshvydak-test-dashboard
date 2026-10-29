import {describe, it, expect} from 'vitest'
import {config} from '../environment.config'

// vitest.setup.ts blanks JIRA_* so a developer's real credentials never reach a test.
describe('test environment', () => {
    it('has the Jira integration disabled even when .env holds credentials', () => {
        expect(config.jira.enabled).toBe(false)
    })
})
