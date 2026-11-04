import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startAutoSync } from './drive'
import './styles.css'

navigator.storage?.persist?.()
startAutoSync()
createRoot(document.getElementById('root')!).render(<App />)
