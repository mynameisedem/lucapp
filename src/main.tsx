import { createRoot } from 'react-dom/client'
import { App } from './App'
import { handleOAuthRedirect, startAutoSync } from './drive'
import './styles.css'

handleOAuthRedirect()
navigator.storage?.persist?.()
startAutoSync()
createRoot(document.getElementById('root')!).render(<App />)
