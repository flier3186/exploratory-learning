import { useMemo, useState, useCallback } from 'react'
import type { AppState, PathStep, PathStepReason, LearningNode } from '../types'
import { computeLearningProfile } from '../learning-profile'
import { isReviewDue } from '../spaced-repetition'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000
const MAX_STEPS = 20
const MAX_PER_CATEGORY = 8 // 保证推荐多样性，每类别最多 8 个

// ---------------------------------------------------------------------------
// computeLearningPath — pure function, no React dependency
// ---------------------------------------------------------------------------

function computeLearningPath(state: AppState): PathStep[] {
  const nowMs = Date.now()
  const profile = computeLearningProfile(state)
  const allNodes = Object.values(state.nodes)
  const usedNodeIds = new Set<string>()
  const steps: PathStep[] = []
  const categoryCount: Record<PathStep['category'], number> = {
    review: 0,
    gap: 0,
    explore: 0,
    strengthen: 0,
  }

  // Helper: deduplicate + category cap — skip if nodeId already added or category full
  function tryAdd(step: PathStep): void {
    if (usedNodeIds.has(step.nodeId)) return
    if (categoryCount[step.category] >= MAX_PER_CATEGORY) return
    usedNodeIds.add(step.nodeId)
    categoryCount[step.category]++
    steps.push(step)
  }

  // Helper: build a PathStep from a LearningNode
  function makeStep(
    node: LearningNode,
    reason: PathStepReason,
    priority: number,
    category: PathStep['category'],
    reasonDetail: string,
    estimatedGain: number,
  ): PathStep {
    return {
      id: `${node.id}-${reason}`,
      nodeId: node.id,
      reason,
      priority,
      category,
      topicId: node.topic_id,
      shortTitle: node.short_title,
      role: node.learning_role,
      currentMastery: node.mastery.check_status,
      confidence: node.mastery.confidence,
      nextReviewAt: node.mastery.next_review_at,
      reasonDetail,
      estimatedGain,
    }
  }

  // ── 1. SRS due nodes (priority 900-1000) ──────────────────────────────
  //    Higher priority for more overdue nodes.
  //    Combo boost: SRS到期 + 置信度低 → 额外加分
  const srsDueNodes = allNodes.filter(
    (n) => isReviewDue(n.mastery.next_review_at, nowMs),
  )
  for (const node of srsDueNodes) {
    const overdue = node.mastery.next_review_at !== undefined
      ? nowMs - node.mastery.next_review_at
      : 0
    const overdueDays = overdue / DAY_MS
    let priority = Math.min(1000, 900 + Math.round((overdueDays / 30) * 100))

    // Combo boost: SRS到期且置信度 <= 2 → 额外 +30
    let reasonDetail = `SRS 间隔复习已到期`
    let estimatedGain = 60
    if (node.mastery.confidence !== undefined && node.mastery.confidence <= 2) {
      priority = Math.min(1000, priority + 30)
      reasonDetail = `SRS 到期且掌握度较低（L${node.mastery.confidence}），急需巩固`
      estimatedGain = 80
    } else if (overdueDays > 7) {
      reasonDetail = `已过期 ${Math.floor(overdueDays)} 天，记忆可能已衰退`
      estimatedGain = 75
    }

    tryAdd(makeStep(node, 'srs_due', priority, 'review', reasonDetail, estimatedGain))
  }

  // ── 2. Needs review nodes (priority 800-899) ──────────────────────────
  //    check_status === 'needs_review' that are NOT already in SRS due
  const needsReviewNodes = allNodes.filter(
    (n) => n.mastery.check_status === 'needs_review' && !usedNodeIds.has(n.id),
  )
  for (const node of needsReviewNodes) {
    const daysSinceCheck = node.mastery.checked_at !== undefined
      ? (nowMs - node.mastery.checked_at) / DAY_MS
      : 0
    const priority = Math.min(899, 800 + Math.round((daysSinceCheck / 30) * 99))
    const reasonDetail = daysSinceCheck > 7
      ? `标记为"需要复习"已 ${Math.floor(daysSinceCheck)} 天`
      : `标记为"需要复习"，建议重新检测`
    tryAdd(makeStep(node, 'starred_review', priority, 'review', reasonDetail, 55))
  }

  // ── 3. Prerequisite gap detection (priority 700-799) ──────────────────
  //    改进：基于实际的 prerequisite_node_ids 检测前置节点是否已掌握
  //    如果节点的前置节点未掌握（check_status !== 'understood'），则该节点是盲区
  for (const node of allNodes) {
    if (usedNodeIds.has(node.id)) continue
    if (node.links.prerequisite_node_ids.length === 0) continue

    const unmasteredPrereqs = node.links.prerequisite_node_ids.filter((pid) => {
      const prereq = state.nodes[pid]
      if (!prereq) return false
      return prereq.mastery.check_status !== 'understood'
    })

    if (unmasteredPrereqs.length > 0) {
      const prereqNode = state.nodes[unmasteredPrereqs[0]!]
      const prereqTitle = prereqNode?.short_title ?? '未知'
      const priority = 700 + unmasteredPrereqs.length * 20
      const reasonDetail = `前置概念"${prereqTitle}"尚未掌握，建议先补齐`
      tryAdd(makeStep(node, 'prerequisite_gap', priority, 'gap', reasonDetail, 70))
    }
  }

  // ── 4. Unvisited branches (priority 600-699) ──────────────────────────
  const { unvisited_branches, unexplored_directions } = profile.knowledge_gaps
  for (const nodeId of unvisited_branches) {
    const node = state.nodes[nodeId]
    if (!node || usedNodeIds.has(node.id)) continue
    const childCount = node.links.children_ids.length
    const reasonDetail = `该分支有 ${childCount} 个子节点但从未访问`
    tryAdd(makeStep(node, 'unvisited_branch', 650, 'gap', reasonDetail, 65))
  }

  // ── 5. Role imbalance detection (priority 550-649) ────────────────────
  //    基于学习画像的 weak_roles，推荐该角色下置信度低或未检测的节点
  const weakRoleSet = new Set<string>()
  for (const tc of profile.topic_competence) {
    for (const role of tc.weak_roles) {
      weakRoleSet.add(role)
    }
  }
  const roleImbalanceNodes = allNodes.filter(
    (n) =>
      weakRoleSet.has(n.learning_role) &&
      n.mastery.check_status !== 'understood' &&
      !usedNodeIds.has(n.id),
  )
  for (const node of roleImbalanceNodes) {
    const priority = 550 + (node.mastery.confidence ? (6 - node.mastery.confidence) * 10 : 50)
    const reasonDetail = `学习角色"${node.learning_role}"是你的薄弱方向，建议加强`
    tryAdd(makeStep(node, 'role_imbalance', priority, 'strengthen', reasonDetail, 60))
  }

  // ── 6. Untested visited nodes (priority 500-549) ──────────────────────
  const untestedNodes = allNodes.filter(
    (n) => n.mastery.is_visited && n.mastery.check_status === 'untested' && !usedNodeIds.has(n.id),
  )
  for (const node of untestedNodes) {
    const reasonDetail = `已访问但从未检测理解程度`
    tryAdd(makeStep(node, 'untested', 520, 'strengthen', reasonDetail, 50))
  }

  // ── 7. Starred review (priority 300-399) ──────────────────────────────
  const starredNodes = allNodes.filter(
    (n) => n.mastery.is_starred && n.mastery.check_status !== 'understood' && !usedNodeIds.has(n.id),
  )
  for (const node of starredNodes) {
    const reasonDetail = `星标节点，尚未完全掌握`
    tryAdd(makeStep(node, 'starred_review', 350, 'review', reasonDetail, 45))
  }

  // ── 8. Weak confidence (priority 200-299) ─────────────────────────────
  const weakNodes = allNodes.filter(
    (n) =>
      n.mastery.is_visited &&
      n.mastery.confidence !== undefined &&
      n.mastery.confidence <= 2 &&
      !usedNodeIds.has(n.id),
  )
  for (const node of weakNodes) {
    const priority = 200 + (3 - (node.mastery.confidence ?? 2)) * 30
    const reasonDetail = `掌握度仅 L${node.mastery.confidence}，建议重新学习`
    tryAdd(makeStep(node, 'weak_confidence', priority, 'strengthen', reasonDetail, 55))
  }

  // ── 9. Explore directions (priority 100-199) ──────────────────────────
  //    高相关但从未追问的方向（基于标签关联但无对应节点）
  for (const direction of unexplored_directions) {
    const matchingNode = allNodes.find(
      (n) => n.tags.includes(direction) && !usedNodeIds.has(n.id),
    )
    if (!matchingNode) continue
    const reasonDetail = `标签"${direction}"在其他领域出现但当前领域未探索`
    tryAdd(makeStep(matchingNode, 'prerequisite_gap', 150, 'explore', reasonDetail, 40))
  }

  // Sort by priority descending, limit to MAX_STEPS
  steps.sort((a, b) => b.priority - a.priority)
  return steps.slice(0, MAX_STEPS)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLearningPath({ state }: { state: AppState }): {
  pathSteps: PathStep[]
  categoryFilter: PathStep['category'] | 'all'
  setCategoryFilter: (f: PathStep['category'] | 'all') => void
  filteredSteps: PathStep[]
  categoryCounts: Record<PathStep['category'], number>
} {
  const [categoryFilter, setCategoryFilter] = useState<PathStep['category'] | 'all'>('all')

  const pathSteps = useMemo(() => computeLearningPath(state), [state])

  const categoryCounts = useMemo(() => {
    const counts: Record<PathStep['category'], number> = {
      review: 0,
      gap: 0,
      explore: 0,
      strengthen: 0,
    }
    for (const step of pathSteps) {
      counts[step.category]++
    }
    return counts
  }, [pathSteps])

  const filteredSteps = useMemo(() => {
    if (categoryFilter === 'all') return pathSteps
    return pathSteps.filter((s) => s.category === categoryFilter)
  }, [pathSteps, categoryFilter])

  const handleSetCategoryFilter = useCallback((f: PathStep['category'] | 'all') => {
    setCategoryFilter(f)
  }, [])

  return {
    pathSteps,
    categoryFilter,
    setCategoryFilter: handleSetCategoryFilter,
    filteredSteps,
    categoryCounts,
  }
}
