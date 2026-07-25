import { describe, it, expect, beforeEach, vi } from 'vitest'
import { normalizeState, normalizeImportedNode, normalizeTags, createSearchIndex } from './storage'
import type { AppState } from './types'
import { initialState } from './constants'

describe('storage.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window.localStorage.clear as any)()
  })

  describe('normalizeTags', () => {
    it('should deduplicate tags', () => {
      expect(normalizeTags(['a', 'b', 'a', 'c'], [])).toEqual(['a', 'b', 'c'])
    })

    it('should trim tag strings', () => {
      expect(normalizeTags(['  hello  ', ' world '], [])).toEqual(['hello', 'world'])
    })

    it('should filter empty tags', () => {
      expect(normalizeTags(['', 'a', '  ', 'b'], [])).toEqual(['a', 'b'])
    })

    it('should use fallback when not array', () => {
      expect(normalizeTags(null as any, ['fallback'])).toEqual(['fallback'])
    })

    it('should cap at 6 tags', () => {
      expect(normalizeTags(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [])).toHaveLength(6)
    })
  })

  describe('createSearchIndex', () => {
    it('should combine all text fields', () => {
      const node = {
        id: 'n1',
        topic_id: 't1',
        parent_id: null as string | null,
        question: '什么是闭包',
        short_title: '闭包概念',
        one_line_memory: '闭包是函数和作用域的组合',
        tags: ['编程', 'JavaScript'],
        learning_role: 'foundation' as const,
        question_type: 'concept' as const,
        answer: {
          summary: '结论',
          plain: '解释',
          mechanism: '机制',
          example: '例子',
          misunderstandings: ['误解'],
        },
        fact_check: { explainable: [], to_verify: [], suggested_sources: [], avoid_conclusions: [] },
        followups: [],
        checks: [],
        quality: { parse_failed: false, repaired: false, regenerated_count: 0, source_required: false, is_demo: false, generation_status: 'ok' as const, validation_errors: [], validation_warnings: [] },
        mastery: { is_visited: true, is_starred: false, confidence: 3 as const, review_later: false, check_status: 'untested' as const },
        links: { children_ids: [], related_node_ids: [], prerequisite_node_ids: [] },
        search_index: { text: '', updated_at: Date.now() },
        created_at: Date.now(),
        last_accessed_at: Date.now(),
      }
      const index = createSearchIndex(node)
      expect(index.text).toContain('什么是闭包')
      expect(index.text).toContain('编程')
      expect(index.text).toContain('结论')
    })

    it('should lowercase all text', () => {
      const node = {
        id: 'n1', topic_id: 't1', parent_id: null as string | null, question: 'Hello World',
        short_title: 'Test', one_line_memory: 'Memory',
        tags: ['TAG'], learning_role: 'root' as const, question_type: 'concept' as const,
        answer: { summary: '', plain: '', mechanism: '', misunderstandings: [], example: '' },
        fact_check: { explainable: [], to_verify: [], suggested_sources: [], avoid_conclusions: [] },
        followups: [], checks: [],
        quality: { parse_failed: false, repaired: false, regenerated_count: 0, source_required: false, is_demo: false, generation_status: 'ok' as const, validation_errors: [], validation_warnings: [] },
        mastery: { is_visited: false, is_starred: false, confidence: 3 as const, review_later: false, check_status: 'untested' as const },
        links: { children_ids: [], related_node_ids: [], prerequisite_node_ids: [] },
        search_index: { text: '', updated_at: Date.now() },
        created_at: Date.now(),
        last_accessed_at: Date.now(),
      }
      const index = createSearchIndex(node)
      expect(index.text).toContain('hello world')
      expect(index.text).toContain('tag')
    })
  })

  describe('normalizeImportedNode', () => {
    it('should return null for invalid input', () => {
      expect(normalizeImportedNode(null)).toBeNull()
      expect(normalizeImportedNode(undefined)).toBeNull()
      expect(normalizeImportedNode({})).toBeNull()
      expect(normalizeImportedNode('string')).toBeNull()
    })

    it('should normalize a valid node', () => {
      const node = normalizeImportedNode({
        id: 'n1',
        topic_id: 't1',
        question: '什么是闭包',
        question_type: 'concept',
        learning_role: 'foundation',
        short_title: '闭包',
        answer: { summary: '结论', plain: '解释' },
      })
      expect(node).not.toBeNull()
      expect(node!.question).toBe('什么是闭包')
      expect(node!.answer.summary).toBe('结论')
    })

    it('should default missing fields', () => {
      const node = normalizeImportedNode({
        id: 'n1',
        topic_id: 't1',
        question: '测试问题',
      })
      expect(node!.answer.summary).toBe('测试问题')
      expect(node!.short_title).toBe('测试问题')
      expect(node!.tags).toEqual([])
      expect(node!.followups).toEqual([])
    })

    it('should normalize invalid followup types', () => {
      const node = normalizeImportedNode({
        id: 'n1',
        topic_id: 't1',
        question: '测试',
        followups: [{ question: '追问', type: 'invalid_type' }],
      })
      expect(node!.followups[0].type).toBe('foundation')
    })

    it('should clamp followup text lengths', () => {
      const longQuestion = '这是一个非常长的追问问题'.repeat(20)
      const node = normalizeImportedNode({
        id: 'n1',
        topic_id: 't1',
        question: '测试',
        followups: [{ question: longQuestion, type: 'foundation' }],
      })
      expect(node!.followups[0].question.length).toBeLessThanOrEqual(90)
    })

    it('should generate search index', () => {
      const node = normalizeImportedNode({
        id: 'n1',
        topic_id: 't1',
        question: '闭包是什么',
        short_title: '闭包',
      })
      expect(node!.search_index.text).toContain('闭包是什么')
    })
  })

  describe('normalizeState', () => {
    it('should return initial state for null input', () => {
      const state = normalizeState(null)
      expect(state.topics).toEqual([])
      expect(state.nodes).toEqual({})
    })

    it('should return current for invalid input', () => {
      const state = normalizeState('invalid', initialState)
      expect(state).toBe(initialState)
    })

    it('should normalize topics', () => {
      const state = normalizeState({
        topics: [
          { id: 't1', title: '主题1', created_at: 1000, last_accessed_at: 1000 },
          { id: '', title: '无效' },
        ],
        nodes: {},
      })
      expect(state.topics).toHaveLength(1)
      expect(state.topics[0].title).toBe('主题1')
    })

    it('should normalize nodes', () => {
      const state = normalizeState({
        topics: [{ id: 't1', title: '主题', created_at: 1000, last_accessed_at: 1000 }],
        nodes: {
          n1: { id: 'n1', topic_id: 't1', question: '测试问题' },
        },
      })
      expect(Object.keys(state.nodes)).toEqual(['n1'])
      expect(state.nodes.n1.question).toBe('测试问题')
    })

    it('should clear selectedTopicId if topic not found', () => {
      const state = normalizeState({
        selectedTopicId: 'nonexistent',
        topics: [],
        nodes: {},
      })
      expect(state.selectedTopicId).toBeNull()
    })

    it('should preserve API keys from current state', () => {
      const current: AppState = {
        ...initialState,
        apiKey: 'my-key',
        apiBase: 'https://my-api.com',
        model: 'my-model',
      }
      const state = normalizeState({ topics: [], nodes: {} }, current)
      expect(state.apiKey).toBe('my-key')
      expect(state.apiBase).toBe('https://my-api.com')
      expect(state.model).toBe('my-model')
    })
  })
})
