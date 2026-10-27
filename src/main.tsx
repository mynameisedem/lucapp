import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

navigator.storage?.persist?.()
createRoot(document.getElementById('root')!).render(<App />)
