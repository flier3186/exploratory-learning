import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './styles-sidebar.css'
import './styles-workspace.css'
import './styles-followup.css'
import './styles-checks.css'
import './styles-modal.css'
import './styles-quiz.css'
import './styles-graph.css'
import './styles-markdown.css'
import './styles-roles.css'
import App from './App'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA 注册失败不影响正常学习流程。
    })
  })
}
