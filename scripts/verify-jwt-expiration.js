#!/usr/bin/env node

/**
 * Script to verify JWT token expiration time
 *
 * Usage:
 *   node scripts/verify-jwt-expiration.js <token>
 *
 * Or set JWT_EXPIRES_IN in .env and login to get a token, then:
 *   node scripts/verify-jwt-expiration.js $(curl -s -X POST http://localhost:3001/api/auth/login \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"admin@admin.com","password":"qwe123"}' | jq -r '.data.token')
 */

const token = process.argv[2]

if (!token) {
    console.error('Usage: node scripts/verify-jwt-expiration.js <jwt-token>')
    process.exit(1)
}

try {
    const parts = token.split('.')
    if (parts.length !== 3) {
        console.error('Invalid JWT token format')
        process.exit(1)
    }

    // Decode payload (base64url)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))

    if (!payload.exp || !payload.iat) {
        console.error('Token missing exp or iat claims')
        process.exit(1)
    }

    const expirationSeconds = payload.exp - payload.iat
    const expirationDays = expirationSeconds / (24 * 60 * 60)
    const expirationHours = expirationSeconds / (60 * 60)
    const expirationMinutes = expirationSeconds / 60

    const now = Math.floor(Date.now() / 1000)
    const expiresAt = new Date(payload.exp * 1000)
    const issuedAt = new Date(payload.iat * 1000)
    const timeUntilExpiry = payload.exp - now

    console.log('\n📋 JWT Token Expiration Details\n')
    console.log(`Issued at:     ${issuedAt.toISOString()}`)
    console.log(`Expires at:    ${expiresAt.toISOString()}`)
    console.log(`\nDuration:`)
    console.log(`  ${expirationDays.toFixed(2)} days`)
    console.log(`  ${expirationHours.toFixed(2)} hours`)
    console.log(`  ${expirationMinutes.toFixed(2)} minutes`)
    console.log(`  ${expirationSeconds} seconds`)

    if (timeUntilExpiry > 0) {
        const daysLeft = Math.floor(timeUntilExpiry / (24 * 60 * 60))
        const hoursLeft = Math.floor((timeUntilExpiry % (24 * 60 * 60)) / (60 * 60))
        const minutesLeft = Math.floor((timeUntilExpiry % (60 * 60)) / 60)
        console.log(`\n⏰ Time until expiry:`)
        console.log(`  ${daysLeft} days, ${hoursLeft} hours, ${minutesLeft} minutes`)
    } else {
        console.log(`\n❌ Token has expired`)
    }

    // Verify it's approximately 30 days
    const expectedSeconds = 30 * 24 * 60 * 60
    const tolerance = 60 // 1 minute tolerance
    const difference = Math.abs(expirationSeconds - expectedSeconds)

    console.log(`\n✅ Verification:`)
    if (difference < tolerance) {
        console.log(
            `  Token expiration is correctly set to ~30 days (${expirationDays.toFixed(2)} days)`
        )
    } else {
        console.log(
            `  ⚠️  Token expiration is ${expirationDays.toFixed(2)} days (expected ~30 days)`
        )
        console.log(`  Difference: ${difference} seconds`)
    }

    console.log('')
} catch (error) {
    console.error('Error decoding token:', error.message)
    process.exit(1)
}
