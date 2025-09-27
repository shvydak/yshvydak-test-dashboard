import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProviderWrapper } from './components/AuthProvider'
import App from './App'
import './index.css'

console.log('🚀 Starting YShvydak Test Dashboard...')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

try {
  const root = ReactDOM.createRoot(document.getElementById('root')!)

  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProviderWrapper>
            <App />
          </AuthProviderWrapper>
        </QueryClientProvider>
      </BrowserRouter>
    </React.StrictMode>
  )

  console.log('✅ Dashboard app initialized successfully!')
} catch (error) {
  console.error('❌ Error starting dashboard:', error)
  document.getElementById('root')!.innerHTML = `
    <div style="padding:20px;background:#fee2e2;border:2px solid #dc2626;margin:20px;border-radius:8px;">
      <h1 style="color:#dc2626;">❌ Dashboard Error</h1>
      <pre>${String(error)}</pre>
    </div>
  `
}
