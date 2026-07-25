import type {
  AppState,
  LearningNode,
  LearningProfile,
  TopicCompetence,
  CognitiveStyle,
  LearningRhythm,
  KnowledgeGap,
} from './types'
import { LEARNING_PROFILE_VERSION } from './constants'
import { now } from './utils'

// ---------------------------------------------------------------------------
// computeTopicCompetence
// ---------------------------------------------------------------------------

function computeTreeDepth(nodes: Record<string, LearningNode>, topicId: string): number {
  const roots = Object.values(nodes).filter(
    (n) => n.topic_id === topicId && n.parent_id === null,
  )
  let maxDepth = 0
  for (const root of roots) {
    maxDepth = Math.max(maxDepth, subtreeDepth(nodes, root.id, 0))
  }
  return maxDepth
}

function subtreeDepth(
  nodes: Record<string, LearningNode>,
  nodeId: string,
  currentDepth: number,
): number {
  const children = Object.values(nodes).filter(
    (n) => n.parent_id === nodeId,
  )
  if (children.length === 0) return currentDepth + 1
  let maxChild = 0
  for (const child of children) {
    maxChild = Math.max(maxChild, subtreeDepth(nodes, child.id, currentDepth + 1))
  }
  return maxChild
}

function computeTopicCompetence(
  state: AppState,
  topicId: string,
): TopicCompetence {
  const nodes = Object.values(state.nodes).filter(
    (n) => n.topic_id === topicId,
  )
  const visitedNodes = nodes.filter((n) => n.mastery.is_visited)

  // avg_confidence
  const confidentNodes = visitedNodes.filter(
    (n) => n.mastery.confidence !== undefined,
  )
  const avg_confidence =
    confidentNodes.length > 0
      ? confidentNodes.reduce((sum, n) => sum + (n.mastery.confidence ?? 0), 0) /
        confidentNodes.length
      : 0

  // check_pass_rate: understood / visited
  const check_pass_rate =
    visitedNodes.length > 0
      ? visitedNodes.filter((n) => n.mastery.check_status === 'understood').length /
        visitedNodes.length
      : 0

  // depth
  const depth = computeTreeDepth(state.nodes, topicId)

  // weak_roles: group by learning_role, compute pass rate, take lowest 2
  const rolePassRates = new Map<string, { pass: number; total: number }>()
  for (const n of visitedNodes) {
    const role = n.learning_role
    if (!rolePassRates.has(role)) rolePassRates.set(role, { pass: 0, total: 0 })
    const entry = rolePassRates.get(role)!
    entry.total += 1
    if (n.mastery.check_status === 'understood') entry.pass += 1
  }
  const roleRates: Array<{ role: string; rate: number }> = []
  for (const [role, { pass, total }] of rolePassRates) {
    roleRates.push({ role, rate: total > 0 ? pass / total : 1 })
  }
  roleRates.sort((a, b) => a.rate - b.rate)
  const weak_roles = roleRates.slice(0, 2).map((r) => r.role)

  // last_active_at
  const last_active_at =
    nodes.length > 0
      ? Math.max(...nodes.map((n) => n.last_accessed_at))
      : 0

  return {
    topic_id: topicId,
    node_count: nodes.length,
    avg_confidence,
    check_pass_rate,
    depth,
    weak_roles,
    last_active_at,
  }
}

// ---------------------------------------------------------------------------
// computeCognitiveStyle
// ---------------------------------------------------------------------------

function computeCognitiveStyle(state: AppState): CognitiveStyle {
  const allNodes = Object.values(state.nodes)
  const visitedNodes = allNodes.filter((n) => n.mastery.is_visited)

  // intent_pass_rates
  const intentMap = new Map<string, { pass: number; total: number }>()
  for (const n of visitedNodes) {
    for (const check of n.checks) {
      if (!intentMap.has(check.intent)) intentMap.set(check.intent, { pass: 0, total: 0 })
      const entry = intentMap.get(check.intent)!
      entry.total += 1
      if (n.mastery.check_status === 'understood') entry.pass += 1
    }
  }
  const intent_pass_rates: Record<string, number> = {
    recall: 0,
    application: 0,
    boundary: 0,
  }
  for (const [intent, { pass, total }] of intentMap) {
    intent_pass_rates[intent] = total > 0 ? pass / total : 0
  }

  // preferred_followup_types: top 3 from UserPreference
  const topTypes = Object.entries(state.preference.preferred_followup_types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key)

  // content_preference based on followup type distribution
  const pref = state.preference.preferred_followup_types
  const totalPrefCount = Object.values(pref).reduce((s, v) => s + v, 0)
  // Compute the ratio inline
  const exampleWeight =
    (pref['example'] ?? 0) + (pref['application'] ?? 0)
  const mechanismWeight =
    (pref['mechanism'] ?? 0) + (pref['comparison'] ?? 0) + (pref['boundary'] ?? 0)
  const content_preference =
    totalPrefCount === 0
      ? 'balanced'
      : exampleWeight / totalPrefCount > 0.6
        ? 'example_driven'
        : mechanismWeight / totalPrefCount > 0.6
          ? 'mechanism_driven'
          : 'balanced'

  // actual_difficulty: default 3 when no data
  const actual_difficulty = 3

  return {
    intent_pass_rates,
    preferred_followup_types: topTypes,
    content_preference,
    actual_difficulty,
  }
}

// ---------------------------------------------------------------------------
// computeLearningRhythm
// ---------------------------------------------------------------------------

function computeLearningRhythm(state: AppState): LearningRhythm {
  const allNodes = Object.values(state.nodes)
  if (allNodes.length === 0) {
    return {
      avg_nodes_per_session: 0,
      active_days_30: 0,
      avg_session_gap_hours: 0,
      preferred_time_of_day: 'unknown',
    }
  }

  // Sort by created_at for session clustering
  const sorted = [...allNodes].sort((a, b) => a.created_at - b.created_at)

  // Session clustering: gap > 2 hours = new session
  const sessions: number[][] = [[1]] // each entry is node count for a session
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].created_at - sorted[i - 1].created_at
    if (gap > 2 * 3_600_000) {
      sessions.push([1])
    } else {
      sessions[sessions.length - 1]!.push(1)
    }
  }

  // avg_nodes_per_session
  const avg_nodes_per_session =
    sessions.length > 0
      ? sessions.reduce((s, sesh) => s + sesh.length, 0) / sessions.length
      : 0

  // active_days_30 (past 30 days)
  const thirtyDaysAgo = now() - 30 * 86_400_000
  const activeDays = new Set<number>()
  for (const n of allNodes) {
    if (n.created_at >= thirtyDaysAgo) {
      // Round to day
      activeDays.add(Math.floor(n.created_at / 86_400_000))
    }
  }
  const active_days_30 = activeDays.size

  // avg_session_gap_hours
  const sessionStartTimes: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i].created_at - sorted[i - 1].created_at > 2 * 3_600_000) {
      sessionStartTimes.push(sorted[i].created_at)
    }
  }
  const gaps: number[] = []
  for (let i = 1; i < sessionStartTimes.length; i++) {
    gaps.push(sessionStartTimes[i]! - sessionStartTimes[i - 1]!)
  }
  const avg_session_gap_hours =
    gaps.length > 0
      ? gaps.reduce((s, g) => s + g, 0) / gaps.length / 3_600_000
      : 0

  // preferred_time_of_day
  const hourBuckets = new Map<string, number>()
  for (const n of allNodes) {
    const hour = new Date(n.created_at).getHours()
    let slot: string
    if (hour >= 6 && hour < 12) slot = 'morning'
    else if (hour >= 12 && hour < 18) slot = 'afternoon'
    else if (hour >= 18 && hour < 22) slot = 'evening'
    else slot = 'night'
    hourBuckets.set(slot, (hourBuckets.get(slot) ?? 0) + 1)
  }
  let preferred_time_of_day: LearningRhythm['preferred_time_of_day'] = 'unknown'
  let maxCount = 0
  for (const [slot, count] of hourBuckets) {
    if (count > maxCount) {
      maxCount = count
      preferred_time_of_day = slot as LearningRhythm['preferred_time_of_day']
    }
  }

  return {
    avg_nodes_per_session,
    active_days_30,
    avg_session_gap_hours,
    preferred_time_of_day,
  }
}

// ---------------------------------------------------------------------------
// computeKnowledgeGaps
// ---------------------------------------------------------------------------

function computeKnowledgeGaps(state: AppState): KnowledgeGap {
  const allNodes = Object.values(state.nodes)
  const topicIds = [...new Set(allNodes.map((n) => n.topic_id))]

  // missing_prerequisites: tags that appear in other topics but not in current topic's nodes
  const missing_prerequisites: string[] = []
  for (const topicId of topicIds) {
    const currentTags = new Set(
      allNodes.filter((n) => n.topic_id === topicId).flatMap((n) => n.tags),
    )
    const otherTags = new Set(
      allNodes
        .filter((n) => n.topic_id !== topicId)
        .flatMap((n) => n.tags),
    )
    for (const tag of otherTags) {
      if (!currentTags.has(tag)) {
        missing_prerequisites.push(tag)
      }
    }
  }

  // unvisited_branches: nodes with children but themselves never visited
  const unvisited_branches: string[] = []
  for (const node of allNodes) {
    const hasChildren = allNodes.some((n) => n.parent_id === node.id)
    if (hasChildren && !node.mastery.is_visited) {
      unvisited_branches.push(node.id)
    }
  }

  // unexplored_directions: tags that exist in some topics with many nodes,
  // but not in other topics (cross-topic gap)
  const tagTopicMap = new Map<string, Set<string>>()
  for (const n of allNodes) {
    for (const tag of n.tags) {
      if (!tagTopicMap.has(tag)) tagTopicMap.set(tag, new Set())
      tagTopicMap.get(tag)!.add(n.topic_id)
    }
  }
  const unexplored_directions: string[] = []
  for (const [tag, topicSet] of tagTopicMap) {
    // If a tag exists in some topics but not others, those are unexplored directions
    if (topicSet.size > 0 && topicSet.size < topicIds.length) {
      unexplored_directions.push(tag)
    }
  }

  return {
    missing_prerequisites: [...new Set(missing_prerequisites)],
    unvisited_branches,
    unexplored_directions,
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeLearningProfile(state: AppState): LearningProfile {
  const allNodes = Object.values(state.nodes)
  const topicIds = [...new Set(allNodes.map((n) => n.topic_id))]

  // total_study_days: unique days with created_at across all nodes
  const studyDays = new Set<number>()
  for (const n of allNodes) {
    studyDays.add(Math.floor(n.created_at / 86_400_000))
  }

  const topic_competence = topicIds.map((tid) =>
    computeTopicCompetence(state, tid),
  )

  return {
    version: LEARNING_PROFILE_VERSION,
    updated_at: now(),
    total_nodes: allNodes.length,
    total_topics: topicIds.length,
    total_study_days: studyDays.size,
    topic_competence,
    cognitive_style: computeCognitiveStyle(state),
    learning_rhythm: computeLearningRhythm(state),
    knowledge_gaps: computeKnowledgeGaps(state),
  }
}

// ---------------------------------------------------------------------------
// profileSummaryForPrompt — 供 AI prompt 注入
// ---------------------------------------------------------------------------

export function profileSummaryForPrompt(
  profile: LearningProfile,
  topicId: string | null,
): string {
  if (profile.total_nodes < 5) {
    return '用户刚开始使用，暂无足够画像数据，使用默认教学策略。'
  }

  const parts: string[] = []

  // Header
  parts.push(
    `用户学习画像（共 ${profile.total_nodes} 节点，${profile.total_topics} 个领域）：`,
  )

  // Current topic competence
  const currentTopic = topicId
    ? profile.topic_competence.find((tc) => tc.topic_id === topicId)
    : null
  if (currentTopic) {
    const topicLabel = currentTopic.topic_id
    const confidenceStr = currentTopic.avg_confidence.toFixed(1)
    const passRateStr = Math.round(currentTopic.check_pass_rate * 100)
    const weakRolesStr =
      currentTopic.weak_roles.length > 0
        ? `，在"${currentTopic.weak_roles.join('、')}"上较弱`
        : ''
    parts.push(
      `- 当前领域"${topicLabel}"：${currentTopic.node_count} 个节点，平均掌握度 ${confidenceStr}/5，理解检测通过率 ${passRateStr}%${weakRolesStr}`,
    )
  }

  // Cognitive style
  const cs = profile.cognitive_style
  const prefLabel =
    cs.content_preference === 'example_driven'
      ? '偏好处例子学习'
      : cs.content_preference === 'mechanism_driven'
        ? '偏好机制理解'
        : '学习风格均衡'
  const prefPercent = Math.round(
    (cs.preferred_followup_types.length > 0
      ? (Object.values(cs.intent_pass_rates).reduce((s, v) => s + v, 0) /
          Object.keys(cs.intent_pass_rates).length) *
        100
      : 0),
  )
  const stylePart =
    prefPercent > 0
      ? `- 认知风格：${prefLabel}（${prefPercent}%），机制理解能力${prefPercent > 50 ? '较强' : '一般'}`
      : `- 认知风格：${prefLabel}`
  parts.push(stylePart)

  // Weak links from knowledge gaps
  if (profile.knowledge_gaps.unvisited_branches.length > 0) {
    parts.push(
      `- 薄弱环节：${profile.knowledge_gaps.unvisited_branches.length} 个节点分支从未访问，建议追问和检测侧重此方向`,
    )
  }

  // Recommendations based on data
  const recs: string[] = []
  if (cs.content_preference === 'example_driven') {
    recs.push('通俗解释多用类比')
  }
  if (cs.intent_pass_rates.boundary !== undefined && cs.intent_pass_rates.boundary < 0.5) {
    recs.push('检测题侧重边界辨析')
  }
  if (cs.intent_pass_rates.recall !== undefined && cs.intent_pass_rates.recall < 0.5) {
    recs.push('加强主动回忆类检测')
  }
  if (currentTopic && currentTopic.weak_roles.length > 0) {
    recs.push(`追问侧重${currentTopic.weak_roles.slice(0, 2).join('、')}方向`)
  }
  if (recs.length > 0) {
    parts.push(`- 建议调整：${recs.join('，')}`)
  }

  return parts.join('\n')
}
