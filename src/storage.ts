import { FOLLOWUP_LABEL, STORAGE_KEY, initialPreference, initialState } from './constants'
import { normalizeFactCheck, safeStringList, isQuestionType, isLearningRole } from './ai'
import { clampText, now, sanitizeChecks, uid } from './utils'
import type {
  AppState,
  CheckStatus,
  FollowupQuestion,
  FollowupType,
  GenerationStatus,
  LearningNode,
  Topic,
} from './types'

export function normalizeTags(tags: unknown, fallback: string[]) {
  const list = Array.isArray(tags) ? tags : fallback
  return Array.from(new Set(list.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 6)
}

export function createSearchIndex(node: Omit<LearningNode, 'search_index'>) {
  const parts = [
    node.question,
    node.short_title,
    node.one_line_memory,
    node.tags.join(' '),
    node.learning_role,
    node.answer.summary,
    node.answer.plain,
    node.answer.mechanism,
    node.answer.example,
    node.answer.misunderstandings.join(' '),
    node.fact_check.explainable.join(' '),
    node.fact_check.to_verify.join(' '),
    node.fact_check.suggested_sources.join(' '),
    node.fact_check.avoid_conclusions.join(' '),
    node.checks.map((check) => `${check.prompt} ${check.hint}`).join(' '),
  ]
  return {
    text: parts.join(' ').toLowerCase(),
    updated_at: now(),
  }
}

function isFollowupType(value: unknown): value is FollowupType {
  return Object.keys(FOLLOWUP_LABEL).includes(String(value))
}

function isCheckStatus(value: unknown): value is CheckStatus {
  return ['untested', 'understood', 'uncertain', 'needs_review'].includes(String(value))
}

function isGenerationStatus(value: unknown): value is GenerationStatus {
  return ['ok', 'repaired', 'needs_verification', 'failed', 'pending'].includes(String(value))
}


export function normalizeImportedNode(value: unknown): LearningNode | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<LearningNode>
  if (!raw.id || !raw.topic_id || !raw.question) return null

  const answer = (raw.answer || {}) as Partial<LearningNode['answer']>
  const mastery = (raw.mastery || {}) as Partial<LearningNode['mastery']>
  const quality = (raw.quality || {}) as Partial<LearningNode['quality']>
  const links = (raw.links || {}) as Partial<LearningNode['links']>
  const question = String(raw.question)
  const followups = Array.isArray(raw.followups)
    ? raw.followups
        .map((item) => {
          const fu = item as Partial<FollowupQuestion>
          if (!fu.question) return null
          const type = isFollowupType(fu.type) ? fu.type : 'foundation'
          return {
            id: String(fu.id || uid('fu')),
            question: clampText(String(fu.question), 90),
            type,
            reason: clampText(String(fu.reason || '这个方向能帮助你继续把问题学深。'), 80),
            difficulty: Math.min(5, Math.max(1, Number(fu.difficulty || 2))) as 1 | 2 | 3 | 4 | 5,
            expected_gain: clampText(String(fu.expected_gain || '获得下一层理解。'), 80),
            user_feedback: fu.user_feedback,
          } satisfies FollowupQuestion
        })
        .filter(Boolean) as FollowupQuestion[]
    : []
  const checks = sanitizeChecks(raw.checks, question)

  const base = {
    id: String(raw.id),
    topic_id: String(raw.topic_id),
    parent_id: raw.parent_id ? String(raw.parent_id) : null,
    question,
    short_title: clampText(String(raw.short_title || question), 16),
    one_line_memory: clampText(String(raw.one_line_memory || answer.summary || question), 60),
    tags: normalizeTags(raw.tags, []),
    question_type: isQuestionType(raw.question_type) ? raw.question_type : 'concept',
    learning_role: isLearningRole(raw.learning_role) ? raw.learning_role : 'mechanism',
    answer: {
      summary: String(answer.summary || question),
      plain: String(answer.plain || ''),
      mechanism: String(answer.mechanism || ''),
      misunderstandings: safeStringList(answer.misunderstandings).slice(0, 4),
      example: String(answer.example || ''),
      source_note: answer.source_note ? String(answer.source_note) : undefined,
    },
    fact_check: normalizeFactCheck(raw.fact_check, question, raw.question_type === 'fact' || Boolean(quality.source_required)),
    followups,
    checks,
    quality: {
      parse_failed: Boolean(quality.parse_failed),
      repaired: Boolean(quality.repaired),
      regenerated_count: Number(quality.regenerated_count || 0),
      source_required: Boolean(quality.source_required),
      is_demo: Boolean(quality.is_demo),
      generation_status: isGenerationStatus(quality.generation_status) ? quality.generation_status : quality.is_demo ? 'failed' : 'ok',
      validation_errors: safeStringList(quality.validation_errors),
      validation_warnings: safeStringList(quality.validation_warnings),
      failure_reason: quality.failure_reason ? String(quality.failure_reason) : undefined,
      user_rating: quality.user_rating,
    },
    mastery: {
      is_visited: Boolean(mastery.is_visited),
      is_starred: Boolean(mastery.is_starred),
      confidence: mastery.confidence,
      review_later: Boolean(mastery.review_later),
      check_status: isCheckStatus(mastery.check_status) ? mastery.check_status : 'untested',
      checked_at: mastery.checked_at ? Number(mastery.checked_at) : undefined,
      // SM-2 字段：保留已有值，不删不设默认（由算法填充）
      srs_interval: mastery.srs_interval ? Number(mastery.srs_interval) : undefined,
      srs_ease_factor: mastery.srs_ease_factor ? Number(mastery.srs_ease_factor) : undefined,
      srs_repetitions: mastery.srs_repetitions != null ? Number(mastery.srs_repetitions) : undefined,
      next_review_at: mastery.next_review_at ? Number(mastery.next_review_at) : undefined,
    },
    links: {
      children_ids: safeStringList(links.children_ids),
      related_node_ids: safeStringList(links.related_node_ids),
      prerequisite_node_ids: safeStringList(links.prerequisite_node_ids),
    },
    _learning_goal: raw._learning_goal ? String(raw._learning_goal) : undefined,
    created_at: Number(raw.created_at || now()),
    last_accessed_at: Number(raw.last_accessed_at || now()),
  } satisfies Omit<LearningNode, 'search_index'>

  return {
    ...base,
    search_index:
      raw.search_index?.text
        ? { text: String(raw.search_index.text), updated_at: Number(raw.search_index.updated_at || now()) }
        : createSearchIndex(base),
  }
}

export function normalizeState(value: unknown, current?: AppState): AppState {
  if (!value || typeof value !== 'object') return current || initialState
  const raw = value as Record<string, unknown>

  // Future version migration goes here (raw.version field)
  const _version = raw.version
  void _version

  const state = raw.data && typeof raw.data === 'object' ? (raw.data as Partial<AppState>) : (raw as Partial<AppState>)
  const topics = Array.isArray(state.topics)
    ? state.topics
        .filter((topic): topic is Topic => Boolean(topic && topic.id && topic.title))
        .map((topic) => ({
          id: String(topic.id),
          title: String(topic.title),
          goal: topic.goal ? String(topic.goal) : undefined,
          created_at: Number(topic.created_at || now()),
          last_accessed_at: Number(topic.last_accessed_at || now()),
        }))
    : []
  const nodes = Object.fromEntries(
    Object.values(state.nodes || {})
      .map(normalizeImportedNode)
      .filter((node): node is LearningNode => Boolean(node))
      .map((node) => [node.id, node]),
  )
  const selectedTopicId = state.selectedTopicId && topics.some((topic) => topic.id === state.selectedTopicId) ? String(state.selectedTopicId) : null
  const selectedNodeId = state.selectedNodeId && nodes[String(state.selectedNodeId)] ? String(state.selectedNodeId) : null

  return {
    ...initialState,
    topics,
    nodes,
    selectedTopicId,
    selectedNodeId,
    apiKey: current?.apiKey ?? state.apiKey ?? '',
    apiBase: current?.apiBase ?? state.apiBase ?? initialState.apiBase,
    model: current?.model ?? state.model ?? initialState.model,
    preference: {
      ...initialPreference,
      ...(state.preference || {}),
      preferred_followup_types: { ...(state.preference?.preferred_followup_types || {}) },
      disliked_followup_types: { ...(state.preference?.disliked_followup_types || {}) },
      recent_positive_examples: safeStringList(state.preference?.recent_positive_examples).slice(-12),
      recent_negative_examples: safeStringList(state.preference?.recent_negative_examples).slice(-12),
    },
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as Partial<AppState>
    return normalizeState(parsed)
  } catch {
    return initialState
  }
}

export function normalizeTemplateState(template: unknown, current: AppState): AppState {
  if (!template || typeof template !== 'object') return current
  const raw = template as Record<string, unknown>
  if (!raw._template && !raw.topics && !raw.nodes) return current

  const templateTopics = Array.isArray(raw.topics)
    ? raw.topics
        .filter((t: unknown): t is Topic => Boolean(t && typeof t === 'object' && (t as Topic).id && (t as Topic).title))
        .map((t: Topic) => ({
          id: String(t.id),
          title: String(t.title),
          goal: t.goal ? String(t.goal) : undefined,
          created_at: Number(t.created_at || now()),
          last_accessed_at: Number(t.last_accessed_at || now()),
        }))
        .filter((t) => !current.topics.some((ct) => ct.id === t.id))
    : []

  const rawNodes = raw.nodes && typeof raw.nodes === 'object' ? (raw.nodes as Record<string, unknown>) : {}
  const templateNodes = Object.fromEntries(
    Object.values(rawNodes)
      .map(normalizeImportedNode)
      .filter((node): node is LearningNode => node !== null && !current.nodes[node.id])
      .map((node) => [node.id, node]),
  )

  // Clean up orphan references: ensure parent_id and link refs point to existing nodes
  const allNodeIds = new Set([...Object.keys(current.nodes), ...Object.keys(templateNodes)])
  for (const node of Object.values(templateNodes)) {
    if (node.parent_id && !allNodeIds.has(node.parent_id)) {
      node.parent_id = null
    }
    node.links = {
      children_ids: node.links.children_ids.filter((id) => allNodeIds.has(id)),
      related_node_ids: node.links.related_node_ids.filter((id) => allNodeIds.has(id)),
      prerequisite_node_ids: node.links.prerequisite_node_ids.filter((id) => allNodeIds.has(id)),
    }
  }

  return {
    ...current,
    topics: [...current.topics, ...templateTopics],
    nodes: { ...current.nodes, ...templateNodes },
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
