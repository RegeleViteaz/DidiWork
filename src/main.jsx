import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ─────────────────────────────────────────────────────────
// window.storage polyfill using localStorage
// This mimics Claude.ai's artifact storage API so the app
// runs unchanged outside of Claude.ai.
// ─────────────────────────────────────────────────────────
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    get: async (key) => {
      try {
        const value = localStorage.getItem(key)
        return value !== null ? { key, value, shared: false } : null
      } catch (e) {
        console.error('storage.get failed:', e)
        return null
      }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value)
        return { key, value, shared: false }
      } catch (e) {
        console.error('storage.set failed:', e)
        return null
      }
    },
    delete: async (key) => {
      try {
        localStorage.removeItem(key)
        return { key, deleted: true, shared: false }
      } catch (e) {
        console.error('storage.delete failed:', e)
        return null
      }
    },
    list: async (prefix = '') => {
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix))
        return { keys, prefix, shared: false }
      } catch (e) {
        console.error('storage.list failed:', e)
        return null
      }
    },
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
