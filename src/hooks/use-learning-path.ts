import { useMemo, useState, useCallback } from 'react'
import type { AppState, PathStep, PathStepReason } from '../types'
import { computeLearningProfile } from '../learning-profile'
import { isReviewDue } from '../spaced-repetition'

// ---------------------------------------------------------------------------
// computeLearningPath — pure function, no React dependency
// ---------------------------------------------------------------------------

function computeLearningPath(state: AppState): PathStep[] {
  const nowMs = Date.now()
  const profile = computeLearningProfile(state)
  const allNodes = Object.values(state.nodes)
  const usedNodeIds = new Set<string>()
  const steps: PathStep[] = []

  // Helper: deduplicate — skip if nodeId already added
  function tryAdd(step: PathStep): void {
    if (usedNodeIds.has(step.nodeId)) return
    usedNodeIds.add(step.nodeId)
    steps.push(step)
  }

  // Helper: build a PathStep from a LearningNode
  function makeStep(
    node: typeof allNodes[number],
    reason: PathStepReason,
    priority: number,
    category: PathStep['category'],
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
    }
  }

  // 1. SRS due nodes (priority 900-1000): nodes where isReviewDue is true
  //    Higher priority for more overdue nodes
  const srsDueNodes = allNodes.filter(
    (n) => isReviewDue(n.mastery.next_review_at, nowMs),
  )
  for (const node of srsDueNodes) {
    const overdue = node.mastery.next_review_at !== undefined
      ? nowMs - node.mastery.next_review_at
      : 0
    // Map overdue to 900-1000: max 30 days overdue => 1000, 0 => 900
    const overdueDays = overdue / 86_400_000
    const priority = Math.min(1000, 900 + Math.round((overdueDays / 30) * 100))
    tryAdd(makeStep(node, 'srs_due', priority, 'review'))
  }

  // 2. Needs review nodes (priority 800-899): check_status === 'needs_review'
  //    that are NOT already in SRS due
  const needsReviewNodes = allNodes.filter(
    (n) => n.mastery.check_status === 'needs_review' && !usedNodeIds.has(n.id),
  )
  for (const node of needsReviewNodes) {
    // Priority based on how long since last check
    const daysSinceCheck = node.mastery.checked_at !== undefined
      ? (nowMs - node.mastery.checked_at) / 86_400_000
      : 0
    const priority = Math.min(899, 800 + Math.round((daysSinceCheck / 30) * 99))
    tryAdd(makeStep(node, 'starred_review', priority, 'review'))
  }

  // 3. Knowledge gaps - unvisited branches (priority 600-699)
  const { unvisited_branches, unexplored_directions } = profile.knowledge_gaps
  for (const nodeId of unvisited_branches) {
    const node = state.nodes[nodeId]
    if (!node) continue
    tryAdd(makeStep(node, 'unvisited_branch', 650, 'gap'))
  }

  // 4. Untested visited nodes (priority 500-599)
  const untestedNodes = allNodes.filter(
    (n) => n.mastery.is_visited && n.mastery.check_status === 'untested' && !usedNodeIds.has(n.id),
  )
  for (const node of untestedNodes) {
    tryAdd(makeStep(node, 'untested', 550, 'strengthen'))
  }

  // 5. Starred review (priority 300-399): starred nodes with check_status !== 'understood'
  const starredNodes = allNodes.filter(
    (n) => n.mastery.is_starred && n.mastery.check_status !== 'understood' && !usedNodeIds.has(n.id),
  )
  for (const node of starredNodes) {
    tryAdd(makeStep(node, 'starred_review', 350, 'review'))
  }

  // 6. Weak confidence (priority 200-299): visited nodes with confidence <= 2
  //    that aren't already categorized
  const weakNodes = allNodes.filter(
    (n) =>
      n.mastery.is_visited &&
      n.mastery.confidence !== undefined &&
      n.mastery.confidence <= 2 &&
      !usedNodeIds.has(n.id),
  )
  for (const node of weakNodes) {
    const priority = 200 + (3 - (node.mastery.confidence ?? 2)) * 30
    tryAdd(makeStep(node, 'weak_confidence', priority, 'strengthen'))
  }

  // 7. Explore directions (priority 100-199): unexplored directions from knowledge gaps
  //    These are tag-level directions; find the first node matching each tag that isn't already used
  for (const direction of unexplored_directions) {
    const matchingNode = allNodes.find(
      (n) => n.tags.includes(direction) && !usedNodeIds.has(n.id),
    )
    if (!matchingNode) continue
    tryAdd(makeStep(matchingNode, 'prerequisite_gap', 150, 'explore'))
  }

  // Sort by priority descending, limit to 20
  steps.sort((a, b) => b.priority - a.priority)
  return steps.slice(0, 20)
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
