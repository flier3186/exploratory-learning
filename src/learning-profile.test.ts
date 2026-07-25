import { describe, it, expect, vi } from 'vitest'
import { computeLearningProfile, profileSummaryForPrompt } from './learning-profile'
import type { AppState, LearningNode } from './types'
import { initialState, initialPreference } from './constants'

// 固定时间
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

/** 构造空状态 */
function makeEmptyState(): AppState {
  return {
    ...initialState,
  }
}

describe('learning-profile.ts', () => {
  // ================================================================
  describe('computeLearningProfile — 空状态', () => {
    it('0 节点应返回默认画像', () => {
      const state = makeEmptyState()
      const profile = computeLearningProfile(state)

      expect(profile.version).toBe(1)
      expect(profile.updated_at).toBe(FIXED_NOW)
      expect(profile.total_nodes).toBe(0)
      expect(profile.total_topics).toBe(0)
      expect(profile.total_study_days).toBe(0)
      expect(profile.topic_competence).toEqual([])
      expect(profile.cognitive_style.intent_pass_rates).toEqual({
        recall: 0,
        application: 0,
        boundary: 0,
      })
      expect(profile.cognitive_style.preferred_followup_types).toEqual([])
      expect(profile.cognitive_style.content_preference).toBe('balanced')
      expect(profile.cognitive_style.actual_difficulty).toBe(3)
      expect(profile.learning_rhythm).toEqual({
        avg_nodes_per_session: 0,
        active_days_30: 0,
        avg_session_gap_hours: 0,
        preferred_time_of_day: 'unknown',
      })
      expect(profile.knowledge_gaps.missing_prerequisites).toEqual([])
      expect(profile.knowledge_gaps.unvisited_branches).toEqual([])
      expect(profile.knowledge_gaps.unexplored_directions).toEqual([])
    })

    it('不应修改原始 state', () => {
      const state = makeEmptyState()
      const originalNodes = state.nodes
      computeLearningProfile(state)
      expect(state.nodes).toBe(originalNodes)
    })
  })

  // ================================================================
  describe('computeLearningProfile — 有节点但无 confidence/checks', () => {
    it('有节点但无 confidence 和 checks 时应返回合理默认值', () => {
      const node1 = makeNode({
        id: 'n1',
        topic_id: 't1',
        mastery: {
          is_visited: true,
          is_starred: false,
          confidence: undefined,
          review_later: false,
          check_status: 'untested',
        },
        checks: [],
        created_at: FIXED_NOW,
      })
      const node2 = makeNode({
        id: 'n2',
        topic_id: 't1',
        parent_id: 'n1',
        mastery: {
          is_visited: true,
          is_starred: false,
          confidence: undefined,
          review_later: false,
          check_status: 'untested',
        },
        checks: [],
        created_at: FIXED_NOW,
      })

      const state: AppState = {
        ...initialState,
        topics: [{ id: 't1', title: '闭包', created_at: FIXED_NOW, last_accessed_at: FIXED_NOW }],
        nodes: { n1: node1, n2: node2 },
      }
      const profile = computeLearningProfile(state)

      expect(profile.total_nodes).toBe(2)
      expect(profile.total_topics).toBe(1)
      expect(profile.total_study_days).toBe(1)

      // Topic competence
      expect(profile.topic_competence).toHaveLength(1)
      const tc = profile.topic_competence[0]!
      expect(tc.topic_id).toBe('t1')
      expect(tc.node_count).toBe(2)
      expect(tc.avg_confidence).toBe(0) // no confidence
      expect(tc.check_pass_rate).toBe(0) // none understood
      expect(tc.depth).toBe(2) // root -> child

      // Cognitive style: no checks, so intent_pass_rates all 0
      expect(profile.cognitive_style.intent_pass_rates).toEqual({
        recall: 0,
        application: 0,
        boundary: 0,
      })

      // Learning rhythm
      expect(profile.learning_rhythm.avg_nodes_per_session).toBe(2)
    })
  })

  // ================================================================
  describe('computeLearningProfile — 完整数据', () => {
    it('应正确计算各字段', () => {
      // Create a tree: root -> child -> grandchild (depth 3)
      const root = makeNode({
        id: 'root',
        topic_id: 't1',
        parent_id: null,
        learning_role: 'foundation',
        mastery: {
          is_visited: true,
          is_starred: false,
          confidence: 4,
          review_later: false,
          check_status: 'understood',
        },
        checks: [
          { id: 'c1', prompt: 'test', intent: 'recall', hint: 'hint' },
          { id: 'c2', prompt: 'test', intent: 'application', hint: 'hint' },
          { id: 'c3', prompt: 'test', intent: 'boundary', hint: 'hint' },
        ],
        created_at: FIXED_NOW - 1000,
      })
      const child = makeNode({
        id: 'child',
        topic_id: 't1',
        parent_id: 'root',
        learning_role: 'mechanism',
        mastery: {
          is_visited: true,
          is_starred: false,
          confidence: 2,
          review_later: false,
          check_status: 'needs_review',
        },
        checks: [
          { id: 'c4', prompt: 'test', intent: 'recall', hint: 'hint' },
        ],
        created_at: FIXED_NOW,
      })
      const gc = makeNode({
        id: 'gc',
        topic_id: 't1',
        parent_id: 'child',
        learning_role: 'application',
        mastery: {
          is_visited: false,
          is_starred: false,
          confidence: undefined,
          review_later: false,
          check_status: 'untested',
        },
        checks: [],
        created_at: FIXED_NOW,
      })

      // Second topic with one node
      const node2 = makeNode({
        id: 'n2',
        topic_id: 't2',
        parent_id: null,
        tags: ['机器学习'],
        learning_role: 'boundary',
        mastery: {
          is_visited: true,
          is_starred: false,
          confidence: 3,
          review_later: false,
          check_status: 'uncertain',
        },
        checks: [
          { id: 'c5', prompt: 'test', intent: 'boundary', hint: 'hint' },
        ],
        created_at: FIXED_NOW - 86_400_000, // 1 day ago
      })

      const state: AppState = {
        ...initialState,
        preference: {
          ...initialPreference,
          preferred_followup_types: { example: 5, mechanism: 3, boundary: 2 },
        },
        topics: [
          { id: 't1', title: '闭包', created_at: FIXED_NOW, last_accessed_at: FIXED_NOW },
          { id: 't2', title: '机器学习', created_at: FIXED_NOW, last_accessed_at: FIXED_NOW },
        ],
        nodes: { root, child, gc, n2: node2 },
      }
      const profile = computeLearningProfile(state)

      // Overall stats
      expect(profile.total_nodes).toBe(4)
      expect(profile.total_topics).toBe(2)
      expect(profile.total_study_days).toBe(2) // different days

      // Topic t1 competence
      const tc1 = profile.topic_competence.find((t) => t.topic_id === 't1')!
      expect(tc1.node_count).toBe(3)
      // avg_confidence: visited = root(4) + child(2), grandchild not visited
      expect(tc1.avg_confidence).toBeCloseTo(3) // (4+2)/2
      // check_pass_rate: root=understood, child=needs_review -> 1/2 = 0.5
      expect(tc1.check_pass_rate).toBeCloseTo(0.5)
      // depth: root -> child -> grandchild = 3
      expect(tc1.depth).toBe(3)
      // weak_roles: mechanism has 0/1 pass, foundation has 1/1 pass
      // So mechanism should be weakest
      expect(tc1.weak_roles).toContain('mechanism')

      // Topic t2 competence
      const tc2 = profile.topic_competence.find((t) => t.topic_id === 't2')!
      expect(tc2.node_count).toBe(1)

      // Cognitive style
      // intent_pass_rates: recall has 1 check from root(understood) + 1 from child(needs_review)
      // So recall: 1 pass / 2 total = 0.5
      // application: root understood = 1/1 = 1
      // boundary: root understood + n2 uncertain = 1/2 = 0.5
      expect(profile.cognitive_style.intent_pass_rates.recall).toBeCloseTo(0.5)
      expect(profile.cognitive_style.intent_pass_rates.application).toBeCloseTo(1)
      expect(profile.cognitive_style.intent_pass_rates.boundary).toBeCloseTo(0.5)
      // preferred_followup_types: example(5), mechanism(3), boundary(2) -> top 3
      expect(profile.cognitive_style.preferred_followup_types).toEqual(['example', 'mechanism', 'boundary'])
      // content_preference: example(5) + application(0) = 5, total=10, 5/10=0.5 < 0.6
      // mechanism(3) + comparison(0) + boundary(2) = 5, 5/10=0.5 < 0.6
      // -> balanced
      expect(profile.cognitive_style.content_preference).toBe('balanced')

      // Learning rhythm
      expect(profile.learning_rhythm.avg_nodes_per_session).toBeGreaterThan(0)
      // root and child are in same session (gap < 2h), grandchild too
      // n2 is 1 day ago, so different session
      // session 1: root, child, gc = 3; session 2: n2 = 1
      // avg = (3+1)/2 = 2
      expect(profile.learning_rhythm.avg_nodes_per_session).toBeCloseTo(2)

      // Knowledge gaps
      // unvisited_branches: root has children (child), root is visited => NOT unvisited
      // child has children (gc), child is visited => NOT unvisited
      // gc has no children => skip
      // n2 has no children => skip
      expect(profile.knowledge_gaps.unvisited_branches).toEqual([])

      // missing_prerequisites: t1 tags are ['JavaScript', '编程'], t2 tags are ['机器学习']
      // t1 missing: '机器学习'; t2 missing: 'JavaScript', '编程'
      const missing = profile.knowledge_gaps.missing_prerequisites
      expect(missing).toContain('机器学习')
      expect(missing).toContain('JavaScript')
      expect(missing).toContain('编程')

      // unexplored_directions: tags that don't appear in all topics
      // 'JavaScript' in t1 only, '编程' in t1 only, '机器学习' in t2 only
      expect(profile.knowledge_gaps.unexplored_directions).toContain('JavaScript')
      expect(profile.knowledge_gaps.unexplored_directions).toContain('机器学习')
    })

    it('应正确检测 unvisited_branches（有子节点但自身从未访问）', () => {
      const parent = makeNode({
        id: 'p1',
        topic_id: 't1',
        parent_id: null,
        mastery: {
          is_visited: false,
          is_starred: false,
          confidence: undefined,
          review_later: false,
          check_status: 'untested',
        },
      })
      const child = makeNode({
        id: 'c1',
        topic_id: 't1',
        parent_id: 'p1',
        mastery: {
          is_visited: true,
          is_starred: false,
          confidence: 3,
          review_later: false,
          check_status: 'understood',
        },
      })

      const state: AppState = {
        ...initialState,
        topics: [{ id: 't1', title: 'Test', created_at: FIXED_NOW, last_accessed_at: FIXED_NOW }],
        nodes: { p1: parent, c1: child },
      }
      const profile = computeLearningProfile(state)

      // parent has children but was never visited
      expect(profile.knowledge_gaps.unvisited_branches).toContain('p1')
    })

    it('应正确计算 content_preference 为 example_driven', () => {
      const state: AppState = {
        ...initialState,
        preference: {
          ...initialPreference,
          preferred_followup_types: { example: 8, application: 4, mechanism: 1 },
        },
        topics: [{ id: 't1', title: 'Test', created_at: FIXED_NOW, last_accessed_at: FIXED_NOW }],
        nodes: {
          n1: makeNode({ id: 'n1', topic_id: 't1' }),
        },
      }
      const profile = computeLearningProfile(state)
      // example(8) + application(4) = 12; total = 13; 12/13 > 0.6
      expect(profile.cognitive_style.content_preference).toBe('example_driven')
    })

    it('应正确计算 content_preference 为 mechanism_driven', () => {
      const state: AppState = {
        ...initialState,
        preference: {
          ...initialPreference,
          preferred_followup_types: { mechanism: 6, comparison: 4, example: 1 },
        },
        topics: [{ id: 't1', title: 'Test', created_at: FIXED_NOW, last_accessed_at: FIXED_NOW }],
        nodes: {
          n1: makeNode({ id: 'n1', topic_id: 't1' }),
        },
      }
      const profile = computeLearningProfile(state)
      // mechanism(6) + comparison(4) + boundary(0) = 10; total = 11; 10/11 > 0.6
      expect(profile.cognitive_style.content_preference).toBe('mechanism_driven')
    })
  })

  // ================================================================
  describe('profileSummaryForPrompt', () => {
    it('数据不足（<5 节点）应返回默认文本', () => {
      const state: AppState = {
        ...initialState,
        nodes: { n1: makeNode({ id: 'n1', topic_id: 't1' }) },
      }
      const profile = computeLearningProfile(state)
      const summary = profileSummaryForPrompt(profile, 't1')
      expect(summary).toBe('用户刚开始使用，暂无足够画像数据，使用默认教学策略。')
    })

    it('数据充足时应包含领域信息和薄弱环节', () => {
      // Create 6 nodes (>= 5 threshold) across 1 topic
      const nodes: Record<string, LearningNode> = {}
      for (let i = 1; i <= 6; i++) {
        nodes[`n${i}`] = makeNode({
          id: `n${i}`,
          topic_id: 't1',
          parent_id: i > 1 ? `n${i - 1}` : null,
          learning_role: i <= 2 ? 'mechanism' : 'foundation',
          mastery: {
            is_visited: true,
            is_starred: false,
            confidence: i <= 2 ? 2 : 4,
            review_later: false,
            check_status: i <= 2 ? 'needs_review' : 'understood',
          },
          checks: [
            { id: `c${i}`, prompt: 'test', intent: 'recall', hint: 'hint' },
          ],
        })
      }

      const state: AppState = {
        ...initialState,
        topics: [{ id: 't1', title: '概率论', created_at: FIXED_NOW, last_accessed_at: FIXED_NOW }],
        nodes,
      }
      const profile = computeLearningProfile(state)
      const summary = profileSummaryForPrompt(profile, 't1')

      // Should contain header
      expect(summary).toContain('用户学习画像')
      expect(summary).toContain('6 节点')
      expect(summary).toContain('当前领域')
      expect(summary).toContain('t1')
      expect(summary).toContain('认知风格')
    })

    it('无 topicId 时不应崩溃', () => {
      const nodes: Record<string, LearningNode> = {}
      for (let i = 1; i <= 5; i++) {
        nodes[`n${i}`] = makeNode({ id: `n${i}`, topic_id: 't1' })
      }
      const state: AppState = { ...initialState, nodes }
      const profile = computeLearningProfile(state)
      // 5 nodes, exactly threshold — should not show default text
      const summary = profileSummaryForPrompt(profile, null)
      expect(summary).toContain('用户学习画像')
      // No topic-specific line
      expect(summary).not.toContain('当前领域')
    })

    it('有 unvisited_branches 时应包含薄弱环节提示', () => {
      const parent = makeNode({
        id: 'p1',
        topic_id: 't1',
        parent_id: null,
        mastery: {
          is_visited: false,
          is_starred: false,
          confidence: undefined,
          review_later: false,
          check_status: 'untested',
        },
      })
      const nodes: Record<string, LearningNode> = { p1: parent }
      for (let i = 1; i <= 5; i++) {
        nodes[`n${i}`] = makeNode({
          id: `n${i}`,
          topic_id: 't1',
          parent_id: i === 1 ? 'p1' : `n${i - 1}`,
        })
      }

      const state: AppState = {
        ...initialState,
        topics: [{ id: 't1', title: 'Test', created_at: FIXED_NOW, last_accessed_at: FIXED_NOW }],
        nodes,
      }
      const profile = computeLearningProfile(state)
      const summary = profileSummaryForPrompt(profile, 't1')

      expect(summary).toContain('薄弱环节')
    })
  })
})
