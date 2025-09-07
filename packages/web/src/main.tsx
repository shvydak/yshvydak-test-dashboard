import React from 'react'
import ReactDOM from 'react-dom/client'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'

// Create a client
const queryClient = new QueryClient({
     defaultOptions: {
          queries: {
               staleTime: 1000 * 60 * 5, // 5 minutes
               retry: 2,
               refetchOnWindowFocus: false,
          },
     },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
     <React.StrictMode>
          <QueryClientProvider client={queryClient}>
               <App />
          </QueryClientProvider>
     </React.StrictMode>,
)
