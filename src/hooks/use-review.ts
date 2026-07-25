import { useCallback, useMemo } from 'react'
import type { AppState, ReviewFilter, ReviewResult } from '../types'
import { getNodePath, getReviewReasons, isDueReviewNode, isReviewCandidate, passReviewFilter, scoreReviewNode } from '../learning'
import { isReviewDue } from '../spaced-repetition'

interface UseReviewParams {
  state: AppState
}

export function useReview({ state }: UseReviewParams) {
  const dueReviewCount = useMemo(
    () => Object.values(state.nodes).filter(isDueReviewNode).length,
    [state.nodes],
  )

  const currentTopicReviewCount = useMemo(
    () => Object.values(state.nodes).filter((node) => node.topic_id === state.selectedTopicId && isDueReviewNode(node)).length,
    [state.nodes, state.selectedTopicId],
  )

  const starredReviewCount = useMemo(
    () => Object.values(state.nodes).filter((node) => node.mastery.is_starred).length,
    [state.nodes],
  )

  const reviewResults = useCallback((reviewFilter: ReviewFilter): ReviewResult[] => {
    return Object.values(state.nodes)
      .filter(isReviewCandidate)
      .filter((node) => passReviewFilter(node, reviewFilter, state.selectedTopicId))
      .map((node) => ({
        node,
        score: scoreReviewNode(node, state.selectedTopicId),
        path: getNodePath(state.nodes, node.id)
          .map((item) => item.short_title)
          .join(' › '),
        reasons: getReviewReasons(node),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.node.last_accessed_at - b.node.last_accessed_at
      })
      .slice(0, 40)
  }, [state.nodes, state.selectedTopicId])

  // SRS 到期节点（基于 next_review_at 精确计算）
  const srsDueNodes = useMemo(
    () => Object.values(state.nodes).filter(
      (node) => node.mastery.is_visited && isReviewDue(node.mastery.next_review_at, Date.now()),
    ),
    [state.nodes],
  )

  const srsDueCount = srsDueNodes.length

  return {
    dueReviewCount,
    currentTopicReviewCount,
    starredReviewCount,
    reviewResults,
    srsDueCount,
    srsDueNodes,
  }
}
