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
  })
})
