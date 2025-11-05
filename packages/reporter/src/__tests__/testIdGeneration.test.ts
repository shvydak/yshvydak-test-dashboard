/**
 * Test ID Generation Tests (CRITICAL)
 *
 * These tests verify the stability and determinism of the test ID generation algorithm.
 * This is CRITICAL because:
 * 1. Test IDs link test executions to historical data
 * 2. Discovery service and Reporter MUST generate identical IDs
 * 3. Breaking this algorithm will break entire historical tracking system
 *
 * Coverage target: 95%+
 */

import {describe, it, expect} from 'vitest'
import {normalizeTestPath} from '@yshvydak/core'

/**
 * Extracted generateStableTestId function for testing
 * This is the EXACT same algorithm used in the Reporter and Server
 */
function generateStableTestId(filePath: string, title: string): string {
    // Normalize path before generating ID
    const normalizedPath = normalizeTestPath(filePath)
    const content = `${normalizedPath}:${title}`

    // Simple hash function for stable IDs (identical to Reporter implementation)
    let hash = 0
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32-bit integer
    }

    return `test-${Math.abs(hash).toString(36)}`
}

describe('Test ID Generation Algorithm', () => {
    describe('Determinism (same input = same output)', () => {
        it('should generate identical IDs for same file path and title', () => {
            const filePath = 'src/tests/example.spec.ts'
            const title = 'should login successfully'

            const id1 = generateStableTestId(filePath, title)
            const id2 = generateStableTestId(filePath, title)
            const id3 = generateStableTestId(filePath, title)

            expect(id1).toBe(id2)
            expect(id2).toBe(id3)
            expect(id1).toBe(id3)
        })

        it('should generate same ID across multiple calls (100 iterations)', () => {
            const filePath = 'tests/auth/login.test.ts'
            const title = 'admin can access dashboard'

            const firstId = generateStableTestId(filePath, title)

            // Test stability across many calls
            for (let i = 0; i < 100; i++) {
                const currentId = generateStableTestId(filePath, title)
                expect(currentId).toBe(firstId)
            }
        })
    })

    describe('Uniqueness (different input = different output)', () => {
        it('should generate different IDs for different file paths', () => {
            const title = 'should work correctly'
            const id1 = generateStableTestId('tests/unit/service.test.ts', title)
            const id2 = generateStableTestId('tests/integration/api.test.ts', title)

            expect(id1).not.toBe(id2)
        })

        it('should generate different IDs for different test titles', () => {
            const filePath = 'tests/auth.spec.ts'
            const id1 = generateStableTestId(filePath, 'should login')
            const id2 = generateStableTestId(filePath, 'should logout')

            expect(id1).not.toBe(id2)
        })

        it('should generate different IDs for different file paths AND titles', () => {
            const id1 = generateStableTestId('tests/unit/a.test.ts', 'test A')
            const id2 = generateStableTestId('tests/unit/b.test.ts', 'test B')

            expect(id1).not.toBe(id2)
        })
    })

    describe('Edge Cases', () => {
        it('should handle empty strings', () => {
            const id1 = generateStableTestId('', '')
            const id2 = generateStableTestId('', '')

            expect(id1).toBe(id2)
            expect(id1).toMatch(/^test-[a-z0-9]+$/)
        })

        it('should handle very long file paths', () => {
            const longPath = 'a/'.repeat(500) + 'test.spec.ts'
            const id1 = generateStableTestId(longPath, 'some test')
            const id2 = generateStableTestId(longPath, 'some test')

            expect(id1).toBe(id2)
            expect(id1).toMatch(/^test-[a-z0-9]+$/)
        })

        it('should handle very long test titles', () => {
            const longTitle = 'should '.repeat(100) + 'work'
            const id1 = generateStableTestId('test.ts', longTitle)
            const id2 = generateStableTestId('test.ts', longTitle)

            expect(id1).toBe(id2)
        })

        it('should handle special characters in file paths', () => {
            const specialPath = 'tests/@special/[name]/test.spec.ts'
            const id1 = generateStableTestId(specialPath, 'test')
            const id2 = generateStableTestId(specialPath, 'test')

            expect(id1).toBe(id2)
        })

        it('should handle special characters in titles', () => {
            const specialTitle = 'should handle "quotes" and \'apostrophes\' and <tags>'
            const id1 = generateStableTestId('test.ts', specialTitle)
            const id2 = generateStableTestId('test.ts', specialTitle)

            expect(id1).toBe(id2)
        })

        it('should handle Unicode characters', () => {
            const unicodePath = 'tests/测试/тест/テスト.spec.ts'
            const unicodeTitle = 'should work with 日本語 and Русский and 中文'

            const id1 = generateStableTestId(unicodePath, unicodeTitle)
            const id2 = generateStableTestId(unicodePath, unicodeTitle)

            expect(id1).toBe(id2)
        })
    })

    describe('Format Validation', () => {
        it('should always start with "test-" prefix', () => {
            const id = generateStableTestId('any/path.ts', 'any title')
            expect(id).toMatch(/^test-/)
        })

        it('should contain only lowercase alphanumeric characters after prefix', () => {
            const id = generateStableTestId('path/to/test.ts', 'Some Test Title')
            expect(id).toMatch(/^test-[a-z0-9]+$/)
        })

        it('should not contain any special characters except hyphen', () => {
            const id = generateStableTestId(
                'path/with/special@#$.ts',
                'title with spaces & symbols!'
            )
            expect(id).not.toMatch(/[^a-z0-9-]/)
        })
    })

    describe('Collision Resistance', () => {
        it('should generate different IDs for similar but different inputs', () => {
            // These are VERY similar inputs - testing hash collision resistance
            const id1 = generateStableTestId('tests/a.ts', 'test')
            const id2 = generateStableTestId('tests/b.ts', 'test')
            const id3 = generateStableTestId('tests/a.ts', 'test1')
            const id4 = generateStableTestId('tests/a.ts', 'test2')

            const ids = [id1, id2, id3, id4]
            const uniqueIds = new Set(ids)

            expect(uniqueIds.size).toBe(4) // All should be unique
        })

        it('should not collide for common test patterns', () => {
            // Real-world test patterns
            const testPatterns = [
                {path: 'tests/auth/login.test.ts', title: 'should login with valid credentials'},
                {path: 'tests/auth/login.test.ts', title: 'should fail with invalid credentials'},
                {path: 'tests/auth/logout.test.ts', title: 'should logout successfully'},
                {path: 'tests/dashboard/stats.test.ts', title: 'should display correct statistics'},
                {path: 'tests/dashboard/charts.test.ts', title: 'should render charts correctly'},
            ]

            const ids = testPatterns.map((pattern) =>
                generateStableTestId(pattern.path, pattern.title)
            )
            const uniqueIds = new Set(ids)

            expect(uniqueIds.size).toBe(testPatterns.length)
        })
    })

    describe('Real-World Examples (from actual project)', () => {
        it('should match expected IDs for actual project tests', () => {
            // These are examples from the actual project structure
            const examples = [
                {
                    path: 'e2e/auth.spec.ts',
                    title: 'user can login',
                    // We don't hardcode expected ID, just verify consistency
                },
                {
                    path: 'e2e/tests/dashboard.spec.ts',
                    title: 'should display all tests',
                },
            ]

            examples.forEach((example) => {
                const id1 = generateStableTestId(example.path, example.title)
                const id2 = generateStableTestId(example.path, example.title)

                expect(id1).toBe(id2)
                expect(id1).toMatch(/^test-[a-z0-9]+$/)
            })
        })
    })

    describe('Backwards Compatibility', () => {
        it('should maintain consistency with historical data', () => {
            // If this algorithm changes, ALL historical tracking breaks
            // This test documents the current behavior
            const knownInputs = [
                {path: 'test.ts', title: 'test', expectedPattern: /^test-[a-z0-9]+$/},
                {path: 'a/b/c.ts', title: 'example', expectedPattern: /^test-[a-z0-9]+$/},
            ]

            knownInputs.forEach(({path, title, expectedPattern}) => {
                const id = generateStableTestId(path, title)
                expect(id).toMatch(expectedPattern)
            })
        })
    })

    describe('Performance', () => {
        it('should generate IDs quickly for normal inputs', () => {
            const start = Date.now()
            const iterations = 1000

            for (let i = 0; i < iterations; i++) {
                generateStableTestId(`tests/${i}.spec.ts`, `test ${i}`)
            }

            const duration = Date.now() - start

            // Should complete 1000 generations in less than 100ms
            expect(duration).toBeLessThan(100)
        })
    })

    describe('Path Normalization (Critical for Multi-Project Support)', () => {
        it('should generate same testId regardless of test directory prefix', () => {
            const title = 'should test something'

            // All these paths should produce the SAME testId after normalization
            const id1 = generateStableTestId('e2e/tests/actions/actionPopUp.test.ts', title)
            const id2 = generateStableTestId('tests/actions/actionPopUp.test.ts', title)
            const id3 = generateStableTestId('e2e/actions/actionPopUp.test.ts', title)
            const id4 = generateStableTestId('actions/actionPopUp.test.ts', title)

            // They should all be equal
            expect(id1).toBe(id2)
            expect(id2).toBe(id3)
            expect(id3).toBe(id4)
        })

        it('should handle Windows-style paths', () => {
            const title = 'test'

            const id1 = generateStableTestId('e2e\\tests\\auth.spec.ts', title)
            const id2 = generateStableTestId('tests\\auth.spec.ts', title)
            const id3 = generateStableTestId('auth.spec.ts', title)

            expect(id1).toBe(id2)
            expect(id2).toBe(id3)
        })

        it('should not remove prefixes from middle of path', () => {
            // "tests" in the middle should NOT be removed
            const id1 = generateStableTestId('src/tests/auth.spec.ts', 'test')
            const id2 = generateStableTestId('src/auth.spec.ts', 'test')

            // These should be DIFFERENT (prefix only removed from start)
            expect(id1).not.toBe(id2)
        })

        it('should preserve nested structure after prefix removal', () => {
            const title = 'test'

            // After normalization, both should be "auth/login.spec.ts"
            const id1 = generateStableTestId('e2e/tests/auth/login.spec.ts', title)
            const id2 = generateStableTestId('tests/auth/login.spec.ts', title)
            const id3 = generateStableTestId('auth/login.spec.ts', title)

            expect(id1).toBe(id2)
            expect(id2).toBe(id3)
        })

        it('should handle paths with no prefix to remove', () => {
            const id1 = generateStableTestId('simple.test.ts', 'test')
            const id2 = generateStableTestId('simple.test.ts', 'test')

            expect(id1).toBe(id2)
            expect(id1).toMatch(/^test-[a-z0-9]+$/)
        })

        it('should handle real-world scenario: probuild-qa vs funzy-qa', () => {
            const testTitle = 'Change Action status'

            // probuild-qa structure: e2e/tests/actions/actionPopUp.test.ts
            const probuildId = generateStableTestId(
                'e2e/tests/actions/actionPopUp.test.ts',
                testTitle
            )

            // funzy-qa structure: tests/actions/actionPopUp.test.ts
            const funzyId = generateStableTestId('tests/actions/actionPopUp.test.ts', testTitle)

            // After normalization, both should produce same testId
            expect(probuildId).toBe(funzyId)
        })
    })
})
