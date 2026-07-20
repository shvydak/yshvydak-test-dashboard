import React from 'react'
import ReactDOM from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {QueryClientProvider} from '@tanstack/react-query'
import {AuthProviderWrapper} from '@features/authentication'
import {queryClient} from '@config/queryClient'
import App from './App'
import './index.css'

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
} catch (error) {
    document.getElementById('root')!.innerHTML = `
    <div style="padding:20px;background:#fee2e2;border:2px solid #dc2626;margin:20px;border-radius:8px;">
      <h1 style="color:#dc2626;">❌ Dashboard Error</h1>
      <pre>${String(error)}</pre>
    </div>
  `
}
