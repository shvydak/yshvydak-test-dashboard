import React from 'react'

export default function TestApp() {
  console.log('🧪 TestApp component rendered')

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🧪 Test App - Authentication Debug</h1>
      <p>If you can see this, React is working!</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </div>
  )
}