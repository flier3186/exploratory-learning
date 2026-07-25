import { now } from './utils'
import type { LearningNode, ReviewFilter, ReviewReason } from './types'
import { isReviewDue, isReviewSoon } from './spaced-repetition'

export function getNodePath(nodes: Record<string, LearningNode>, nodeId: string | null) {
  if (!nodeId) return []
  const path: LearningNode[] = []
  let cursor: string | null = nodeId
  const guard = new Set<string>()
  while (cursor && nodes[cursor] && !guard.has(cursor)) {
    guard.add(cursor)
    path.unshift(nodes[cursor])
    cursor = nodes[cursor].parent_id
  }
  return path
}

export function scoreNode(node: LearningNode, query: string, selectedTopicId: string | null) {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  let score = 0
  if (node.short_title.toLowerCase().includes(q)) score += 60
  if (node.tags.some((tag) => tag.toLowerCase().includes(q))) score += 50
  if (node.question.toLowerCase().includes(q)) score += 32
  if (node.answer.summary.toLowerCase().includes(q)) score += 24
  if (node.search_index.text.includes(q)) score += 12
  if (node.topic_id === selectedTopicId) score += 8
  if (node.mastery.is_starred) score += 8
  score += Math.max(0, 6 - Math.floor((now() - node.last_accessed_at) / 86_400_000))
  return score
}

export function getConfidence(node: LearningNode) {
  const value = Number(node.mastery.confidence)
  return [1, 2, 3, 4, 5].includes(value) ? value : undefined
}

export function getReviewReasons(node: LearningNode): ReviewReason[] {
  const reasons: ReviewReason[] = []
  const confidence = getConfidence(node)

  if (node.mastery.review_later) reasons.push('稍后复习')
  if (node.mastery.check_status === 'needs_review') reasons.push('需要复习')
  if (node.mastery.check_status === 'uncertain') reasons.push('还有点虚')
  if (node.mastery.check_status === 'untested') reasons.push('未检测')
  if (confidence !== undefined && confidence <= 3) reasons.push('低掌握度')
  if (node.mastery.is_starred) reasons.push('星标回看')

  return Array.from(new Set(reasons))
}

export function isDueReviewNode(node: LearningNode) {
  const confidence = getConfidence(node)
  return (
    node.mastery.review_later ||
    node.mastery.check_status === 'needs_review' ||
    node.mastery.check_status === 'uncertain' ||
    node.mastery.check_status === 'untested' ||
    confidence === undefined ||
    confidence <= 3 ||
    isReviewDue(node.mastery.next_review_at, now()) ||
    isReviewSoon(node.mastery.next_review_at, now())
  )
}

export function isReviewCandidate(node: LearningNode) {
  return isDueReviewNode(node) || node.mastery.is_starred
}

export function scoreReviewNode(node: LearningNode, selectedTopicId: string | null) {
  const confidence = getConfidence(node)
  let score = 0

  // SRS 间隔复习优先级：到期 > 即将到期
  if (node.mastery.next_review_at && node.mastery.next_review_at <= now()) {
    score += 1200 // 最高优先级
  } else if (node.mastery.next_review_at) {
    const daysUntil = (node.mastery.next_review_at - now()) / 86_400_000
    if (daysUntil <= 1) score += 300 // 明天到期的
  }

  if (node.mastery.review_later) score += 1000
  if (node.mastery.check_status === 'needs_review') score += 900
  if (node.mastery.check_status === 'uncertain') score += 650
  if (node.mastery.check_status === 'untested') score += 420
  score += confidence === undefined ? 360 : (6 - confidence) * 90
  if (node.mastery.is_starred) score += 120
  if (node.topic_id === selectedTopicId) score += 40
  score += Math.min(180, Math.floor((now() - node.last_accessed_at) / 3_600_000))

  return score
}

export function passReviewFilter(node: LearningNode, filter: ReviewFilter, selectedTopicId: string | null) {
  if (filter === 'due') return isDueReviewNode(node)
  if (filter === 'uncertain') return node.mastery.check_status === 'uncertain' || getConfidence(node) === 3
  if (filter === 'starred') return node.mastery.is_starred
  if (filter === 'current-topic') return node.topic_id === selectedTopicId
  return true
}
