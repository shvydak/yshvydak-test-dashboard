import { useMemo } from 'react'
import { TestResult } from '@yshvydak/core'

export interface TestGroupData {
	filePath: string
	tests: TestResult[]
	total: number
	passed: number
	failed: number
	skipped: number
	pending: number
}

export function useTestGroups(tests: TestResult[]): TestGroupData[] {
	return useMemo(() => {
		const grouped = tests.reduce((acc, test) => {
			const filePath = test.filePath || 'Unknown File'
			if (!acc[filePath]) {
				acc[filePath] = []
			}
			acc[filePath].push(test)
			return acc
		}, {} as Record<string, TestResult[]>)

		return Object.entries(grouped)
			.sort(([filePathA], [filePathB]) => filePathA.localeCompare(filePathB))
			.map(([filePath, testsInFile]) => {
				const sortedTestsInFile = [...testsInFile].sort((a, b) => {
					const nameA = a.name || ''
					const nameB = b.name || ''
					const nameComparison = nameA.localeCompare(nameB)
					if (nameComparison !== 0) return nameComparison
					return a.id.localeCompare(b.id)
				})

				return {
					filePath,
					tests: sortedTestsInFile,
					total: testsInFile.length,
					passed: testsInFile.filter((t) => t.status === 'passed').length,
					failed: testsInFile.filter((t) => t.status === 'failed').length,
					skipped: testsInFile.filter((t) => t.status === 'skipped').length,
					pending: testsInFile.filter((t) => t.status === 'pending').length,
				}
			})
	}, [tests])
}