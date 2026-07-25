import { describe, it, expect, vi } from 'vitest'
import {
  roleFromFollowupType,
  sanitizeFollowups,
  fallbackPayload,
  payloadToNode,
  buildContext,
} from './app-helpers'
import type { LearningNode, GeneratedPayload, FollowupType, LearningRole } from './types'

// 固定时间，确保生成的节点时间戳可预测
const FIXED_NOW = 1_750_000_000_000
vi.mock('./utils', async () => {
  const actual = await vi.importActual<typeof import('./utils')>('./utils')
  return { ...actual, now: () => FIXED_NOW }
})

describe('app-helpers.ts', () => {
  // ================================================================
  describe('roleFromFollowupType', () => {
    it.each<{ type: FollowupType; expected: LearningRole }>([
      { type: 'foundation', expected: 'foundation' },
      { type: 'example', expected: 'foundation' },
      { type: 'mechanism', expected: 'mechanism' },
      { type: 'application', expected: 'application' },
      { type: 'comparison', expected: 'comparison' },
      { type: 'connection', expected: 'comparison' },
      { type: 'boundary', expected: 'boundary' },
      { type: 'challenge', expected: 'boundary' },
      { type: 'practice', expected: 'practice' },
    ])('type=$type 应映射到 $expected', ({ type, expected }) => {
      expect(roleFromFollowupType(type)).toBe(expected)
    })

    it('undefined 应默认为 mechanism', () => {
      expect(roleFromFollowupType(undefined)).toBe('mechanism')
    })
  })

  // ================================================================
  describe('sanitizeFollowups', () => {
    it('空数组应至少返回 3 个默认追问', () => {
      const result = sanitizeFollowups([], '什么是闭包？')
      expect(result).toHaveLength(3)
    })

    it('默认追问应包含 boundary、example、application 类型', () => {
      const result = sanitizeFollowups([], '测试')
      const types = result.map(f => f.type)
      expect(types).toContain('boundary')
      expect(types).toContain('example')
      expect(types).toContain('application')
    })

    it('有效追问应保留并追加在默认之前', () => {
      const items = [
        { id: 'fu-custom', question: '自定义追问', type: 'foundation' as FollowupType, reason: '原因', difficulty: 1 as const, expected_gain: '收获' },
      ]
      const result = sanitizeFollowups(items, '测试')
      expect(result[0].id).toBe('fu-custom')
      expect(result[0].question).toBe('自定义追问')
    })

    it('应为追问自动生成 id', () => {
      const items = [{ question: '无 ID 追问', type: 'mechanism' as FollowupType, reason: '', difficulty: 2 as const, expected_gain: '' }]
      const result = sanitizeFollowups(items, '测试')
      expect(result[0].id).toMatch(/^fu_/)
    })

    it('应过滤掉空 question 的追问', () => {
      const items = [
        { question: '', type: 'foundation' as FollowupType, reason: '原因', difficulty: 1 as const, expected_gain: '收获' },
      ]
      const result = sanitizeFollowups(items, '测试')
      // 只应有 3 个默认
      expect(result).toHaveLength(3)
      expect(result.find(f => f.question === '')).toBeUndefined()
    })

    it('应 clamp 文本长度', () => {
      const longQuestion = '这是一个非常长的追问问题'.repeat(20)
      const items = [{ question: longQuestion, type: 'foundation' as FollowupType, reason: '原因', difficulty: 2 as const, expected_gain: '收获' }]
      const result = sanitizeFollowups(items, '测试')
      expect(result[0].question.length).toBeLessThanOrEqual(90)
    })

    it('difficulty 应被限制在 1-5 范围', () => {
      const items = [
        { question: 'Q1', type: 'foundation' as FollowupType, reason: '', difficulty: 0 as any, expected_gain: '' },
        { question: 'Q2', type: 'foundation' as FollowupType, reason: '', difficulty: 10 as any, expected_gain: '' },
      ]
      const result = sanitizeFollowups(items, '测试')
      // difficulty=0 是 falsy，所以 fallback 到 2（item.difficulty || 2）
      expect(result.find(f => f.question === 'Q1')!.difficulty).toBe(2)
      expect(result.find(f => f.question === 'Q2')!.difficulty).toBe(5)
    })

    it('追问总数不应超过 8', () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        question: `追问 ${i}`,
        type: 'foundation' as FollowupType,
        reason: '',
        difficulty: 2 as const,
        expected_gain: '',
      }))
      const result = sanitizeFollowups(items, '测试')
      expect(result.length).toBeLessThanOrEqual(8)
    })

    it('null 应等同于空数组', () => {
      const result = sanitizeFollowups(null as any, '测试')
      expect(result).toHaveLength(3)
    })

    it('无效 type 应回退为 foundation', () => {
      const items = [
        { question: '测试', type: 'invalid_type' as any, reason: '', difficulty: 2 as const, expected_gain: '' },
      ]
      const result = sanitizeFollowups(items, '测试')
      expect(result.find(f => f.question === '测试')!.type).toBe('foundation')
    })
  })

  // ================================================================
  describe('fallbackPayload', () => {
    it('应返回有效的 GeneratedPayload', () => {
      const payload = fallbackPayload('什么是闭包？')
      expect(payload.question_type).toBe('concept')
      expect(payload.short_title).toBeDefined()
      expect(payload.answer).toBeDefined()
      expect(payload.followups!.length).toBeGreaterThan(0)
      expect(payload.checks!.length).toBeGreaterThan(0)
    })

    it('short_title 应去掉标点并截断', () => {
      const payload = fallbackPayload('什么是马尔可夫链？？它有什么用！')
      expect(payload.short_title).not.toContain('？')
      expect(payload.short_title).not.toContain('！')
      expect(payload.short_title!.length).toBeLessThanOrEqual(12)
    })

    it('tags 应从问题中提取中英文关键词', () => {
      const payload = fallbackPayload('什么是React中的useState？')
      expect(payload.tags!.length).toBeGreaterThan(0)
      expect(payload.tags!.length).toBeLessThanOrEqual(5)
    })

    it('空问题应使用默认标题', () => {
      const payload = fallbackPayload('')
      expect(payload.short_title).toBe('新的问题')
    })

    it('应包含 5 个追问', () => {
      const payload = fallbackPayload('什么是闭包？')
      expect(payload.followups).toHaveLength(5)
    })

    it('应包含 3 个理解检测', () => {
      const payload = fallbackPayload('什么是闭包？')
      expect(payload.checks).toHaveLength(3)
    })

    it('roleHint 应设置 learning_role', () => {
      const payload = fallbackPayload('测试', 'boundary')
      expect(payload.learning_role).toBe('boundary')
    })

    it('默认 learning_role 应为 root', () => {
      const payload = fallbackPayload('测试')
      expect(payload.learning_role).toBe('root')
    })

    it('source_note 应标记为演示模式', () => {
      const payload = fallbackPayload('测试')
      expect(payload.source_note).toContain('演示')
    })
  })

  // ================================================================
  describe('payloadToNode', () => {
    function makeFullPayload(): GeneratedPayload {
      return {
        question_type: 'concept',
        learning_role: 'foundation',
        short_title: '闭包',
        one_line_memory: '函数捕获外部变量',
        tags: ['JavaScript', '编程'],
        source_note: '文档参考',
        answer: {
          summary: '闭包的核心结论',
          plain: '通俗解释闭包',
          mechanism: '词法作用域机制',
          misunderstandings: ['误解1', '误解2'],
          example: '事件处理器例子',
        },
        fact_check: { explainable: ['概念'], to_verify: [], suggested_sources: [], avoid_conclusions: [] },
        followups: [
          { id: 'fu-1', question: '追问1', type: 'foundation' as const, reason: '原因', difficulty: 1 as const, expected_gain: '收获' },
        ],
        checks: [
          { id: 'c-1', prompt: '检测1', intent: 'recall' as const, hint: '提示' },
        ],
      }
    }

    it('应生成有效的 LearningNode', () => {
      const node = payloadToNode(makeFullPayload(), '什么是闭包？', 't1', null)
      expect(node.id).toMatch(/^node_/)
      expect(node.topic_id).toBe('t1')
      expect(node.parent_id).toBeNull()
      expect(node.question).toBe('什么是闭包？')
      expect(node.short_title).toBe('闭包')
      expect(node.search_index.text).toBeTruthy()
    })

    it('有 parentId 时 learning_role 默认为 mechanism', () => {
      const payload = makeFullPayload()
      payload.learning_role = undefined
      const node = payloadToNode(payload, '追问', 't1', 'parent-id')
      expect(node.learning_role).toBe('mechanism')
    })

    it('无 parentId 且无 roleHint 时 learning_role 默认为 root', () => {
      const payload = makeFullPayload()
      payload.learning_role = undefined
      const node = payloadToNode(payload, '根问题', 't1', null)
      expect(node.learning_role).toBe('root')
    })

    it('payload 优先级高于 roleHint', () => {
      const payload = makeFullPayload()
      payload.learning_role = 'boundary'
      const node = payloadToNode(payload, '测试', 't1', null, 'foundation')
      expect(node.learning_role).toBe('boundary')
    })

    it('parseFailed 应设置 generation_status=failed', () => {
      const node = payloadToNode(makeFullPayload(), '测试', 't1', null, undefined, true)
      expect(node.quality.parse_failed).toBe(true)
      expect(node.quality.generation_status).toBe('failed')
    })

    it('repaired 应设置 generation_status=repaired', () => {
      const node = payloadToNode(makeFullPayload(), '测试', 't1', null, undefined, false, true)
      expect(node.quality.repaired).toBe(true)
      expect(node.quality.generation_status).toBe('repaired')
    })

    it('正常情况 generation_status 应为 ok', () => {
      const node = payloadToNode(makeFullPayload(), '测试', 't1', null, undefined, false, false)
      expect(node.quality.generation_status).toBe('ok')
    })

    it('misunderstandings 应被限制为 4 个', () => {
      const payload = makeFullPayload()
      payload.answer!.misunderstandings = ['a', 'b', 'c', 'd', 'e']
      const node = payloadToNode(payload, '测试', 't1', null)
      expect(node.answer.misunderstandings.length).toBeLessThanOrEqual(4)
    })

    it('应使用 fallback 填补缺失字段', () => {
      const minimalPayload: GeneratedPayload = {}
      const node = payloadToNode(minimalPayload, '空问题', 't1', null)
      expect(node.answer.summary).toBeTruthy()
      expect(node.followups.length).toBeGreaterThan(0)
      expect(node.checks.length).toBeGreaterThan(0)
    })

    it('mastery 初始值应正确', () => {
      const node = payloadToNode(makeFullPayload(), '测试', 't1', null)
      expect(node.mastery.is_visited).toBe(false)
      expect(node.mastery.is_starred).toBe(false)
      expect(node.mastery.confidence).toBeUndefined()
      expect(node.mastery.review_later).toBe(false)
      expect(node.mastery.check_status).toBe('untested')
    })

    it('followups 和 checks 应被 normalize', () => {
      const node = payloadToNode(makeFullPayload(), '测试', 't1', null)
      expect(node.followups.length).toBeLessThanOrEqual(8)
      expect(node.checks.length).toBeLessThanOrEqual(3)
    })
  })

  // ================================================================
  describe('buildContext', () => {
    function makeNodeTree(): Record<string, LearningNode> {
      const gp = {
        id: 'gp', topic_id: 't1', parent_id: null as string | null,
        question: '祖问题', short_title: '祖标题', one_line_memory: '祖记忆',
        tags: ['tag-a'], question_type: 'concept' as const, learning_role: 'root' as const,
        answer: { summary: '祖结论', plain: '', mechanism: '', misunderstandings: ['祖误解'], example: '' },
        fact_check: { explainable: [], to_verify: [], suggested_sources: [], avoid_conclusions: [] },
        followups: [], checks: [],
        quality: { parse_failed: false, repaired: false, regenerated_count: 0, source_required: false, is_demo: false, generation_status: 'ok' as const, validation_errors: [], validation_warnings: [] },
        mastery: { is_visited: true, is_starred: false, confidence: 3, review_later: false, check_status: 'untested' as const },
        links: { children_ids: [], related_node_ids: [], prerequisite_node_ids: [] },
        search_index: { text: '', updated_at: FIXED_NOW },
        created_at: FIXED_NOW, last_accessed_at: FIXED_NOW,
      }
      const p = { ...gp, id: 'p', parent_id: 'gp', question: '父问题', short_title: '父标题', one_line_memory: '父记忆', tags: ['tag-b'], answer: { summary: '父结论', plain: '', mechanism: '', misunderstandings: [], example: '' } } as LearningNode
      return { gp: gp as LearningNode, p }
    }

    it('无 parentId 且无 topic 应返回空字符串', () => {
      expect(buildContext({}, null, null)).toBe('')
    })

    it('无 parentId 有 topic 应返回主题行', () => {
      const ctx = buildContext({}, { title: 'JavaScript 基础' }, null)
      expect(ctx).toContain('JavaScript 基础')
    })

    it('有 parentId 应包含路径信息', () => {
      const nodes = makeNodeTree()
      const ctx = buildContext(nodes, { title: '主题' }, 'p')
      expect(ctx).toContain('当前路径')
      expect(ctx).toContain('祖标题')
      expect(ctx).toContain('父标题')
    })

    it('应包含父节点问题', () => {
      const nodes = makeNodeTree()
      const ctx = buildContext(nodes, null, 'p')
      expect(ctx).toContain('父节点问题：父问题')
    })

    it('应包含父节点一句话结论', () => {
      const nodes = makeNodeTree()
      const ctx = buildContext(nodes, null, 'p')
      expect(ctx).toContain('父节点一句话结论：父结论')
    })

    it('应包含父节点记忆点', () => {
      const nodes = makeNodeTree()
      const ctx = buildContext(nodes, null, 'p')
      expect(ctx).toContain('父节点记忆点：父记忆')
    })

    it('父节点有误解时应包含易错点', () => {
      const nodes = makeNodeTree()
      const ctx = buildContext(nodes, null, 'gp')
      expect(ctx).toContain('父节点易错点')
      expect(ctx).toContain('祖误解')
    })

    it('父节点有标签时应包含标签', () => {
      const nodes = makeNodeTree()
      const ctx = buildContext(nodes, null, 'p')
      expect(ctx).toContain('父节点标签')
      expect(ctx).toContain('tag-b')
    })

    it('各段之间用换行分隔', () => {
      const nodes = makeNodeTree()
      const ctx = buildContext(nodes, { title: '主题' }, 'p')
      const lines = ctx.split('\n').filter(Boolean)
      expect(lines.length).toBeGreaterThan(1)
    })
  })
})
