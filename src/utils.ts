import type { UnderstandingCheck } from './types'

export function uid(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  return `${prefix}_${random}`
}

export function now() {
  return Date.now()
}

export function clampText(text: string, length: number) {
  return text.trim().replace(/\s+/g, ' ').slice(0, length)
}

// ===== URL Hash 配置分享 =====
// 将 API 配置编码到 URL hash 中，方便一键分享给其他人
// 使用 URL-safe base64 避免聊天软件对 +/= 等字符的编码问题

export interface SharedConfig {
  k: string  // apiKey
  b?: string // apiBase (optional, has default)
  m?: string // model (optional, has default)
}

const CONFIG_HASH_PREFIX = '#cfg='

/** UTF-8 字符串 → base64（不用 spread，避免长字符串栈溢出） */
function utf8ToBase64(str: string): string {
  const bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(str)
    : Uint8Array.from(unescape(encodeURIComponent(str)), (c) => c.charCodeAt(0))
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** base64 → UTF-8 字符串 */
function base64ToUtf8(b64: string): string {
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return typeof TextDecoder !== 'undefined'
    ? new TextDecoder().decode(bytes)
    : decodeURIComponent(escape(binary))
}

/** 标准 base64 → URL-safe base64（- 代替 +，_ 代替 /，去掉 = 填充） */
function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** URL-safe base64 → 标准 base64（还原字符并补齐 = 填充） */
function fromUrlSafe(safe: string): string {
  let b64 = safe.replace(/-/g, '+').replace(/_/g, '/')
  // 补齐 = 填充
  const pad = b64.length % 4
  if (pad) b64 += '='.repeat(4 - pad)
  return b64
}

/**
 * 将 API 配置编码为 URL hash 字符串
 * 使用 URL-safe base64 编码，避免聊天软件对 +/= 等字符的编码问题
 */
export function encodeConfigToHash(apiKey: string, apiBase: string, model: string): string {
  const config: SharedConfig = { k: apiKey }
  if (apiBase && apiBase !== 'https://api.deepseek.com/v1/chat/completions') config.b = apiBase
  if (model && model !== 'deepseek-v4-flash') config.m = model
  try {
    const json = JSON.stringify(config)
    const encoded = toUrlSafe(utf8ToBase64(json))
    return `${CONFIG_HASH_PREFIX}${encoded}`
  } catch {
    return ''
  }
}

/**
 * 从 URL hash 解码 API 配置
 * 兼容 URL-safe base64 和标准 base64
 */
export function decodeConfigFromHash(): SharedConfig | null {
  try {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (!hash.startsWith(CONFIG_HASH_PREFIX)) return null
    const raw = hash.slice(CONFIG_HASH_PREFIX.length)
    // 先尝试 URL 解码（某些平台可能对 hash 中的字符做了 URL 编码）
    let encoded = raw
    try { encoded = decodeURIComponent(raw) } catch { /* 不是 URL 编码，保持原样 */ }
    // URL-safe base64 → 标准 base64
    const b64 = fromUrlSafe(encoded)
    const json = base64ToUtf8(b64)
    const config = JSON.parse(json) as SharedConfig
    if (!config.k || typeof config.k !== 'string') return null
    return config
  } catch {
    return null
  }
}

/**
 * 清除 URL 中的配置 hash
 */
export function clearConfigHash() {
  try {
    if (typeof window !== 'undefined' && window.location.hash.startsWith(CONFIG_HASH_PREFIX)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  } catch {
    // Silent fail
  }
}

/**
 * 生成完整的分享链接
 */
export function generateShareLink(apiKey: string, apiBase: string, model: string): string {
  const hash = encodeConfigToHash(apiKey, apiBase, model)
  if (!hash) return ''
  try {
    return `${window.location.origin}${window.location.pathname}${hash}`
  } catch {
    return ''
  }
}

export function sanitizeChecks(items: Array<Partial<UnderstandingCheck>> | undefined, question: string): UnderstandingCheck[] {
  const short = clampText(question.replace(/[？?。！!]/g, ''), 14) || '这个问题'
  const defaults: UnderstandingCheck[] = [
    {
      id: uid('check'),
      prompt: `不用看答案，你能用自己的话解释“${short}”吗？`,
      intent: 'recall',
      hint: '先说核心直觉，再补一个例子。',
    },
    {
      id: uid('check'),
      prompt: `如果把“${short}”用到一个真实场景里，第一步应该看什么？`,
      intent: 'application',
      hint: '试着从条件、对象、结果三个角度回答。',
    },
    {
      id: uid('check'),
      prompt: `“${short}”最容易被误用在什么地方？`,
      intent: 'boundary',
      hint: '可以从适用边界或常见误解入手。',
    },
  ]

  const list = Array.isArray(items) ? items : []
  const normalized = list
    .map((item) => {
      const intent = ['recall', 'application', 'boundary'].includes(String(item.intent)) ? item.intent : 'recall'
      return {
        id: item.id || uid('check'),
        prompt: clampText(String(item.prompt || ''), 90),
        intent: intent as UnderstandingCheck['intent'],
        hint: clampText(String(item.hint || '先尝试自己回答，再回看上面的解释。'), 80),
      }
    })
    .filter((item) => item.prompt)

  return [...normalized, ...defaults].slice(0, 3)
}
