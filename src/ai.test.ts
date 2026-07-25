import { describe, it, expect } from 'vitest'
import {
  safeParsePayload,
  detectFactRisk,
  validateGeneratedPayload,
  normalizeFactCheck,
  safeStringList,
  isQuestionType,
  isLearningRole,
  preferenceSummary,
} from './ai'
import type { GeneratedPayload, UserPreference } from './types'

describe('ai.ts', () => {
  describe('safeParsePayload', () => {
    it('should parse valid JSON', () => {
      const json = JSON.stringify({ question_type: 'concept', learning_role: 'foundation', answer: { summary: 'test' } })
      const result = safeParsePayload(json)
      expect(result.payload).not.toBeNull()
      expect(result.repaired).toBe(false)
    })

    it('should strip markdown code fences', () => {
      const json = '```json\n{"question_type":"concept"}\n```'
      const result = safeParsePayload(json)
      expect(result.payload).not.toBeNull()
      expect(result.repaired).toBe(true)
    })

    it('should repair trailing commas', () => {
      const json = '{"question_type":"concept","learning_role":"foundation",}'
      const result = safeParsePayload(json)
      expect(result.payload).not.toBeNull()
      expect(result.repaired).toBe(true)
    })

    it('should return null for invalid JSON', () => {
      const result = safeParsePayload('not json at all')
      expect(result.payload).toBeNull()
      expect(result.repaired).toBe(false)
    })

    it('should extract JSON from text with surrounding content', () => {
      const text = 'Here is the result:\n{"question_type":"concept","answer":{"summary":"hi"}}\nEnd'
      const result = safeParsePayload(text)
      expect(result.payload).not.toBeNull()
      expect(result.payload?.answer?.summary).toBe('hi')
    })
  })

  describe('detectFactRisk', () => {
    it('should detect price-related keywords', () => {
      expect(detectFactRisk('现在苹果手机价格是多少')).toBe(true)
    })

    it('should detect medical keywords', () => {
      expect(detectFactRisk('阿司匹林这种药怎么吃')).toBe(true)
    })

    it('should detect financial keywords', () => {
      expect(detectFactRisk('今天股票涨了没')).toBe(true)
    })

    it('should return false for concept questions', () => {
      expect(detectFactRisk('什么是闭包')).toBe(false)
    })

    it('should detect policy keywords', () => {
      expect(detectFactRisk('最新的移民政策')).toBe(true)
    })
  })

  describe('isQuestionType', () => {
    it('should accept valid types', () => {
      expect(isQuestionType('concept')).toBe(true)
      expect(isQuestionType('mechanism')).toBe(true)
      expect(isQuestionType('fact')).toBe(true)
    })

    it('should reject invalid types', () => {
      expect(isQuestionType('invalid')).toBe(false)
      expect(isQuestionType('')).toBe(false)
    })
  })

  describe('isLearningRole', () => {
    it('should accept valid roles', () => {
      expect(isLearningRole('foundation')).toBe(true)
      expect(isLearningRole('mechanism')).toBe(true)
      expect(isLearningRole('root')).toBe(true)
    })

    it('should reject invalid roles', () => {
      expect(isLearningRole('teacher')).toBe(false)
      expect(isLearningRole('')).toBe(false)
    })
  })

  describe('safeStringList', () => {
    it('should convert array values to strings', () => {
      expect(safeStringList(['a', 'b', 123])).toEqual(['a', 'b', '123'])
    })

    it('should filter empty strings', () => {
      expect(safeStringList(['a', '', 'b'])).toEqual(['a', 'b'])
    })

    it('should return empty array for non-array', () => {
      expect(safeStringList('not array')).toEqual([])
      expect(safeStringList(null)).toEqual([])
    })
  })

  describe('normalizeFactCheck', () => {
    it('should return empty blocks when no factual risk', () => {
      const result = normalizeFactCheck({}, '什么是闭包', false)
      expect(result.explainable).toEqual([])
      expect(result.to_verify).toEqual([])
    })

    it('should generate defaults when factual risk', () => {
      const result = normalizeFactCheck({}, '最新价格', true)
      expect(result.to_verify.length).toBeGreaterThan(0)
      expect(result.suggested_sources.length).toBeGreaterThan(0)
    })

    it('should preserve provided values', () => {
      const result = normalizeFactCheck({
        explainable: ['基本概念'],
        to_verify: ['具体数据'],
        suggested_sources: ['官方文档'],
        avoid_conclusions: ['不要轻信'],
      }, '测试', true)
      expect(result.explainable).toEqual(['基本概念'])
      expect(result.to_verify).toEqual(['具体数据'])
    })

    it('should cap arrays at reasonable limits', () => {
      const many = Array(20).fill('item')
      const result = normalizeFactCheck({
        to_verify: many,
        suggested_sources: many,
      }, '测试', true)
      expect(result.to_verify.length).toBeLessThanOrEqual(5)
      expect(result.suggested_sources.length).toBeLessThanOrEqual(5)
    })
  })

  describe('validateGeneratedPayload', () => {
    function makePayload(overrides: Partial<GeneratedPayload> = {}): GeneratedPayload {
      return {
        question_type: 'concept',
        learning_role: 'foundation',
        short_title: '测试标题',
        one_line_memory: '测试记忆',
        tags: ['tag1'],
        answer: {
          summary: '一句话结论',
          plain: '通俗解释',
          mechanism: '关键机制',
          misunderstandings: ['误解1'],
          example: '例子',
        },
        fact_check: { explainable: [], to_verify: [], suggested_sources: [], avoid_conclusions: [] },
        followups: Array(5).fill(null).map((_, i) => ({
          id: `fu-${i}`,
          question: `追问${i}`,
          type: 'foundation' as const,
          reason: '原因',
          difficulty: 2 as const,
          expected_gain: '收获',
        })),
        checks: [
          { id: 'c1', prompt: '检测题1', intent: 'recall' as const, hint: '提示' },
          { id: 'c2', prompt: '检测题2', intent: 'application' as const, hint: '提示' },
          { id: 'c3', prompt: '检测题3', intent: 'boundary' as const, hint: '提示' },
        ],
        keywords: ['关键词'],
        ...overrides,
      }
    }

    it('should pass validation for complete payload', () => {
      const result = validateGeneratedPayload(makePayload(), '什么是闭包')
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should report error when summary is missing', () => {
      const result = validateGeneratedPayload(
        makePayload({ answer: { ...makePayload().answer, summary: '' } }),
        '测试'
      )
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('模型回答缺少核心结论或通俗解释。')
    })

    it('should warn when mechanism is missing', () => {
      const result = validateGeneratedPayload(
        makePayload({ answer: { ...makePayload().answer, mechanism: '' } }),
        '测试'
      )
      expect(result.ok).toBe(true)
      expect(result.warnings.some(w => w.includes('关键机制'))).toBe(true)
    })

    it('should warn when followups are less than 3', () => {
      const result = validateGeneratedPayload(
        makePayload({ followups: [] }),
        '测试'
      )
      expect(result.warnings.some(w => w.includes('追问'))).toBe(true)
    })

    it('should warn when checks are less than 3', () => {
      const result = validateGeneratedPayload(
        makePayload({ checks: [] }),
        '测试'
      )
      expect(result.warnings.some(w => w.includes('理解检测'))).toBe(true)
    })

    it('should auto-correct invalid question_type', () => {
      const result = validateGeneratedPayload(
        makePayload({ question_type: 'invalid_type' as any }),
        '什么是闭包'
      )
      expect(result.normalized.question_type).toBe('concept')
      expect(result.warnings.some(w => w.includes('问题类型异常'))).toBe(true)
    })

    it('should force fact type for factual risk questions', () => {
      const result = validateGeneratedPayload(
        makePayload({ question_type: 'concept' }),
        '今天股票价格'
      )
      expect(result.normalized.question_type).toBe('fact')
      expect(result.warnings.some(w => w.includes('事实风险'))).toBe(true)
    })

    it('should auto-correct invalid learning_role', () => {
      const result = validateGeneratedPayload(
        makePayload({ learning_role: 'invalid_role' as any }),
        '测试'
      )
      expect(result.normalized.learning_role).toBe('foundation')
    })

    it('should detect unsupported authority claims', () => {
      const result = validateGeneratedPayload(
        makePayload({ answer: { ...makePayload().answer, summary: '权威数据显示这个结论成立' } }),
        '什么是闭包'
      )
      expect(result.warnings.some(w => w.includes('权威表述') || w.includes('来源'))).toBe(true)
    })
  })

  describe('preferenceSummary', () => {
    it('should summarize preferences correctly', () => {
      const pref: UserPreference = {
        preferred_followup_types: { foundation: 5, mechanism: 3 },
        disliked_followup_types: { example: 2 },
        difficulty_preference: 'easier',
        recent_positive_examples: ['量子力学'],
        recent_negative_examples: ['简单数学'],
        updated_at: Date.now(),
      }
      const summary = preferenceSummary(pref)
      expect(summary).toContain('foundation')
      expect(summary).toContain('easier')
      expect(summary).toContain('简单数学')
    })

    it('should return empty for balanced preference with no data', () => {
      const pref: UserPreference = {
        preferred_followup_types: {},
        disliked_followup_types: {},
        difficulty_preference: 'balanced',
        recent_positive_examples: [],
        recent_negative_examples: [],
        updated_at: Date.now(),
      }
      const summary = preferenceSummary(pref)
      expect(summary).toBe('')
    })
  })
})
