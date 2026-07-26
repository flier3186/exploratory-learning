const CACHE_NAME = 'exploratory-learning-shell-v32'
const CACHE_VERSION = 32

// 扩展 Shell 资产列表：覆盖 HTML 入口、manifest、图标、字体等关键资源
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/favicon.svg',
]

// 模板等可更新资源走 network-first
const NETWORK_FIRST_PATTERNS = ['/templates/']

// 走 stale-while-revalidate 的资源（JS/CSS 等构建产物）
const STALE_WHILE_REVALIDATE_PATTERN = '/assets/'

// API 调用路径前缀（跨域，不缓存，仅 pass-through）
const API_PATTERNS = ['/api/', '/openai/', '/v1/']

// 离线回退 HTML 内容
const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0d9488" />
  <title>离线中 - 探索式 AI 学习工具</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "LXGW WenKai", "Microsoft YaHei", system-ui, sans-serif;
      background: linear-gradient(135deg, #fef9ef 0%, #fff8eb 48%, #f5edd8 100%);
      color: #2c3e50;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .offline-card {
      background: #f7f9fc;
      border: 1px solid rgba(90, 120, 150, 0.18);
      border-radius: 20px;
      padding: 48px 36px;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 24px 70px rgba(90, 120, 150, 0.13);
    }
    .offline-icon { font-size: 56px; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #2c3e50; }
    p { font-size: 15px; color: #6b8299; line-height: 1.6; }
    .retry-btn {
      margin-top: 24px;
      padding: 12px 28px;
      background: #0d9488;
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .retry-btn:hover { background: #0f766e; }
  </style>
</head>
<body>
  <div class="offline-card">
    <div class="offline-icon">&#128517;</div>
    <h1>暂时无法联网</h1>
    <p>看起来网络连接已断开。<br/>已缓存的内容仍然可以浏览。<br/>请检查网络后重试。</p>
    <button class="retry-btn" onclick="location.reload()">重新连接</button>
  </div>
</body>
</html>`

function isNetworkFirst(url) {
  return NETWORK_FIRST_PATTERNS.some((p) => url.pathname.startsWith(p))
}

function isStaleWhileRevalidate(url) {
  return url.pathname.includes(STALE_WHILE_REVALIDATE_PATTERN)
}

function isApiCall(url) {
  // 跨域 API 请求或匹配 API 路径前缀
  return API_PATTERNS.some((p) => url.pathname.startsWith(p)) || url.origin !== self.location.origin
}

// 缓存匹配的容错处理
function safeCacheMatch(cache, request) {
  return cache.match(request).catch(() => null)
}

// 创建离线回退 Response
function offlineFallbackResponse() {
  return new Response(OFFLINE_FALLBACK_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // 逐个缓存以避免 addAll 在单个资源失败时整体回滚
        Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))),
      ),
  )
  // 立即激活新 SW，确保用户尽快拿到最新缓存策略
  // 配合 main.tsx 的 controllerchange → reload，用户会自动刷新一次
  self.skipWaiting()
})

// 监听来自页面的 SKIP_WAITING 消息（保留兼容，用于 toast 手动刷新）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            // 额外清理可能残留的旧版本 exploratory-learning-shell 缓存
            .filter((key) => key.startsWith('exploratory-learning-shell-'))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// stale-while-revalidate：立即返回缓存，同时后台更新（带版本检查）
function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    safeCacheMatch(cache, request).then((cached) => {
      // 版本检查：如果缓存来自旧版本，不返回旧缓存，直接走网络
      const isOutdated = cached && cached.headers.get('x-sw-cache-version') !== String(CACHE_VERSION)

      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            // 写入缓存时标记当前版本号
            const versionedResponse = new Response(response.body, response)
            versionedResponse.headers.set('x-sw-cache-version', String(CACHE_VERSION))
            cache.put(request, versionedResponse.clone())
          }
          return response
        })
        .catch(() => (isOutdated ? null : cached))

      // 如果缓存是旧版本，不使用它，直接等待网络结果
      if (isOutdated) {
        return fetchPromise.catch(() => offlineFallbackResponse())
      }

      return cached || fetchPromise
    }),
  )
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const requestUrl = new URL(event.request.url)

  // API 调用：pass-through（包括跨域请求），不做缓存
  if (isApiCall(requestUrl)) {
    // 跨域 API 不拦截，直接放行
    if (requestUrl.origin !== self.location.origin) return
    // 同源 API 路径：网络优先，离线返回 503
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', message: '网络不可用，无法调用 API' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    return
  }

  // 模板文件：优先网络，确保用户拿到最新版本
  if (isNetworkFirst(requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          const versionedCopy = new Response(copy.body, copy)
          versionedCopy.headers.set('x-sw-cache-version', String(CACHE_VERSION))
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, versionedCopy))
          return response
        })
        .catch(() =>
          caches.open(CACHE_NAME).then((cache) => safeCacheMatch(cache, event.request).then((r) => r || offlineFallbackResponse())),
        ),
    )
    return
  }

  // JS/CSS 等构建产物（/assets/）：stale-while-revalidate
  if (isStaleWhileRevalidate(requestUrl)) {
    event.respondWith(staleWhileRevalidate(event.request))
    return
  }

  // 导航请求：cache-first with background revalidation
  // 有缓存时立即返回（秒开），无缓存时走网络
  // 解决移动端首次打开需刷新的问题：
  //   之前 network-first 在慢网络下白屏，用户需手动刷新
  //   现在 cache-first 让返回访客秒开页面，后台更新缓存供下次使用
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        safeCacheMatch(cache, event.request).then((cached) => {
          // 后台更新缓存（不阻塞当前请求返回）
          const networkFetch = fetch(event.request)
            .then((response) => {
              if (response && response.ok) {
                const versionedResponse = new Response(response.body, response)
                versionedResponse.headers.set('x-sw-cache-version', String(CACHE_VERSION))
                cache.put(event.request, versionedResponse.clone())
                // 同时更新根路径缓存，作为导航回退
                cache.put(new Request('/'), versionedResponse.clone())
              }
              return response
            })
            .catch(() => null)

          if (cached) {
            // 有缓存：立即返回，后台静默更新
            return cached
          }
          // 无缓存：走网络，失败时回退到缓存的 '/' 或离线页
          return networkFetch.then((r) =>
            r || cache.match('/').then((rootCached) => rootCached || offlineFallbackResponse()),
          )
        }),
      ),
    )
    return
  }

  // 其他资源：cache-first，缓存未命中时显示离线提示
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      safeCacheMatch(cache, event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request)
          .then((response) => {
            const copy = response.clone()
            const versionedCopy = new Response(copy.body, copy)
            versionedCopy.headers.set('x-sw-cache-version', String(CACHE_VERSION))
            cache.put(event.request, versionedCopy)
            return response
          })
          .catch(() => offlineFallbackResponse())
      }),
    ),
  )
})
