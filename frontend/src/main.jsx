// =============================================
// TRADING MASTER PRO - MAIN.JSX
// =============================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#18181b',
            color: '#fff',
            border: '1px solid #27272a'
          },
          success: {
            iconTheme: {
              primary: '#22c55e',
              secondary: '#fff'
            }
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff'
            }
          }
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
