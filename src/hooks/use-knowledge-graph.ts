import { useMemo, useState, useCallback } from 'react'
import type { AppState, CheckStatus } from '../types'
import { buildGraphLayout } from '../graph/layout'

type EditMode = 'none' | 'addRelated' | 'addPrerequisite'

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

  // Edit mode: 'none' | 'addRelated' | 'addPrerequisite'
  const [editMode, setEditMode] = useState<EditMode>('none')

  // Node position overrides (user-dragged positions, session-only)
  const [nodePositionOverrides, setNodePositionOverrides] = useState<
    Record<string, { x: number; y: number }>
  >({})

  // Pending link source (first node clicked in link-add mode)
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null)

  // Base graph data computation
  const baseGraphData: KnowledgeGraphData = useMemo(() => {
    if (!state.selectedTopicId) {
      return { nodes: [], edges: [], viewBox: '0 0 400 300', layerCount: 0 }
    }
    return buildGraphLayout(state.nodes, state.selectedTopicId)
  }, [state.nodes, state.selectedTopicId])

  // Apply position overrides to graph data
  const graphData: KnowledgeGraphData = useMemo(() => {
    if (Object.keys(nodePositionOverrides).length === 0) {
      return baseGraphData
    }
    return {
      ...baseGraphData,
      nodes: baseGraphData.nodes.map((n) =>
        nodePositionOverrides[n.id]
          ? { ...n, x: nodePositionOverrides[n.id]!.x, y: nodePositionOverrides[n.id]!.y }
          : n
      ),
    }
  }, [baseGraphData, nodePositionOverrides])

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

  // Set edit mode
  const handleSetEditMode = useCallback((mode: EditMode) => {
    setEditMode((prev) => (prev === mode ? 'none' : mode))
    setLinkSourceId(null)
  }, [])

  // Update node position (for dragging)
  const setNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    setNodePositionOverrides((prev) => ({
      ...prev,
      [nodeId]: { x, y },
    }))
  }, [])

  // Handle node click in edit mode
  const handleEditNodeClick = useCallback((nodeId: string): {
    isSource: boolean
    isTarget: boolean
    linkType: 'related' | 'prerequisite' | null
  } => {
    if (editMode === 'none') return { isSource: false, isTarget: false, linkType: null }

    const linkType = editMode === 'addRelated' ? 'related' : 'prerequisite'

    if (!linkSourceId) {
      setLinkSourceId(nodeId)
      return { isSource: true, isTarget: false, linkType }
    }

    if (linkSourceId === nodeId) {
      // Deselect source
      setLinkSourceId(null)
      return { isSource: false, isTarget: false, linkType: null }
    }

    // Second click: this is the target
    return { isSource: false, isTarget: true, linkType }
  }, [editMode, linkSourceId])

  // Reset position overrides
  const resetLayout = useCallback(() => {
    setNodePositionOverrides({})
  }, [])

  return {
    graphData,
    visibleEdgeTypes,
    toggleEdgeType,
    highlightMastery,
    setHighlightMastery,
    showCrossTopic,
    toggleCrossTopic,
    // New: edit mode
    editMode,
    setEditMode: handleSetEditMode,
    linkSourceId,
    handleEditNodeClick,
    setLinkSourceId,
    // New: node dragging
    nodePositionOverrides,
    setNodePosition,
    resetLayout,
  }
}
