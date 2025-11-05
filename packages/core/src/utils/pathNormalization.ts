/**
 * Normalizes test file paths by removing common test directory prefixes.
 * This ensures consistent testId generation across different project structures.
 *
 * @param filePath - The file path to normalize
 * @returns The normalized file path with common prefixes removed
 *
 * @example
 * ```typescript
 * normalizeTestPath('e2e/tests/auth.spec.ts') // => 'auth.spec.ts'
 * normalizeTestPath('tests/auth.spec.ts')     // => 'auth.spec.ts'
 * normalizeTestPath('e2e/auth.spec.ts')       // => 'auth.spec.ts'
 * normalizeTestPath('auth.spec.ts')           // => 'auth.spec.ts'
 * ```
 */
export function normalizeTestPath(filePath: string): string {
    // Remove common test directory prefixes to ensure consistent testId
    // across different project structures (e2e/tests/, tests/, e2e/, etc.)
    const prefixesToRemove = ['e2e/tests/', 'e2e\\tests\\', 'tests/', 'tests\\', 'e2e/', 'e2e\\']

    for (const prefix of prefixesToRemove) {
        if (filePath.startsWith(prefix)) {
            return filePath.substring(prefix.length)
        }
    }

    return filePath
}
