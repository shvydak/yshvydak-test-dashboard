#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose()
const path = require('path')

// Connect to the database
const dbPath = path.join(
     __dirname,
     'packages/server/test-results/test-results.db',
)
console.log(`📁 Connecting to database: ${dbPath}`)

const db = new sqlite3.Database(dbPath, (err) => {
     if (err) {
          console.error('❌ Error connecting to database:', err.message)
          process.exit(1)
     }
     console.log('✅ Connected to the database')
})

// Query to check test results with timestamps
const query = `
    SELECT 
        id,
        test_id,
        name,
        status,
        run_id,
        created_at,
        updated_at,
        duration
    FROM test_results 
    WHERE test_id = 'test-66jqtq' 
    ORDER BY updated_at DESC
    LIMIT 5
`

console.log('\n🔍 Checking timestamps for test-66jqtq:')
console.log('='.repeat(80))

db.all(query, [], (err, rows) => {
     if (err) {
          console.error('❌ Query error:', err.message)
          return
     }

     if (rows.length === 0) {
          console.log('❌ No records found for test-66jqtq')
     } else {
          console.log(`✅ Found ${rows.length} records:`)
          console.log('')

          rows.forEach((row, index) => {
               console.log(`📊 Record ${index + 1}:`)
               console.log(`   ID: ${row.id}`)
               console.log(`   Test ID: ${row.test_id}`)
               console.log(`   Name: ${row.name}`)
               console.log(`   Status: ${row.status}`)
               console.log(`   Run ID: ${row.run_id}`)
               console.log(`   Created: ${row.created_at}`)
               console.log(`   Updated: ${row.updated_at}`)
               console.log(`   Duration: ${row.duration}ms`)
               console.log('   ' + '-'.repeat(50))
          })

          // Check if timestamps are different
          if (rows.length > 1) {
               const latest = rows[0]
               const previous = rows[1]

               console.log('\n🕐 Timestamp Analysis:')
               console.log(`   Latest updated_at:  ${latest.updated_at}`)
               console.log(`   Previous updated_at: ${previous.updated_at}`)

               if (latest.updated_at !== previous.updated_at) {
                    console.log(
                         '   ✅ Timestamps are different - updates are working!',
                    )
               } else {
                    console.log(
                         '   ❌ Timestamps are the same - updates are NOT working!',
                    )
               }
          }
     }

     // Also check the latest record for each unique test_id
     console.log('\n🔍 Latest records for all tests (top 10):')
     console.log('='.repeat(80))

     const latestQuery = `
        SELECT 
            test_id,
            name,
            status,
            created_at,
            updated_at
        FROM test_results tr1
        WHERE tr1.id IN (
            SELECT id FROM test_results tr2 
            WHERE tr2.test_id = tr1.test_id 
            ORDER BY tr2.updated_at DESC 
            LIMIT 1
        )
        ORDER BY tr1.updated_at DESC
        LIMIT 10
    `

     db.all(latestQuery, [], (err, latestRows) => {
          if (err) {
               console.error('❌ Latest query error:', err.message)
               return
          }

          latestRows.forEach((row, index) => {
               console.log(`${index + 1}. ${row.name} (${row.test_id})`)
               console.log(`   Status: ${row.status}`)
               console.log(`   Created: ${row.created_at}`)
               console.log(`   Updated: ${row.updated_at}`)
               console.log('')
          })

          // Close the database connection
          db.close((err) => {
               if (err) {
                    console.error('❌ Error closing database:', err.message)
               } else {
                    console.log('✅ Database connection closed')
               }
          })
     })
})
