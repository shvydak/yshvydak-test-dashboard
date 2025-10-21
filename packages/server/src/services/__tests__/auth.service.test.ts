/**
 * JWT Authentication Service Tests (SECURITY CRITICAL)
 *
 * These tests verify the security and correctness of JWT authentication.
 * This is CRITICAL because:
 * 1. Authentication protects the entire dashboard
 * 2. JWT tokens control access to all API endpoints
 * 3. Security vulnerabilities here affect entire system
 *
 * Coverage target: 90%+
 */

import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest'
import {AuthService} from '../auth.service'

describe('AuthService', () => {
	let authService: AuthService
	const originalEnv = process.env

	beforeEach(() => {
		// Reset environment before each test
		vi.resetModules()
		process.env = {
			...originalEnv,
			ENABLE_AUTH: 'true',
			JWT_SECRET: 'test-secret-key',
			JWT_EXPIRES_IN: '1h',
			ADMIN_EMAIL: 'admin@example.com',
			ADMIN_PASSWORD: 'admin123',
		}

		authService = new AuthService()
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
	})

	describe('Initialization', () => {
		it('should initialize successfully with valid environment variables', () => {
			expect(authService).toBeDefined()
			expect(authService.isAuthEnabled()).toBe(true)
		})

		it('should throw error when JWT_SECRET is missing', () => {
			delete process.env.JWT_SECRET

			expect(() => new AuthService()).toThrow('JWT_SECRET environment variable is required')
		})

		it('should throw error when ADMIN_EMAIL is missing', () => {
			delete process.env.ADMIN_EMAIL

			expect(() => new AuthService()).toThrow(
				'ADMIN_EMAIL environment variable is required when authentication is enabled'
			)
		})

		it('should throw error when ADMIN_PASSWORD is missing', () => {
			delete process.env.ADMIN_PASSWORD

			expect(() => new AuthService()).toThrow(
				'ADMIN_PASSWORD environment variable is required when authentication is enabled'
			)
		})

		it('should support multiple users via ADMIN_USERS', () => {
			process.env.ADMIN_USERS = JSON.stringify([
				{email: 'admin1@test.com', password: 'pass1', role: 'admin'},
				{email: 'admin2@test.com', password: 'pass2', role: 'viewer'},
			])
			delete process.env.ADMIN_EMAIL
			delete process.env.ADMIN_PASSWORD

			const service = new AuthService()
			const users = service.getConfiguredUsers()

			expect(users).toHaveLength(2)
			expect(users).toContain('admin1@test.com')
			expect(users).toContain('admin2@test.com')
		})
	})

	describe('Login', () => {
		it('should successfully login with valid credentials', async () => {
			const result = await authService.login({
				email: 'admin@example.com',
				password: 'admin123',
			})

			expect(result.success).toBe(true)
			expect(result.token).toBeDefined()
			expect(result.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/) // JWT format: xxx.yyy.zzz
			expect(result.user).toEqual({
				email: 'admin@example.com',
				role: 'admin',
			})
			expect(result.expiresIn).toBe('1h')
		})

		it('should fail login with invalid email', async () => {
			const result = await authService.login({
				email: 'wrong@example.com',
				password: 'admin123',
			})

			expect(result.success).toBe(false)
			expect(result.token).toBeUndefined()
			expect(result.message).toBe('Invalid email or password')
		})

		it('should fail login with invalid password', async () => {
			const result = await authService.login({
				email: 'admin@example.com',
				password: 'wrongpassword',
			})

			expect(result.success).toBe(false)
			expect(result.token).toBeUndefined()
			expect(result.message).toBe('Invalid email or password')
		})

		it('should fail login with empty email', async () => {
			const result = await authService.login({
				email: '',
				password: 'admin123',
			})

			expect(result.success).toBe(false)
		})

		it('should fail login with empty password', async () => {
			const result = await authService.login({
				email: 'admin@example.com',
				password: '',
			})

			expect(result.success).toBe(false)
		})

		it('should be case-sensitive for email', async () => {
			const result = await authService.login({
				email: 'ADMIN@EXAMPLE.COM',
				password: 'admin123',
			})

			expect(result.success).toBe(false)
		})

		it('should generate different tokens for each login', async () => {
			const result1 = await authService.login({
				email: 'admin@example.com',
				password: 'admin123',
			})

			// Wait at least 1 second to ensure different iat (issued at) timestamp
			// fast-jwt uses seconds precision for iat, so we need to wait 1000ms
			await new Promise((resolve) => setTimeout(resolve, 1000))

			const result2 = await authService.login({
				email: 'admin@example.com',
				password: 'admin123',
			})

			expect(result1.success).toBe(true)
			expect(result2.success).toBe(true)
			expect(result1.token).not.toBe(result2.token)
		})
	})

	describe('JWT Verification', () => {
		it('should successfully verify valid token', async () => {
			// First, login to get a token
			const loginResult = await authService.login({
				email: 'admin@example.com',
				password: 'admin123',
			})

			expect(loginResult.success).toBe(true)
			const token = loginResult.token!

			// Now verify the token
			const verifyResult = await authService.verifyJWT(token)

			expect(verifyResult.valid).toBe(true)
			expect(verifyResult.user).toEqual({
				email: 'admin@example.com',
				role: 'admin',
			})
		})

		it('should verify token with Bearer prefix', async () => {
			const loginResult = await authService.login({
				email: 'admin@example.com',
				password: 'admin123',
			})

			const token = loginResult.token!
			const bearerToken = `Bearer ${token}`

			const verifyResult = await authService.verifyJWT(bearerToken)

			expect(verifyResult.valid).toBe(true)
			expect(verifyResult.user?.email).toBe('admin@example.com')
		})

		it('should fail verification with empty token', async () => {
			const verifyResult = await authService.verifyJWT('')

			expect(verifyResult.valid).toBe(false)
			expect(verifyResult.message).toBe('No token provided')
		})

		it('should fail verification with invalid token format', async () => {
			const verifyResult = await authService.verifyJWT('invalid-token')

			expect(verifyResult.valid).toBe(false)
			expect(verifyResult.message).toBe('Invalid or expired token')
		})

		it('should fail verification with malformed JWT', async () => {
			const verifyResult = await authService.verifyJWT('xxx.yyy.zzz')

			expect(verifyResult.valid).toBe(false)
			expect(verifyResult.message).toBe('Invalid or expired token')
		})

		it('should fail verification with token signed by different secret', async () => {
			// Create token with original service
			const loginResult = await authService.login({
				email: 'admin@example.com',
				password: 'admin123',
			})

			const token = loginResult.token!

			// Create new service with different secret
			process.env.JWT_SECRET = 'different-secret'
			const newService = new AuthService()

			// Try to verify with different secret
			const verifyResult = await newService.verifyJWT(token)

			expect(verifyResult.valid).toBe(false)
		})

		it('should fail if user no longer exists in configuration', async () => {
			// Login and get token
			const loginResult = await authService.login({
				email: 'admin@example.com',
				password: 'admin123',
			})

			const token = loginResult.token!

			// Simulate user removal by creating new service without that user
			process.env.ADMIN_EMAIL = 'different@example.com'
			process.env.ADMIN_PASSWORD = 'different123'
			const newService = new AuthService()

			// Original token should fail verification
			const verifyResult = await newService.verifyJWT(token)

			expect(verifyResult.valid).toBe(false)
			expect(verifyResult.message).toBe('User no longer exists')
		})
	})

	describe('Token Expiration', () => {
		it('should fail verification of expired token', async () => {
			// Create service with very short expiration
			process.env.JWT_EXPIRES_IN = '1ms' // 1 millisecond
			const shortLivedService = new AuthService()

			const loginResult = await shortLivedService.login({
				email: 'admin@example.com',
				password: 'admin123',
			})

			const token = loginResult.token!

			// Wait for token to expire
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Token should be expired now
			const verifyResult = await shortLivedService.verifyJWT(token)

			expect(verifyResult.valid).toBe(false)
		}, 1000)
	})

	describe('Logout', () => {
		it('should successfully logout', async () => {
			const result = await authService.logout()

			expect(result.success).toBe(true)
			expect(result.message).toBe('Successfully logged out')
		})

		it('should logout even with invalid token', async () => {
			const result = await authService.logout('invalid-token')

			expect(result.success).toBe(true)
		})
	})

	describe('Utility Methods', () => {
		it('should return authentication enabled status', () => {
			expect(authService.isAuthEnabled()).toBe(true)
		})

		it('should return list of configured users', () => {
			const users = authService.getConfiguredUsers()

			expect(users).toHaveLength(1)
			expect(users).toContain('admin@example.com')
		})

		it('should not expose passwords in configured users list', () => {
			const users = authService.getConfiguredUsers()

			users.forEach((user) => {
				expect(user).not.toContain('password')
				expect(user).not.toContain('admin123')
			})
		})
	})

	describe('Security Edge Cases', () => {
		it('should handle SQL injection attempts in email', async () => {
			const result = await authService.login({
				email: "admin@example.com' OR '1'='1",
				password: 'admin123',
			})

			expect(result.success).toBe(false)
		})

		it('should handle XSS attempts in credentials', async () => {
			const result = await authService.login({
				email: '<script>alert("xss")</script>',
				password: 'admin123',
			})

			expect(result.success).toBe(false)
		})

		it('should handle very long email strings', async () => {
			const longEmail = 'a'.repeat(10000) + '@example.com'
			const result = await authService.login({
				email: longEmail,
				password: 'admin123',
			})

			expect(result.success).toBe(false)
		})

		it('should handle null bytes in credentials', async () => {
			const result = await authService.login({
				email: 'admin@example.com\0',
				password: 'admin123',
			})

			expect(result.success).toBe(false)
		})
	})

	describe('Multi-User Configuration', () => {
		beforeEach(() => {
			process.env.ADMIN_USERS = JSON.stringify([
				{email: 'admin@test.com', password: 'pass1', role: 'admin'},
				{email: 'viewer@test.com', password: 'pass2', role: 'viewer'},
				{email: 'editor@test.com', password: 'pass3', role: 'editor'},
			])
			delete process.env.ADMIN_EMAIL
			delete process.env.ADMIN_PASSWORD

			authService = new AuthService()
		})

		it('should authenticate all configured users', async () => {
			const adminLogin = await authService.login({
				email: 'admin@test.com',
				password: 'pass1',
			})
			const viewerLogin = await authService.login({
				email: 'viewer@test.com',
				password: 'pass2',
			})
			const editorLogin = await authService.login({
				email: 'editor@test.com',
				password: 'pass3',
			})

			expect(adminLogin.success).toBe(true)
			expect(viewerLogin.success).toBe(true)
			expect(editorLogin.success).toBe(true)

			expect(adminLogin.user?.role).toBe('admin')
			expect(viewerLogin.user?.role).toBe('viewer')
			expect(editorLogin.user?.role).toBe('editor')
		})

		it('should preserve roles in JWT tokens', async () => {
			const result = await authService.login({
				email: 'viewer@test.com',
				password: 'pass2',
			})

			expect(result.success).toBe(true)

			const verifyResult = await authService.verifyJWT(result.token!)

			expect(verifyResult.valid).toBe(true)
			expect(verifyResult.user?.role).toBe('viewer')
		})
	})
})
