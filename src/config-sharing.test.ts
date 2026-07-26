import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encodeConfigToHash, decodeConfigFromHash } from './utils'

describe('config sharing (utils.ts)', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.restoreAllMocks()
    // Reset location hash
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, hash: '', origin: 'https://test.com', pathname: '/app' },
      writable: true,
    })
  })

  describe('encodeConfigToHash / decodeConfigFromHash', () => {
    it('should roundtrip apiKey', () => {
      const hash = encodeConfigToHash('sk-12345', '', '')
      expect(hash).toMatch(/^#cfg=/)
      // Set hash manually for decode
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash },
        writable: true,
      })
      const decoded = decodeConfigFromHash()
      expect(decoded).not.toBeNull()
      expect(decoded!.k).toBe('sk-12345')
    })

    it('should roundtrip full config', () => {
      // Test encode
      const hash = encodeConfigToHash('sk-test', 'https://my-api.com/v1/chat/completions', 'my-model')
      expect(hash).toContain('#cfg=')

      // Mock location.hash for decode test
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash },
        writable: true,
      })

      const decoded = decodeConfigFromHash()
      // The hash was set before we overwrote location, so we need to re-do
      void decoded
      const hash2 = encodeConfigToHash('sk-test', 'https://my-api.com/v1/chat/completions', 'my-model')

      // Manually test decode with known hash
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash: hash2 },
        writable: true,
      })

      const result = decodeConfigFromHash()
      expect(result).not.toBeNull()
      expect(result!.k).toBe('sk-test')
      expect(result!.b).toBe('https://my-api.com/v1/chat/completions')
      expect(result!.m).toBe('my-model')
    })

    it('should omit default apiBase and model', () => {
      const hash = encodeConfigToHash('sk-test', 'https://api.deepseek.com/v1/chat/completions', 'deepseek-v4-flash')

      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash },
        writable: true,
      })

      const result = decodeConfigFromHash()
      expect(result).not.toBeNull()
      expect(result!.b).toBeUndefined()
      expect(result!.m).toBeUndefined()
    })

    it('should return null for invalid hash', () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash: '#wrong' },
        writable: true,
      })
      expect(decodeConfigFromHash()).toBeNull()
    })

    it('should return null for empty hash', () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash: '' },
        writable: true,
      })
      expect(decodeConfigFromHash()).toBeNull()
    })

    it('should not contain +, /, = in encoded hash (URL-safe base64)', () => {
      // 使用可能产生 +/= 字符的 apiKey
      const hash = encodeConfigToHash('sk-abcd+efg/hij=', 'https://api.deepseek.com/v1/chat/completions', 'deepseek-v4-flash')
      const encoded = hash.slice('#cfg='.length)
      expect(encoded).not.toContain('+')
      expect(encoded).not.toContain('/')
      expect(encoded).not.toContain('=')
    })

    it('should decode URL-encoded hash (chat app compatibility)', () => {
      // 先正常编码
      const hash = encodeConfigToHash('sk-test123', '', '')
      const encoded = hash.slice('#cfg='.length)
      // 模拟聊天软件对特殊字符的 URL 编码（即使 URL-safe base64 不含特殊字符，
      // 某些平台仍可能对 - 或 _ 做编码）
      const urlEncoded = encoded.replace(/-/g, '%2D').replace(/_/g, '%5F')
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash: `#cfg=${urlEncoded}` },
        writable: true,
      })
      const result = decodeConfigFromHash()
      expect(result).not.toBeNull()
      expect(result!.k).toBe('sk-test123')
    })

    it('should handle long apiKey without stack overflow', () => {
      const longKey = 'sk-' + 'a'.repeat(200)
      const hash = encodeConfigToHash(longKey, '', '')
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash },
        writable: true,
      })
      const result = decodeConfigFromHash()
      expect(result).not.toBeNull()
      expect(result!.k).toBe(longKey)
    })
  })
})
