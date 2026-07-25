import { useCallback, useMemo } from 'react'
import type { AppState, LearningRole, SearchResult } from '../types'
import { getNodePath, scoreNode } from '../learning'

interface UseSearchParams {
  state: AppState
}

export function useSearch({ state }: UseSearchParams) {
  const searchResults = useCallback((searchQuery: string, roleFilter: LearningRole | 'all'): SearchResult[] => {
    const query = searchQuery.trim()
    const nodes = Object.values(state.nodes).filter((node) => roleFilter === 'all' || node.learning_role === roleFilter)
    return nodes
      .map((node) => ({
        node,
        score: scoreNode(node, query, state.selectedTopicId),
        path: getNodePath(state.nodes, node.id)
          .map((item) => item.short_title)
          .join(' › '),
        matched: node.one_line_memory || node.answer.summary,
      }))
      .filter((result) => (query ? result.score > 0 : true))
      .sort((a, b) => (query ? b.score - a.score : b.node.last_accessed_at - a.node.last_accessed_at))
      .slice(0, 30)
  }, [state.nodes, state.selectedTopicId])

  const tagCloud = useMemo(() => {
    const counts = new Map<string, number>()
    Object.values(state.nodes)
      .filter((node) => !state.selectedTopicId || node.topic_id === state.selectedTopicId)
      .forEach((node) => {
        node.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1))
      })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
  }, [state.nodes, state.selectedTopicId])

  return {
    searchResults,
    tagCloud,
  }
}
