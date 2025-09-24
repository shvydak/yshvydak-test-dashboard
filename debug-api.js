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

// Same SQL query as in the API
const sql = `
    SELECT tr.*, 
           a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
    FROM test_results tr
    LEFT JOIN attachments a ON tr.id = a.test_result_id
    WHERE tr.id IN (
        SELECT id FROM test_results tr2 
        WHERE tr2.test_id = tr.test_id 
        ORDER BY tr2.updated_at DESC 
        LIMIT 1
    )
    ORDER BY tr.updated_at DESC
    LIMIT 5
`

console.log('\n🔍 Executing same SQL as API:')
console.log('='.repeat(80))

db.all(sql, [], (err, rows) => {
     if (err) {
          console.error('❌ Query error:', err.message)
          return
     }

     console.log(`✅ Found ${rows.length} rows`)

     if (rows.length > 0) {
          const firstRow = rows[0]
          console.log('\n📊 First row structure:')
          console.log('Keys:', Object.keys(firstRow))
          console.log('Full row:', firstRow)

          // Look for test-66jqtq specifically
          const targetTest = rows.find((row) => row.test_id === 'test-66jqtq')
          if (targetTest) {
               console.log('\n🎯 Found test-66jqtq:')
               console.log('Keys:', Object.keys(targetTest))
               console.log('created_at:', targetTest.created_at)
               console.log('updated_at:', targetTest.updated_at)
               console.log('Full row:', targetTest)
          } else {
               console.log('\n❌ test-66jqtq not found in results')
          }
     }

     // Close the database connection
     db.close((err) => {
          if (err) {
               console.error('❌ Error closing database:', err.message)
          } else {
               console.log('\n✅ Database connection closed')
          }
     })
})
