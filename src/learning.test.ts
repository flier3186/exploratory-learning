import { describe, it, expect, vi } from 'vitest'
import {
  getNodePath,
  scoreNode,
  getConfidence,
  getReviewReasons,
  isDueReviewNode,
  isReviewCandidate,
  scoreReviewNode,
  passReviewFilter,
} from './learning'
import type { LearningNode } from './types'

// 固定时间，确保搜索和复习评分的时间衰减可预测
const FIXED_NOW = 1_750_000_000_000
vi.mock('./utils', async () => {
  const actual = await vi.importActual<typeof import('./utils')>('./utils')
  return { ...actual, now: () => FIXED_NOW }
})

/** 构造最小有效 LearningNode */
function makeNode(overrides: Partial<LearningNode> = {}): LearningNode {
  return {
    id: 'n1',
    topic_id: 't1',
    parent_id: null,
    question: '什么是闭包？',
    short_title: '闭包概念',
    one_line_memory: '闭包是函数和其词法环境的组合',
    tags: ['JavaScript', '编程'],
    question_type: 'concept',
    learning_role: 'foundation',
    answer: {
      summary: '闭包是函数可以记住并访问其词法作用域。',
      plain: '通俗解释',
      mechanism: '词法作用域机制',
      misunderstandings: ['闭包导致内存泄漏'],
      example: '事件处理器中的闭包',
    },
    fact_check: { explainable: [], to_verify: [], suggested_sources: [], avoid_conclusions: [] },
    followups: [],
    checks: [],
    quality: {
      parse_failed: false, repaired: false, regenerated_count: 0,
      source_required: false, is_demo: false, generation_status: 'ok',
      validation_errors: [], validation_warnings: [],
    },
    mastery: {
      is_visited: true, is_starred: false, confidence: 3,
      review_later: false, check_status: 'untested',
    },
    links: { children_ids: [], related_node_ids: [], prerequisite_node_ids: [] },
    search_index: { text: '闭包 javascript 作用域 编程', updated_at: FIXED_NOW },
    created_at: FIXED_NOW,
    last_accessed_at: FIXED_NOW,
    ...overrides,
  }
}

describe('learning.ts', () => {
  // ================================================================
  describe('getNodePath', () => {
    it('应为 null nodeId 返回空数组', () => {
      expect(getNodePath({}, null)).toEqual([])
    })

    it('应为根节点（parent_id = null）返回只包含自身的路径', () => {
      const node = makeNode({ id: 'root', parent_id: null })
      expect(getNodePath({ root: node }, 'root')).toEqual([node])
    })

    it('应正确回溯三级链', () => {
      const grandparent = makeNode({ id: 'gp', parent_id: null, short_title: '祖' })
      const parent = makeNode({ id: 'p', parent_id: 'gp', short_title: '父' })
      const child = makeNode({ id: 'c', parent_id: 'p', short_title: '子' })
      const nodes = { gp: grandparent, p: parent, c: child }
      const path = getNodePath(nodes, 'c')
      expect(path.map(n => n.short_title)).toEqual(['祖', '父', '子'])
    })

    it('应在遇到缺失节点时截断路径', () => {
      const root = makeNode({ id: 'root', parent_id: null })
      const child = makeNode({ id: 'child', parent_id: 'missing' })
      const nodes = { root, child }
      const path = getNodePath(nodes, 'child')
      // parent_id='missing' 不在 nodes 中，循环到此终止，路径只有 child 本身
      expect(path.map(n => n.id)).toEqual(['child'])
    })

    it('应防护循环引用，不会无限循环', () => {
      const a = makeNode({ id: 'a', parent_id: 'b' })
      const b = makeNode({ id: 'b', parent_id: 'a' })
      const nodes = { a, b }
      const path = getNodePath(nodes, 'a')
      // 路径应恰好包含两个节点（无重复）
      expect(path.length).toBe(2)
    })

    it('应为不存在的 nodeId 返回空数组', () => {
      expect(getNodePath({}, 'nope')).toEqual([])
    })
  })

  // ================================================================
  describe('scoreNode', () => {
    it('空查询应返回 0', () => {
      const node = makeNode()
      expect(scoreNode(node, '', null)).toBe(0)
      expect(scoreNode(node, '   ', null)).toBe(0)
    })

    it('匹配 short_title 应获得最高分', () => {
      const node = makeNode({ short_title: '闭包概念' })
      const scoreMatch = scoreNode(node, '闭包', null)
      const scoreNoMatch = scoreNode(node, '量子力学', null)
      expect(scoreMatch).toBeGreaterThan(scoreNoMatch)
    })

    it('匹配 tags 应加分', () => {
      const node = makeNode({ tags: ['JavaScript'] })
      const scoreMatch = scoreNode(node, 'javascript', null)
      const scoreNoMatch = scoreNode(node, 'Python', null)
      expect(scoreMatch).toBeGreaterThan(scoreNoMatch)
    })

    it('匹配 question 应加分', () => {
      const node = makeNode({ question: '什么是闭包？' })
      const scoreMatch = scoreNode(node, '什么是闭包', null)
      const scoreNoMatch = scoreNode(node, '量子纠缠', null)
      expect(scoreMatch).toBeGreaterThan(scoreNoMatch)
    })

    it('匹配 answer.summary 应加分', () => {
      const node = makeNode({ answer: { ...makeNode().answer, summary: '闭包是函数记住作用域' } })
      const scoreMatch = scoreNode(node, '记住作用域', null)
      const scoreNoMatch = scoreNode(node, '黑洞引力', null)
      expect(scoreMatch).toBeGreaterThan(scoreNoMatch)
    })

    it('匹配 search_index.text 应加分', () => {
      const node = makeNode({ search_index: { text: '闭包 javascript 词法作用域', updated_at: FIXED_NOW } })
      const scoreMatch = scoreNode(node, '词法', null)
      const scoreNoMatch = scoreNode(node, '拓扑学', null)
      expect(scoreMatch).toBeGreaterThan(scoreNoMatch)
    })

    it('topic_id 匹配 selectedTopicId 应加分', () => {
      const node = makeNode({ topic_id: 't1' })
      const scoreMatch = scoreNode(node, '任何词', 't1')
      const scoreNoMatch = scoreNode(node, '任何词', 't2')
      expect(scoreMatch).toBeGreaterThan(scoreNoMatch)
    })

    it('星标节点应加分', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, is_starred: true } })
      const scoreStarred = scoreNode(node, '任何词', null)
      const nodeNoStar = makeNode({ mastery: { ...makeNode().mastery, is_starred: false } })
      const scoreNotStarred = scoreNode(nodeNoStar, '任何词', null)
      expect(scoreStarred).toBeGreaterThan(scoreNotStarred)
    })

    it('匹配应大小写不敏感', () => {
      const node = makeNode({ short_title: 'JavaScript' })
      const scoreLower = scoreNode(node, 'javascript', null)
      expect(scoreLower).toBeGreaterThan(0)
    })
  })

  // ================================================================
  describe('getConfidence', () => {
    it('有效值 1-5 应返回对应数字', () => {
      expect(getConfidence(makeNode({ mastery: { ...makeNode().mastery, confidence: 1 } }))).toBe(1)
      expect(getConfidence(makeNode({ mastery: { ...makeNode().mastery, confidence: 3 } }))).toBe(3)
      expect(getConfidence(makeNode({ mastery: { ...makeNode().mastery, confidence: 5 } }))).toBe(5)
    })

    it('undefined 应返回 undefined', () => {
      expect(getConfidence(makeNode({ mastery: { ...makeNode().mastery, confidence: undefined } }))).toBeUndefined()
    })

    it('超出范围应返回 undefined', () => {
      const node0 = makeNode({ mastery: { ...makeNode().mastery, confidence: 0 } } as any)
      const node6 = makeNode({ mastery: { ...makeNode().mastery, confidence: 6 } } as any)
      const nodeNaN = makeNode({ mastery: { ...makeNode().mastery, confidence: NaN } } as any)
      expect(getConfidence(node0)).toBeUndefined()
      expect(getConfidence(node6)).toBeUndefined()
      expect(getConfidence(nodeNaN)).toBeUndefined()
    })
  })

  // ================================================================
  describe('getReviewReasons', () => {
    it('review_later 应产生"稍后复习"', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, review_later: true } })
      expect(getReviewReasons(node)).toContain('稍后复习')
    })

    it('check_status=needs_review 应产生"需要复习"', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, check_status: 'needs_review' } })
      expect(getReviewReasons(node)).toContain('需要复习')
    })

    it('check_status=uncertain 应产生"还有点虚"', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, check_status: 'uncertain' } })
      expect(getReviewReasons(node)).toContain('还有点虚')
    })

    it('check_status=untested 应产生"未检测"', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, check_status: 'untested' } })
      expect(getReviewReasons(node)).toContain('未检测')
    })

    it('低掌握度 (confidence<=3) 应产生"低掌握度"', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, confidence: 2 } })
      expect(getReviewReasons(node)).toContain('低掌握度')
    })

    it('confidence=4 不应产生"低掌握度"', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, confidence: 4, check_status: 'understood' } })
      expect(getReviewReasons(node)).not.toContain('低掌握度')
    })

    it('星标应产生"星标回看"', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, is_starred: true, check_status: 'understood', confidence: 5 } })
      expect(getReviewReasons(node)).toContain('星标回看')
    })

    it('应去重', () => {
      // review_later + confidence 2 同时触发两种原因
      const node = makeNode({ mastery: { ...makeNode().mastery, review_later: true, confidence: 2 } })
      const reasons = getReviewReasons(node)
      const unique = Array.from(new Set(reasons))
      expect(reasons).toEqual(unique)
    })

    it('无任何原因时应返回空数组', () => {
      const node = makeNode({ mastery: { ...makeNode().mastery, check_status: 'understood', confidence: 5, is_starred: false, review_later: false } })
      expect(getReviewReasons(node)).toEqual([])
    })
  })

  // ================================================================
  describe('isDueReviewNode', () => {
    it('review_later=true 应返回 true', () => {
      expect(isDueReviewNode(makeNode({ mastery: { ...makeNode().mastery, review_later: true } }))).toBe(true)
    })

    it('check_status=needs_review 应返回 true', () => {
      expect(isDueReviewNode(makeNode({ mastery: { ...makeNode().mastery, check_status: 'needs_review' } }))).toBe(true)
    })

    it('check_status=uncertain 应返回 true', () => {
      expect(isDueReviewNode(makeNode({ mastery: { ...makeNode().mastery, check_status: 'uncertain' } }))).toBe(true)
    })

    it('check_status=untested 应返回 true', () => {
      expect(isDueReviewNode(makeNode({ mastery: { ...makeNode().mastery, check_status: 'untested' } }))).toBe(true)
    })

    it('confidence=undefined 应返回 true', () => {
      expect(isDueReviewNode(makeNode({ mastery: { ...makeNode().mastery, confidence: undefined } }))).toBe(true)
    })

    it('confidence<=3 应返回 true', () => {
      expect(isDueReviewNode(makeNode({ mastery: { ...makeNode().mastery, confidence: 3, check_status: 'understood' } }))).toBe(true)
    })

    it('高掌握度且已理解应返回 false', () => {
      expect(isDueReviewNode(makeNode({ mastery: { ...makeNode().mastery, confidence: 5, check_status: 'understood' } }))).toBe(false)
    })
  })

  // ================================================================
  describe('isReviewCandidate', () => {
    it('星标节点即使高分也应返回 true', () => {
      expect(isReviewCandidate(makeNode({ mastery: { ...makeNode().mastery, is_starred: true, confidence: 5, check_status: 'understood' } }))).toBe(true)
    })

    it('due 节点应返回 true', () => {
      expect(isReviewCandidate(makeNode({ mastery: { ...makeNode().mastery, check_status: 'uncertain' } }))).toBe(true)
    })

    it('非 due 且非星标应返回 false', () => {
      expect(isReviewCandidate(makeNode({ mastery: { ...makeNode().mastery, confidence: 5, check_status: 'understood', is_starred: false } }))).toBe(false)
    })
  })

  // ================================================================
  describe('scoreReviewNode', () => {
    it('review_later 应获得最高优先分', () => {
      const nodeLater = makeNode({ mastery: { ...makeNode().mastery, review_later: true } })
      const nodeNeeds = makeNode({ mastery: { ...makeNode().mastery, check_status: 'needs_review' } })
      expect(scoreReviewNode(nodeLater, null)).toBeGreaterThan(scoreReviewNode(nodeNeeds, null))
    })

    it('check_status=needs_review 应高于 uncertain', () => {
      const nodeNeeds = makeNode({ mastery: { ...makeNode().mastery, check_status: 'needs_review' } })
      const nodeUncertain = makeNode({ mastery: { ...makeNode().mastery, check_status: 'uncertain' } })
      expect(scoreReviewNode(nodeNeeds, null)).toBeGreaterThan(scoreReviewNode(nodeUncertain, null))
    })

    it('uncertain 应高于 untested', () => {
      const nodeUncertain = makeNode({ mastery: { ...makeNode().mastery, check_status: 'uncertain' } })
      const nodeUntested = makeNode({ mastery: { ...makeNode().mastery, check_status: 'untested' } })
      expect(scoreReviewNode(nodeUncertain, null)).toBeGreaterThan(scoreReviewNode(nodeUntested, null))
    })

    it('星标应加分', () => {
      const starNode = makeNode({ mastery: { ...makeNode().mastery, is_starred: true } })
      const noStarNode = makeNode({ mastery: { ...makeNode().mastery, is_starred: false } })
      expect(scoreReviewNode(starNode, null)).toBeGreaterThan(scoreReviewNode(noStarNode, null))
    })

    it('匹配 selectedTopicId 应加分', () => {
      const node = makeNode({ topic_id: 't1' })
      const scoreMatch = scoreReviewNode(node, 't1')
      const scoreNoMatch = scoreReviewNode(node, 't2')
      expect(scoreMatch).toBeGreaterThan(scoreNoMatch)
    })

    it('时间越久分数应越高（时间衰减加分）', () => {
      const oldNode = makeNode({ last_accessed_at: FIXED_NOW - 10 * 3_600_000 })
      const newNode = makeNode({ last_accessed_at: FIXED_NOW })
      expect(scoreReviewNode(oldNode, null)).toBeGreaterThan(scoreReviewNode(newNode, null))
    })

    it('低掌握度应有更高基础分', () => {
      const low = makeNode({ mastery: { ...makeNode().mastery, confidence: 1 } })
      const high = makeNode({ mastery: { ...makeNode().mastery, confidence: 5, check_status: 'understood' } })
      // confidence=1 => (6-1)*90=450, confidence=5 + check_status=understood => no review bonus except maybe untested
      expect(scoreReviewNode(low, null)).toBeGreaterThan(scoreReviewNode(high, null))
    })
  })

  // ================================================================
  describe('passReviewFilter', () => {
    it('filter=all 应总是通过', () => {
      expect(passReviewFilter(makeNode(), 'all', null)).toBe(true)
    })

    it('filter=due 只允许到期节点', () => {
      const due = makeNode({ mastery: { ...makeNode().mastery, check_status: 'uncertain' } })
      const notDue = makeNode({ mastery: { ...makeNode().mastery, confidence: 5, check_status: 'understood' } })
      expect(passReviewFilter(due, 'due', null)).toBe(true)
      expect(passReviewFilter(notDue, 'due', null)).toBe(false)
    })

    it('filter=uncertain 允许 check_status=uncertain 或 confidence=3', () => {
      const uncertain = makeNode({ mastery: { ...makeNode().mastery, check_status: 'uncertain' } })
      const confidence3 = makeNode({ mastery: { ...makeNode().mastery, confidence: 3, check_status: 'understood' } })
      const neither = makeNode({ mastery: { ...makeNode().mastery, check_status: 'understood', confidence: 5 } })
      expect(passReviewFilter(uncertain, 'uncertain', null)).toBe(true)
      expect(passReviewFilter(confidence3, 'uncertain', null)).toBe(true)
      expect(passReviewFilter(neither, 'uncertain', null)).toBe(false)
    })

    it('filter=starred 只允许星标', () => {
      const starred = makeNode({ mastery: { ...makeNode().mastery, is_starred: true } })
      const notStarred = makeNode({ mastery: { ...makeNode().mastery, is_starred: false } })
      expect(passReviewFilter(starred, 'starred', null)).toBe(true)
      expect(passReviewFilter(notStarred, 'starred', null)).toBe(false)
    })

    it('filter=current-topic 只允许匹配 topic_id', () => {
      const node = makeNode({ topic_id: 't1' })
      expect(passReviewFilter(node, 'current-topic', 't1')).toBe(true)
      expect(passReviewFilter(node, 'current-topic', 't2')).toBe(false)
    })
  })
})
