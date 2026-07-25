import { describe, it, expect } from 'vitest'
import {
  generateQuizzesForNode,
  createQuizSession,
  quizResultToQuality,
  buildFeynmanPrompt,
} from './quiz-generator'
import type { LearningNode } from './types'

function makeNode(overrides: Partial<LearningNode> = {}): LearningNode {
  return {
    id: 'node_test_1',
    topic_id: 'topic_1',
    parent_id: null,
    question: '什么是闭包？',
    short_title: '闭包',
    one_line_memory: '闭包是函数与其词法环境的组合',
    tags: ['javascript', '编程'],
    question_type: 'concept',
    learning_role: 'foundation',
    answer: {
      summary: '闭包让内部函数访问外部函数的变量',
      plain: '想象你有一个背包，里面装着你需要的所有东西。闭包就像这个背包——函数带着它被创建时的环境一起走。',
      mechanism: '当函数被创建时，它会捕获周围作用域的变量引用，形成一个闭包。即使外部函数已经执行完毕，内部函数仍然可以访问这些变量。',
      misunderstandings: ['闭包会导致内存泄漏', '闭包就是回调函数'],
      example: 'addEventListener 的回调就是一个闭包，它可以访问外部的变量。',
    },
    fact_check: {
      explainable: [],
      to_verify: [],
      suggested_sources: [],
      avoid_conclusions: [],
    },
    followups: [],
    checks: [
      { id: 'check_1', prompt: '不用看答案，你能解释闭包是什么吗？', intent: 'recall', hint: '想想函数和变量之间的关系。' },
      { id: 'check_2', prompt: '闭包在真实场景中怎么用？', intent: 'application', hint: '从事件处理或模块模式入手。' },
    ],
    quality: {
      parse_failed: false,
      repaired: false,
      regenerated_count: 0,
      source_required: false,
      is_demo: false,
      generation_status: 'ok',
      validation_errors: [],
      validation_warnings: [],
    },
    mastery: {
      is_visited: true,
      is_starred: false,
      confidence: 3,
      review_later: false,
      check_status: 'uncertain',
    },
    links: {
      children_ids: [],
      related_node_ids: [],
      prerequisite_node_ids: [],
    },
    search_index: { text: '闭包', updated_at: Date.now() },
    created_at: Date.now(),
    last_accessed_at: Date.now(),
    ...overrides,
  }
}

describe('quiz-generator', () => {
  describe('generateQuizzesForNode', () => {
    it('should generate quizzes from existing checks', () => {
      const node = makeNode()
      const quizzes = generateQuizzesForNode(node)

      expect(quizzes.length).toBeGreaterThan(0)
      // 应该有来自 checks 的 recall 题
      expect(quizzes.some((q) => q.type === 'recall' && q.source === 'checks')).toBe(true)
    })

    it('should generate auto quizzes from node content', () => {
      const node = makeNode()
      const quizzes = generateQuizzesForNode(node)

      // 应该有自动生成的 fill_blank 题
      expect(quizzes.some((q) => q.type === 'fill_blank' && q.source === 'auto')).toBe(true)
    })

    it('should generate true_false quiz from misunderstandings', () => {
      const node = makeNode()
      const quizzes = generateQuizzesForNode(node)

      // 应该有基于误解的判断题
      expect(quizzes.some((q) => q.type === 'true_false' && q.source === 'auto')).toBe(true)
    })

    it('should limit to 5 quizzes', () => {
      const node = makeNode()
      const quizzes = generateQuizzesForNode(node)
      expect(quizzes.length).toBeLessThanOrEqual(5)
    })

    it('should include hint for each quiz', () => {
      const node = makeNode()
      const quizzes = generateQuizzesForNode(node)

      for (const quiz of quizzes) {
        expect(quiz.hint).toBeTruthy()
      }
    })

    it('should reference correct nodeId', () => {
      const node = makeNode({ id: 'my_special_node' })
      const quizzes = generateQuizzesForNode(node)

      for (const quiz of quizzes) {
        expect(quiz.nodeId).toBe('my_special_node')
      }
    })
  })

  describe('createQuizSession', () => {
    it('should create session with quizzes from multiple nodes', () => {
      const node1 = makeNode({ id: 'n1' })
      const node2 = makeNode({ id: 'n2', short_title: '原型链', one_line_memory: '原型链是 JavaScript 继承的基础' })
      const session = createQuizSession([node1, node2], 2)

      expect(session.totalQuestions).toBeGreaterThan(0)
      expect(session.quizzes.length).toBe(session.totalQuestions)
      expect(session.startedAt).toBeGreaterThan(0)
    })

    it('should cap at 10 quizzes total', () => {
      const nodes = Array.from({ length: 10 }, (_, i) =>
        makeNode({ id: `n${i}`, short_title: `概念${i}`, one_line_memory: `记忆${i}` }),
      )
      const session = createQuizSession(nodes, 3)
      expect(session.quizzes.length).toBeLessThanOrEqual(10)
    })

    it('should return empty session for no nodes', () => {
      const session = createQuizSession([])
      expect(session.totalQuestions).toBe(0)
      expect(session.quizzes.length).toBe(0)
    })

    it('should prioritize SRS-due nodes', () => {
      const pastNode = makeNode({
        id: 'n_past',
        mastery: { ...makeNode().mastery, next_review_at: Date.now() - 1000 },
      })
      const futureNode = makeNode({
        id: 'n_future',
        short_title: '未来复习',
        one_line_memory: '未来的节点',
        mastery: { ...makeNode().mastery, next_review_at: Date.now() + 86400000 },
      })
      const session = createQuizSession([futureNode, pastNode], 1)

      // 到期的节点应该排在前面
      expect(session.quizzes[0].nodeId).toBe('n_past')
    })
  })

  describe('quizResultToQuality', () => {
    it('should map rating 3 (perfect) to quality 5', () => {
      expect(quizResultToQuality(3)).toBe(5)
    })
    it('should map rating 2 (basic) to quality 4', () => {
      expect(quizResultToQuality(2)).toBe(4)
    })
    it('should map rating 1 (fuzzy) to quality 3', () => {
      expect(quizResultToQuality(1)).toBe(3)
    })
    it('should map rating 0 (forgot) to quality 1', () => {
      expect(quizResultToQuality(0)).toBe(1)
    })
  })

  describe('buildFeynmanPrompt', () => {
    it('should include node title in prompt', () => {
      const node = makeNode({ short_title: '闭包' })
      const prompt = buildFeynmanPrompt(node)
      expect(prompt).toContain('闭包')
    })

    it('should include node content', () => {
      const node = makeNode()
      const prompt = buildFeynmanPrompt(node)
      expect(prompt).toContain(node.one_line_memory)
      expect(prompt).toContain(node.answer.summary)
    })

    it('should include evaluation criteria', () => {
      const node = makeNode()
      const prompt = buildFeynmanPrompt(node)
      expect(prompt).toContain('5分')
      expect(prompt).toContain('JSON')
    })
  })
})
