import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LearningCard } from '../components/LearningCard'
import type { LearningNode } from '../types'

// Minimal valid node factory
function makeNode(overrides: Partial<LearningNode> = {}): LearningNode {
  return {
    id: 'test-node-1',
    topic_id: 'topic-1',
    parent_id: null,
    question: '什么是闭包？',
    short_title: '闭包概念',
    one_line_memory: '闭包是函数和其词法环境的组合',
    tags: ['JavaScript', '编程'],
    question_type: 'concept',
    learning_role: 'foundation',
    answer: {
      summary: '闭包是函数可以记住并访问其词法作用域，即使函数在词法作用域之外执行。',
      plain: '想象你在一个房间里放了一个箱子，离开房间后还能找到箱子。',
      mechanism: 'JavaScript 使用词法作用域，函数在定义时捕获外部变量的引用。',
      misunderstandings: ['闭包会导致内存泄漏', '闭包只存在于匿名函数'],
      example: '事件处理器中引用外部变量就是闭包的典型用法。',
    },
    fact_check: {
      explainable: ['闭包是语言特性'],
      to_verify: [],
      suggested_sources: [],
      avoid_conclusions: [],
    },
    followups: [
      {
        id: 'fu-1',
        question: '闭包和作用域链有什么关系？',
        type: 'foundation',
        reason: '理解作用域链是深入闭包的基础。',
        difficulty: 2,
        expected_gain: '建立作用域和闭包的联系。',
      },
      {
        id: 'fu-2',
        question: '闭包在哪些场景下会有性能问题？',
        type: 'boundary',
        reason: '闭包使用不当可能导致内存泄漏。',
        difficulty: 3,
        expected_gain: '知道何时避免使用闭包。',
      },
      {
        id: 'fu-3',
        question: 'React 的 useState 是闭包吗？',
        type: 'application',
        reason: 'Hooks 机制和闭包有密切关系。',
        difficulty: 3,
        expected_gain: '从实际框架理解闭包。',
      },
      {
        id: 'fu-4',
        question: 'Python 的闭包和 JavaScript 有什么不同？',
        type: 'comparison',
        reason: '对比不同语言的实现差异。',
        difficulty: 4,
        expected_gain: '跨语言理解闭包。',
      },
      {
        id: 'fu-5',
        question: '如何用闭包实现私有变量？',
        type: 'practice',
        reason: '闭包的经典应用场景。',
        difficulty: 2,
        expected_gain: '掌握闭包的实际用途。',
      },
    ],
    checks: [
      { id: 'c1', prompt: '不用看答案，你能用自己的话解释闭包吗？', intent: 'recall', hint: '先说核心直觉，再补一个例子。' },
      { id: 'c2', prompt: '如果把闭包用到一个真实场景，第一步看什么？', intent: 'application', hint: '从条件、对象、结果三个角度回答。' },
      { id: 'c3', prompt: '闭包最容易被误用在什么地方？', intent: 'boundary', hint: '从适用边界或常见误解入手。' },
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
      check_status: 'untested',
    },
    links: {
      children_ids: [],
      related_node_ids: [],
      prerequisite_node_ids: [],
    },
    search_index: {
      text: '闭包 JavaScript 作用域',
      updated_at: Date.now(),
    },
    created_at: Date.now(),
    last_accessed_at: Date.now(),
    ...overrides,
  }
}

const defaultProps = {
  node: makeNode(),
  onToggleStar: vi.fn(),
  onConfidence: vi.fn(),
  onCheckStatus: vi.fn(),
  onAskFollowup: vi.fn(),
  onAskFollowups: vi.fn(),
  onFeedback: vi.fn(),
  onReplaceFollowups: vi.fn(),
}

describe('LearningCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the node title', () => {
    render(<LearningCard {...defaultProps} />)
    expect(screen.getByText('闭包概念')).toBeDefined()
  })

  it('should render one-line memory', () => {
    render(<LearningCard {...defaultProps} />)
    expect(screen.getByText('闭包是函数和其词法环境的组合')).toBeDefined()
  })

  it('should render tags', () => {
    render(<LearningCard {...defaultProps} />)
    expect(screen.getByText('#JavaScript')).toBeDefined()
    expect(screen.getByText('#编程')).toBeDefined()
  })

  it('should render answer blocks', () => {
    render(<LearningCard {...defaultProps} />)
    expect(screen.getByText('通俗解释')).toBeDefined()
    expect(screen.getByText('关键机制')).toBeDefined()
    expect(screen.getByText('具体例子')).toBeDefined()
  })

  it('should render followup questions', () => {
    render(<LearningCard {...defaultProps} />)
    expect(screen.getByText('闭包和作用域链有什么关系？')).toBeDefined()
  })

  it('should call onToggleStar when star button clicked', async () => {
    const user = userEvent.setup()
    render(<LearningCard {...defaultProps} />)
    await user.click(screen.getByText('加入重点'))
    expect(defaultProps.onToggleStar).toHaveBeenCalled()
  })

  it('should toggle star text when starred', () => {
    render(<LearningCard {...defaultProps} node={makeNode({ mastery: { ...makeNode().mastery, is_starred: true } })} />)
    expect(screen.getByText('重点回看')).toBeDefined()
  })

  it('should render mistakes section expanded by default', () => {
    render(<LearningCard {...defaultProps} />)
    expect(screen.getByText(/易错点/)).toBeDefined()
  })

  it('should render check panel collapsed', () => {
    render(<LearningCard {...defaultProps} />)
    expect(screen.getAllByText('理解检测')).toHaveLength(2)
  })

  it('should show demo banner for demo nodes', () => {
    render(<LearningCard {...defaultProps} node={makeNode({ quality: { ...makeNode().quality, is_demo: true, generation_status: 'failed' } })} />)
    expect(screen.getByText('演示模式')).toBeDefined()
  })

  it('should allow selecting up to 3 followups', async () => {
    const user = userEvent.setup()
    render(<LearningCard {...defaultProps} />)
    const followups = defaultProps.node.followups.slice(0, 3)

    for (const fu of followups) {
      await user.click(screen.getByText(fu.question))
    }

    // Should show batch bar
    expect(screen.getByText(/已选择 3\/3/)).toBeDefined()
    expect(screen.getByText('生成选中的追问')).toBeDefined()
  })
})
