import type { FollowupQuestion, FollowupType, GeneratedPayload, LearningNode, LearningRole } from './types'
import { FOLLOWUP_LABEL } from './constants'
import { normalizeFactCheck } from './ai'
import { clampText, now, sanitizeChecks, uid } from './utils'
import { createSearchIndex, normalizeTags } from './storage'
import { getNodePath } from './learning'

export function roleFromFollowupType(type?: FollowupType): LearningRole {
  if (type === 'foundation' || type === 'example') return 'foundation'
  if (type === 'mechanism') return 'mechanism'
  if (type === 'application') return 'application'
  if (type === 'comparison' || type === 'connection') return 'comparison'
  if (type === 'boundary' || type === 'challenge') return 'boundary'
  if (type === 'practice') return 'practice'
  return 'mechanism'
}

export function sanitizeFollowups(items: GeneratedPayload['followups'], question: string): FollowupQuestion[] {
  const defaults: FollowupQuestion[] = [
    {
      id: uid('fu'),
      question: `这个问题最容易误解的地方是什么？`,
      type: 'boundary',
      reason: '先排除常见误区，后面学习会更稳。',
      difficulty: 2,
      expected_gain: '知道这个概念的边界和常见错误理解。',
    },
    {
      id: uid('fu'),
      question: `能不能用一个生活例子解释"${clampText(question, 12)}"？`,
      type: 'example',
      reason: '用例子把抽象内容落到直觉层面。',
      difficulty: 1,
      expected_gain: '形成更容易记住的直观理解。',
    },
    {
      id: uid('fu'),
      question: `它在真实场景中有什么应用？`,
      type: 'application',
      reason: '把当前知识连接到具体使用场景。',
      difficulty: 2,
      expected_gain: '知道这个知识为什么值得学。',
    },
  ]

  const list = Array.isArray(items) ? items : []
  const normalized = list
    .map((item) => {
      const type = (item.type || 'foundation') as FollowupType
      return {
        id: item.id || uid('fu'),
        question: clampText(String(item.question || ''), 90),
        type: FOLLOWUP_LABEL[type] ? type : 'foundation',
        reason: clampText(String(item.reason || '这个方向能帮助你继续把问题学深。'), 80),
        difficulty: Math.min(5, Math.max(1, Number(item.difficulty || 2))) as 1 | 2 | 3 | 4 | 5,
        expected_gain: clampText(String(item.expected_gain || '获得下一层理解。'), 80),
      }
    })
    .filter((item) => item.question)

  return [...normalized, ...defaults].slice(0, 8)
}

export function fallbackPayload(question: string, roleHint?: LearningRole): GeneratedPayload {
  const short = clampText(question.replace(/[？?。！!]/g, ''), 12) || '新的问题'
  const tags = Array.from(new Set(question.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) || ['探索学习', '概念理解'])).slice(0, 5)
  return {
    question_type: 'concept',
    learning_role: roleHint || 'root',
    short_title: short,
    one_line_memory: `围绕"${short}"建立第一层理解，并继续追问。`,
    tags,
    source_note: '这是本地演示生成，用于无 API Key 时体验流程。',
    answer: {
      summary: `先抓住"${short}"的核心，再通过例子和追问逐层展开。`,
      plain: `可以把这个问题当成一张地图的起点：先找到中心概念，再看它和哪些概念相连，最后通过例子确认自己是否真的理解。当前是演示模式，接入 API Key 后会由模型生成更具体的内容。`,
      mechanism: `系统会把问题转成学习卡片，再生成几个下一步方向。每个方向都会带有类型、理由和难度，点击后成为知识树的新节点。`,
      misunderstandings: ['不要把第一个答案当成最终结论', '不要只收集名词，要持续追问机制和边界'],
      example: `例如你问"什么是马尔可夫链"，系统会先解释核心直觉，再推荐"无记忆性""状态转移矩阵""PageRank 应用"等方向。`,
    },
    fact_check: normalizeFactCheck(null, question, false),
    followups: [
      {
        question: `"${short}"最基础的前置概念是什么？`,
        type: 'foundation',
        reason: '先补基础，后续理解会更稳。',
        difficulty: 1,
        expected_gain: '明确继续学习前必须掌握的概念。',
      },
      {
        question: `"${short}"背后的关键机制是什么？`,
        type: 'mechanism',
        reason: '从直觉进入真正理解。',
        difficulty: 3,
        expected_gain: '知道它为什么成立或如何运作。',
      },
      {
        question: `"${short}"在现实中有什么应用？`,
        type: 'application',
        reason: '把抽象知识连接到真实场景。',
        difficulty: 2,
        expected_gain: '知道它为什么有用。',
      },
      {
        question: `"${short}"有什么容易误解的地方？`,
        type: 'boundary',
        reason: '提前识别边界和误区。',
        difficulty: 2,
        expected_gain: '避免把概念用错。',
      },
      {
        question: `能不能给我一道关于"${short}"的小练习？`,
        type: 'practice',
        reason: '用练习验证自己是否真的懂了。',
        difficulty: 2,
        expected_gain: '检查理解是否能迁移。',
      },
    ],
    checks: [
      {
        prompt: `不用看答案，你能用自己的话解释"${short}"吗？`,
        intent: 'recall',
        hint: '先说核心直觉，再补一个例子。',
      },
      {
        prompt: `"${short}"在真实场景里能解决什么问题？`,
        intent: 'application',
        hint: '试着把它放进一个你熟悉的场景。',
      },
      {
        prompt: `"${short}"有什么容易误解或用错的地方？`,
        intent: 'boundary',
        hint: '回看易错点，再用自己的话复述。',
      },
    ],
    keywords: tags,
  }
}

export function payloadToNode(
  payload: GeneratedPayload,
  question: string,
  topicId: string,
  parentId: string | null,
  roleHint?: LearningRole,
  parseFailed = false,
  repaired = false,
): LearningNode {
  const fallback = fallbackPayload(question, roleHint)
  const selectedRole = payload.learning_role || roleHint || (parentId ? 'mechanism' : 'root')
  const base = {
    id: uid('node'),
    topic_id: topicId,
    parent_id: parentId,
    question,
    short_title: clampText(payload.short_title || fallback.short_title || question, 16),
    one_line_memory: clampText(payload.one_line_memory || fallback.one_line_memory || question, 60),
    tags: normalizeTags(payload.tags, fallback.tags || []),
    question_type: payload.question_type || 'concept',
    learning_role: selectedRole,
    answer: {
      summary: payload.answer?.summary || fallback.answer?.summary || question,
      plain: payload.answer?.plain || fallback.answer?.plain || '',
      mechanism: payload.answer?.mechanism || fallback.answer?.mechanism || '',
      misunderstandings:
        Array.isArray(payload.answer?.misunderstandings) && payload.answer?.misunderstandings.length
          ? payload.answer.misunderstandings.map(String).slice(0, 4)
          : fallback.answer?.misunderstandings || [],
      example: payload.answer?.example || fallback.answer?.example || '',
      source_note: payload.source_note || payload.answer?.source_note || fallback.source_note,
    },
    fact_check: normalizeFactCheck(payload.fact_check, question, Boolean(payload.source_note || payload.answer?.source_note || payload.question_type === 'fact')),
    followups: sanitizeFollowups(payload.followups, question),
    checks: sanitizeChecks(payload.checks, question),
    quality: {
      parse_failed: parseFailed,
      repaired,
      regenerated_count: 0,
      source_required: Boolean(payload.source_note || payload.answer?.source_note),
      is_demo: false,
      generation_status: parseFailed ? 'failed' : repaired ? 'repaired' : 'ok',
      validation_errors: [],
      validation_warnings: [],
    },
    mastery: {
      is_visited: false,
      is_starred: false,
      confidence: undefined,
      review_later: false,
      check_status: 'untested',
    },
    links: {
      children_ids: [],
      related_node_ids: [],
      prerequisite_node_ids: [],
    },
    created_at: now(),
    last_accessed_at: now(),
  } satisfies Omit<LearningNode, 'search_index'>

  return {
    ...base,
    search_index: createSearchIndex(base),
  }
}

export function buildContext(
  nodes: Record<string, LearningNode>,
  selectedTopic: { title: string } | null,
  parentId: string | null,
): string {
  if (!parentId) return selectedTopic ? `当前主题：${selectedTopic.title}` : ''
  const path = getNodePath(nodes, parentId)
  const parent = nodes[parentId]
  const recentAncestors = path.slice(-3)
  return [
    selectedTopic ? `当前主题：${selectedTopic.title}` : '',
    `当前路径：${path.map((item) => item.short_title).join(' › ')}`,
    recentAncestors.length
      ? `最近路径摘要：${recentAncestors.map((item) => `${item.short_title}：${item.answer.summary}`).join(' / ')}`
      : '',
    parent ? `父节点问题：${parent.question}` : '',
    parent ? `父节点一句话结论：${parent.answer.summary}` : '',
    parent ? `父节点记忆点：${parent.one_line_memory}` : '',
    parent?.answer.misunderstandings.length ? `父节点易错点：${parent.answer.misunderstandings.join('；')}` : '',
    parent?.tags.length ? `父节点标签：${parent.tags.join('、')}` : '',
    parent?.answer.source_note ? `父节点来源/核验提示：${parent.answer.source_note}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
