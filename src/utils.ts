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

export interface SharedConfig {
  k: string  // apiKey
  b?: string // apiBase (optional, has default)
  m?: string // model (optional, has default)
}

const CONFIG_HASH_PREFIX = '#cfg='

/**
 * 将 API 配置编码为 URL hash 字符串
 * 使用 TextEncoder + btoa 进行 base64 编码
 */
export function encodeConfigToHash(apiKey: string, apiBase: string, model: string): string {
  const config: SharedConfig = { k: apiKey }
  if (apiBase && apiBase !== 'https://api.deepseek.com/v1/chat/completions') config.b = apiBase
  if (model && model !== 'deepseek-v4-flash') config.m = model
  try {
    const json = JSON.stringify(config)
    const encoded = typeof TextEncoder !== 'undefined'
      ? btoa(String.fromCharCode(...new TextEncoder().encode(json)))
      : btoa(unescape(encodeURIComponent(json)))
    return `${CONFIG_HASH_PREFIX}${encoded}`
  } catch {
    return ''
  }
}

/**
 * 从 URL hash 解码 API 配置
 */
export function decodeConfigFromHash(): SharedConfig | null {
  try {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (!hash.startsWith(CONFIG_HASH_PREFIX)) return null
    const encoded = hash.slice(CONFIG_HASH_PREFIX.length)
    const json = typeof TextDecoder !== 'undefined'
      ? new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))
      : decodeURIComponent(escape(atob(encoded)))
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
