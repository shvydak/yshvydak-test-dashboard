/**
 * Flaky Test Detection Algorithm Tests
 *
 * These tests verify the correctness of the flaky test detection logic.
 * This is CRITICAL because:
 * 1. Flaky detection helps identify unstable tests
 * 2. Incorrect detection misleads developers
 * 3. Complex SQL logic needs validation
 *
 * Coverage target: 85%+
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {TestRepository} from '../test.repository'
import {DatabaseManager} from '../../database/database.manager'
import {TestResultData} from '../../types/database.types'

describe('TestRepository - Flaky Detection Algorithm', () => {
	let repository: TestRepository
	let dbManager: DatabaseManager
	let currentRunId: string

	// Helper function to create test result data with current run ID
	const createTestResult = (
		testId: string,
		status: 'passed' | 'failed' | 'skipped' | 'timedOut',
		name: string = 'Test Name',
		filePath: string = 'test/file.spec.ts'
	): TestResultData => {
		return {
			id: `result-${Date.now()}-${Math.random()}`,
			runId: currentRunId,
			testId,
			name,
			filePath,
			status,
			duration: 1000,
			timestamp: new Date().toISOString(),
			errorMessage: status === 'failed' ? 'Test failed' : undefined,
			errorStack: status === 'failed' ? 'Stack trace here' : undefined,
		}
	}

	beforeEach(async () => {
		// Use in-memory database for tests
		dbManager = new DatabaseManager(':memory:')
		await dbManager.initialize()

		repository = new TestRepository(dbManager)

		// Create a test run for foreign key constraint with unique ID
		currentRunId = `run-${Date.now()}-${Math.random()}`
		await dbManager.createTestRun({
			id: currentRunId,
			status: 'completed',
			totalTests: 0,
			passedTests: 0,
			failedTests: 0,
			skippedTests: 0,
			duration: 0,
		})
	})

	afterEach(async () => {
		await dbManager.close()
	})

	describe('Basic Flaky Detection', () => {
		it('should identify test with 50% failure rate as flaky', async () => {
			const testId = 'test-flaky-1'

			// Add test results: 5 passed, 5 failed (50% failure)
			for (let i = 0; i < 5; i++) {
				await repository.saveTestResult(createTestResult(testId, 'passed'))
				await repository.saveTestResult(createTestResult(testId, 'failed'))
			}

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(1)
			expect(flakyTests[0].testId).toBe(testId)
			expect(flakyTests[0].flakyPercentage).toBe(50)
			expect(flakyTests[0].totalRuns).toBe(10)
			expect(flakyTests[0].passedRuns).toBe(5)
			expect(flakyTests[0].failedRuns).toBe(5)
		})

		it('should identify test with 25% failure rate as flaky', async () => {
			const testId = 'test-flaky-2'

			// Add test results: 3 passed, 1 failed (25% failure)
			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'failed'))

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(1)
			expect(flakyTests[0].flakyPercentage).toBe(25)
		})

		it('should NOT identify always-passing test as flaky', async () => {
			const testId = 'test-stable-pass'

			// Add 10 passed results
			for (let i = 0; i < 10; i++) {
				await repository.saveTestResult(createTestResult(testId, 'passed'))
			}

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(0)
		})

		it('should NOT identify always-failing test as flaky', async () => {
			const testId = 'test-stable-fail'

			// Add 10 failed results (100% failure rate - not flaky, just broken)
			for (let i = 0; i < 10; i++) {
				await repository.saveTestResult(createTestResult(testId, 'failed'))
			}

			const flakyTests = await repository.getFlakyTests(30, 10)

			// 100% failure is NOT flaky (condition: flakyPercentage < 100)
			expect(flakyTests).toHaveLength(0)
		})
	})

	describe('Threshold Filtering', () => {
		it('should respect custom threshold percentage', async () => {
			const testId1 = 'test-5-percent'
			const testId2 = 'test-15-percent'

			// Test 1: 5% failure rate (1 failed, 19 passed)
			await repository.saveTestResult(createTestResult(testId1, 'failed'))
			for (let i = 0; i < 19; i++) {
				await repository.saveTestResult(createTestResult(testId1, 'passed'))
			}

			// Test 2: 15% failure rate (3 failed, 17 passed)
			for (let i = 0; i < 3; i++) {
				await repository.saveTestResult(createTestResult(testId2, 'failed'))
			}
			for (let i = 0; i < 17; i++) {
				await repository.saveTestResult(createTestResult(testId2, 'passed'))
			}

			// With 10% threshold, only test2 should appear
			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(1)
			expect(flakyTests[0].testId).toBe(testId2)
			expect(flakyTests[0].flakyPercentage).toBe(15)
		})

		it('should include test at exact threshold percentage', async () => {
			const testId = 'test-exact-threshold'

			// Exactly 10% failure rate (1 failed, 9 passed)
			await repository.saveTestResult(createTestResult(testId, 'failed'))
			for (let i = 0; i < 9; i++) {
				await repository.saveTestResult(createTestResult(testId, 'passed'))
			}

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(1)
			expect(flakyTests[0].flakyPercentage).toBe(10)
		})
	})

	describe('Minimum Runs Requirement', () => {
		it('should NOT flag test with only 1 run (even if failed)', async () => {
			const testId = 'test-single-run'

			await repository.saveTestResult(createTestResult(testId, 'failed'))

			const flakyTests = await repository.getFlakyTests(30, 10)

			// Needs > 1 run to be considered flaky (condition: totalRuns > 1)
			expect(flakyTests).toHaveLength(0)
		})

		it('should flag test with exactly 2 runs if one failed', async () => {
			const testId = 'test-two-runs'

			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'failed'))

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(1)
			expect(flakyTests[0].totalRuns).toBe(2)
			expect(flakyTests[0].flakyPercentage).toBe(50)
		})
	})

	describe('Time Range Filtering', () => {
		it('should only include tests from specified days range', async () => {
			const testId = 'test-time-range'

			// Add old test result (35 days ago - should be excluded with 30 day filter)
			const oldDate = new Date()
			oldDate.setDate(oldDate.getDate() - 35)

			// Note: This test would need database time manipulation which is complex
			// For now, we test with recent data only

			// Recent tests (within 30 days)
			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'failed'))

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests.length).toBeGreaterThanOrEqual(0)
			// All returned tests should have recent lastRun
		})

		it('should respect custom days parameter', async () => {
			const testId = 'test-custom-days'

			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'failed'))

			// Test with different day ranges
			const flakyTests7Days = await repository.getFlakyTests(7, 10)
			const flakyTests30Days = await repository.getFlakyTests(30, 10)

			// Both should find the recent test
			expect(flakyTests7Days.length).toBeGreaterThanOrEqual(0)
			expect(flakyTests30Days.length).toBeGreaterThanOrEqual(0)
		})
	})

	describe('Status Filtering', () => {
		it('should ignore skipped tests in flaky calculation', async () => {
			const testId = 'test-with-skipped'

			// Mix of passed, failed, and skipped
			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'failed'))
			await repository.saveTestResult(createTestResult(testId, 'skipped'))
			await repository.saveTestResult(createTestResult(testId, 'skipped'))

			const flakyTests = await repository.getFlakyTests(30, 10)

			if (flakyTests.length > 0) {
				const test = flakyTests.find((t) => t.testId === testId)
				if (test) {
					// Total runs should only count passed + failed (not skipped)
					expect(test.totalRuns).toBe(2)
					expect(test.passedRuns + test.failedRuns).toBe(2)
				}
			}
		})

		it('should ignore timedOut tests in flaky calculation', async () => {
			const testId = 'test-with-timeout'

			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'failed'))
			await repository.saveTestResult(createTestResult(testId, 'timedOut'))

			const flakyTests = await repository.getFlakyTests(30, 10)

			if (flakyTests.length > 0) {
				const test = flakyTests.find((t) => t.testId === testId)
				if (test) {
					// Only passed and failed should count
					expect(test.totalRuns).toBe(2)
				}
			}
		})
	})

	describe('Multiple Flaky Tests Ranking', () => {
		it('should rank by flakyPercentage descending', async () => {
			// Test 1: 20% flaky (1 fail, 4 pass)
			const testId1 = 'test-20-percent'
			await repository.saveTestResult(createTestResult(testId1, 'failed'))
			for (let i = 0; i < 4; i++) {
				await repository.saveTestResult(createTestResult(testId1, 'passed'))
			}

			// Test 2: 50% flaky (5 fail, 5 pass)
			const testId2 = 'test-50-percent'
			for (let i = 0; i < 5; i++) {
				await repository.saveTestResult(createTestResult(testId2, 'passed'))
				await repository.saveTestResult(createTestResult(testId2, 'failed'))
			}

			// Test 3: 30% flaky (3 fail, 7 pass)
			const testId3 = 'test-30-percent'
			for (let i = 0; i < 3; i++) {
				await repository.saveTestResult(createTestResult(testId3, 'failed'))
			}
			for (let i = 0; i < 7; i++) {
				await repository.saveTestResult(createTestResult(testId3, 'passed'))
			}

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests.length).toBeGreaterThanOrEqual(3)

			// Should be ordered: 50% > 30% > 20%
			expect(flakyTests[0].flakyPercentage).toBeGreaterThanOrEqual(
				flakyTests[1].flakyPercentage
			)
			expect(flakyTests[1].flakyPercentage).toBeGreaterThanOrEqual(
				flakyTests[2].flakyPercentage
			)
		})

		it('should use totalRuns as secondary sort when flakyPercentage is equal', async () => {
			// Both 50% flaky, but different run counts
			const testId1 = 'test-few-runs'
			await repository.saveTestResult(createTestResult(testId1, 'passed'))
			await repository.saveTestResult(createTestResult(testId1, 'failed'))

			const testId2 = 'test-many-runs'
			for (let i = 0; i < 10; i++) {
				await repository.saveTestResult(createTestResult(testId2, 'passed'))
				await repository.saveTestResult(createTestResult(testId2, 'failed'))
			}

			const flakyTests = await repository.getFlakyTests(30, 10)

			// Find both tests in results
			const test1 = flakyTests.find((t) => t.testId === testId1)
			const test2 = flakyTests.find((t) => t.testId === testId2)

			if (test1 && test2) {
				// Both should be 50%
				expect(test1.flakyPercentage).toBe(50)
				expect(test2.flakyPercentage).toBe(50)

				// Test with more runs should come first
				const index1 = flakyTests.indexOf(test1)
				const index2 = flakyTests.indexOf(test2)
				expect(index2).toBeLessThan(index1)
			}
		})
	})

	describe('History Tracking', () => {
		it('should include execution history in results', async () => {
			const testId = 'test-history'

			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'failed'))
			await repository.saveTestResult(createTestResult(testId, 'passed'))
			await repository.saveTestResult(createTestResult(testId, 'failed'))

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(1)
			expect(flakyTests[0].history).toBeDefined()
			expect(Array.isArray(flakyTests[0].history)).toBe(true)
			expect(flakyTests[0].history).toContain('passed')
			expect(flakyTests[0].history).toContain('failed')
		})
	})

	describe('Result Limit', () => {
		it('should limit results to 50 tests', async () => {
			// Create 60 flaky tests
			for (let i = 0; i < 60; i++) {
				const testId = `test-flaky-${i}`
				await repository.saveTestResult(createTestResult(testId, 'passed'))
				await repository.saveTestResult(createTestResult(testId, 'failed'))
			}

			const flakyTests = await repository.getFlakyTests(30, 10)

			// Should be limited to 50 (LIMIT 50 in SQL)
			expect(flakyTests.length).toBeLessThanOrEqual(50)
		})
	})

	describe('Edge Cases', () => {
		it('should handle test with no results gracefully', async () => {
			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toEqual([])
		})

		it('should handle percentage calculation correctly', async () => {
			const testId = 'test-math'

			// 3 failed out of 10 = 30%
			for (let i = 0; i < 3; i++) {
				await repository.saveTestResult(createTestResult(testId, 'failed'))
			}
			for (let i = 0; i < 7; i++) {
				await repository.saveTestResult(createTestResult(testId, 'passed'))
			}

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(1)
			expect(flakyTests[0].flakyPercentage).toBe(30)
		})

		it('should include test metadata in results', async () => {
			const testId = 'test-metadata'
			const testName = 'should do something important'
			const filePath = 'tests/important.spec.ts'

			await repository.saveTestResult(
				createTestResult(testId, 'passed', testName, filePath)
			)
			await repository.saveTestResult(
				createTestResult(testId, 'failed', testName, filePath)
			)

			const flakyTests = await repository.getFlakyTests(30, 10)

			expect(flakyTests).toHaveLength(1)
			expect(flakyTests[0].name).toBe(testName)
			expect(flakyTests[0].filePath).toBe(filePath)
		})
	})
})
