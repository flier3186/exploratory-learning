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
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // 监听新 Service Worker 安装
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 有新版本已下载，提示用户刷新
            showUpdateToast()
          }
        })
      })
    }).catch(() => {
      // PWA 注册失败不影响正常学习流程。
    })

    // 监听 controller 变化（用户从旧 SW 切换到新 SW）
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  })
}

/** 显示"有新版本，请刷新"提示 */
function showUpdateToast() {
  // 避免重复提示
  if (document.getElementById('sw-update-toast')) return
  const toast = document.createElement('div')
  toast.id = 'sw-update-toast'
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(13, 148, 136, 0.95); color: #fff; padding: 12px 24px;
    border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    z-index: 9999; font-size: 14px; display: flex; align-items: center; gap: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    animation: sw-toast-in 0.3s ease;
  `
  toast.innerHTML = `
    <span>有新版本可用</span>
    <button style="background:#fff;color:#0d9488;border:none;padding:6px 16px;border-radius:8px;cursor:pointer;font-weight:600;">刷新</button>
    <button style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.4);padding:6px 12px;border-radius:8px;cursor:pointer;">稍后</button>
  `
  document.body.appendChild(toast)

  // 添加动画样式
  const style = document.createElement('style')
  style.textContent = `@keyframes sw-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`
  document.head.appendChild(style)

  // 刷新按钮
  toast.querySelector('button:first-child')?.addEventListener('click', () => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      } else {
        window.location.reload()
      }
    })
  })

  // 稍后按钮
  toast.querySelector('button:last-child')?.addEventListener('click', () => {
    toast.remove()
  })

  // 30 秒后自动消失
  setTimeout(() => toast.remove(), 30000)
}
