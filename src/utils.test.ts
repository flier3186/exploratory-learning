import { describe, it, expect } from 'vitest'
import { clampText, uid, sanitizeChecks } from './utils'
import type { UnderstandingCheck } from './types'

describe('utils', () => {
  describe('clampText', () => {
    it('should trim whitespace and collapse spaces', () => {
      expect(clampText('  hello   world  ', 100)).toBe('hello world')
    })

    it('should truncate to max length', () => {
      expect(clampText('abcdefghij', 5)).toBe('abcde')
    })

    it('should handle empty string', () => {
      expect(clampText('', 10)).toBe('')
    })

    it('should handle string shorter than limit', () => {
      expect(clampText('hi', 10)).toBe('hi')
    })

    it('should trim after truncating', () => {
      expect(clampText('hello world   ', 8)).toBe('hello wo')
    })
  })

  describe('uid', () => {
    it('should generate id with prefix', () => {
      const id = uid('node')
      expect(id).toMatch(/^node_/)
    })

    it('should generate unique ids', () => {
      const id1 = uid('x')
      const id2 = uid('x')
      expect(id1).not.toBe(id2)
    })
  })

  describe('sanitizeChecks', () => {
    it('should return defaults when no items provided', () => {
      const checks = sanitizeChecks(undefined, '什么是闭包？')
      expect(checks).toHaveLength(3)
      expect(checks[0].intent).toBe('recall')
      expect(checks[1].intent).toBe('application')
      expect(checks[2].intent).toBe('boundary')
    })

    it('should preserve valid items', () => {
      const items = [{ id: 'c1', prompt: '解释一下', intent: 'recall' as const, hint: '想想看' }]
      const checks = sanitizeChecks(items, '测试问题')
      expect(checks).toHaveLength(Math.min(items.length + 3, 3))
      expect(checks[0].prompt).toBe('解释一下')
    })

    it('should normalize invalid intent to recall', () => {
      const items = [{ id: 'c1', prompt: '测试', intent: 'recall' as UnderstandingCheck['intent'], hint: '提示' }]
      // Override intent to simulate invalid value
      ;(items[0] as any).intent = 'invalid'
      const checks = sanitizeChecks(items, '测试')
      const found = checks.find(c => c.id === 'c1')
      expect(found?.intent).toBe('recall')
    })

    it('should filter out items without prompt', () => {
      const items = [{ id: 'c1', prompt: '', intent: 'recall' as const, hint: '提示' }]
      const checks = sanitizeChecks(items, '测试')
      expect(checks.find(c => c.id === 'c1')).toBeUndefined()
    })

    it('should clamp prompt and hint lengths', () => {
      const longPrompt = 'a'.repeat(200)
      const longHint = 'b'.repeat(200)
      const items = [{ id: 'c1', prompt: longPrompt, intent: 'recall' as const, hint: longHint }]
      const checks = sanitizeChecks(items, '测试')
      const found = checks.find(c => c.id === 'c1')
      expect(found?.prompt.length).toBeLessThanOrEqual(90)
      expect(found?.hint.length).toBeLessThanOrEqual(80)
    })

    it('should cap total at 3 checks', () => {
      const items = [
        { id: 'c1', prompt: '第一个', intent: 'recall' as const, hint: 'h1' },
        { id: 'c2', prompt: '第二个', intent: 'application' as const, hint: 'h2' },
        { id: 'c3', prompt: '第三个', intent: 'boundary' as const, hint: 'h3' },
        { id: 'c4', prompt: '第四个', intent: 'recall' as const, hint: 'h4' },
      ]
      const checks = sanitizeChecks(items, '测试')
      expect(checks).toHaveLength(3)
    })
  })
})
