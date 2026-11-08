import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import PwaStatus from './PwaStatus.jsx'

try { sessionStorage.removeItem('pab-startup-retry'); } catch (_) { /* Storage may be unavailable. */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <PwaStatus />
    <Analytics />
  </StrictMode>,
)
