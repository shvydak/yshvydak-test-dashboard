/**
 * Vitest Setup for Web Package
 *
 * This file runs before all tests in the web package.
 * Sets up React Testing Library, jsdom, and global test utilities.
 */

import {afterEach, beforeAll} from 'vitest'
import {cleanup} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Setup before all tests
beforeAll(() => {
	// Mock window.matchMedia (for theme detection, responsive components)
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {}, // Deprecated
			removeListener: () => {}, // Deprecated
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => true,
		}),
	})

	// Mock IntersectionObserver (if needed for lazy loading, etc.)
	global.IntersectionObserver = class IntersectionObserver {
		constructor() {}
		disconnect() {}
		observe() {}
		takeRecords() {
			return []
		}
		unobserve() {}
	} as any
})

// Cleanup after each test (React Testing Library)
afterEach(() => {
	cleanup()
})
