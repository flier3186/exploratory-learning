import { useMemo, useState, useCallback } from 'react'
import type { AppState, CheckStatus } from '../types'
import { buildGraphLayout } from '../graph/layout'

interface KnowledgeGraphData {
  nodes: import('../graph/layout').GraphLayoutNode[]
  edges: import('../graph/layout').GraphEdge[]
  viewBox: string
  layerCount: number
}

export function useKnowledgeGraph({ state }: { state: AppState }) {
  // Filter state
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<'child' | 'related' | 'prerequisite'>>(
    new Set(['child', 'related', 'prerequisite'])
  )
  const [highlightMastery, setHighlightMastery] = useState<CheckStatus | null>(null)
  const [showCrossTopic, setShowCrossTopic] = useState(false)

  // Main graph data computation
  const graphData: KnowledgeGraphData = useMemo(() => {
    if (!state.selectedTopicId) {
      return { nodes: [], edges: [], viewBox: '0 0 400 300', layerCount: 0 }
    }
    return buildGraphLayout(state.nodes, state.selectedTopicId)
  }, [state.nodes, state.selectedTopicId])

  // Toggle edge type visibility
  const toggleEdgeType = useCallback((type: 'child' | 'related' | 'prerequisite') => {
    setVisibleEdgeTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        if (next.size > 1) next.delete(type) // keep at least one
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  // Toggle cross-topic mode
  const toggleCrossTopic = useCallback(() => {
    setShowCrossTopic((prev) => !prev)
  }, [])

  return {
    graphData,
    visibleEdgeTypes,
    toggleEdgeType,
    highlightMastery,
    setHighlightMastery,
    showCrossTopic,
    toggleCrossTopic,
  }
}
