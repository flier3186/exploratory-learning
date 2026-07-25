/**
 * Sugiyama-style layered layout algorithm for knowledge graph visualization.
 * Pure functions — no React dependencies.
 */

import type { LearningNode, LearningRole, CheckStatus } from '../types'

// ─── Public types ──────────────────────────────────────────────────────────

export interface GraphLayoutNode {
  id: string
  x: number
  y: number
  layer: number
  role: LearningRole
  mastery: { confidence?: 1 | 2 | 3 | 4 | 5; check_status: CheckStatus }
  isStarred: boolean
  isDue: boolean // true if next_review_at is in the past (with 4 h grace)
  shortTitle: string
}

export interface GraphEdge {
  source: string
  target: string
  type: 'child' | 'related' | 'prerequisite'
}

// ─── Constants ─────────────────────────────────────────────────────────────

const NODE_GAP = 90          // horizontal gap between same-layer nodes
const MIN_LAYER_WIDTH = 200  // minimum width of any layer
const LAYER_HEIGHT = 120     // vertical gap between layers
const NODE_RADIUS = 24
const PADDING = 60

// 4-hour grace period (ms) for isDue
const GRACE_MS = 4 * 3600 * 1000

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Truncate a title for display inside a small circle. */
function truncate(str: string, max = 8): string {
  return str.length > max ? str.slice(0, max) + '..' : str
}

// ─── Stage 1: assignLayers ────────────────────────────────────────────────

/**
 * Given a flat map of LearningNode keyed by id, assign each node a layer depth.
 * - Root nodes (parent_id === null) receive layer 0.
 * - Children receive parent.layer + 1.
 * - Orphaned nodes whose parent_id references a missing node fall back to layer 0.
 */
export function assignLayers(
  nodes: Record<string, LearningNode>,
  topicId: string,
): Map<string, number> {
  const layers = new Map<string, number>()
  const filtered = Object.values(nodes).filter((n) => n.topic_id === topicId)

  // First pass: assign known roots (parent_id === null)
  for (const node of filtered) {
    if (node.parent_id === null) {
      layers.set(node.id, 0)
    }
  }

  // Iteratively assign children whose parent already has a layer.
  let changed = true
  let maxIter = filtered.length + 1 // safety bound
  while (changed && maxIter-- > 0) {
    changed = false
    for (const node of filtered) {
      if (layers.has(node.id)) continue
      const parentLayer = layers.get(node.parent_id!)
      if (parentLayer !== undefined) {
        layers.set(node.id, parentLayer + 1)
        changed = true
      }
    }
  }

  // Orphaned nodes: parent_id is non-null but the parent is not in the set.
  for (const node of filtered) {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0)
    }
  }

  return layers
}

// ─── Stage 2: computePositions ────────────────────────────────────────────

/**
 * Compute x,y coordinates for every node based on layer assignments.
 * Nodes on the same layer are distributed evenly.  All layers are
 * centred relative to the widest layer.
 */
export function computePositions(
  layers: Map<string, number>,
): Map<string, { x: number; y: number }> {
  if (layers.size === 0) return new Map()

  const positions = new Map<string, { x: number; y: number }>()

  // Group node ids by layer
  const layerIds = new Map<number, string[]>()
  for (const [id, layer] of layers) {
    let list = layerIds.get(layer)
    if (!list) {
      list = []
      layerIds.set(layer, list)
    }
    list.push(id)
  }

  // Sort layer numbers
  const sortedLayers = Array.from(layerIds.keys()).sort((a, b) => a - b)

  // Compute the width of each layer and the overall max width
  const layerWidths = new Map<number, number>()
  let maxWidth = 0
  for (const l of sortedLayers) {
    const count = layerIds.get(l)!.length
    const width = Math.max(MIN_LAYER_WIDTH, count * NODE_GAP)
    layerWidths.set(l, width)
    if (width > maxWidth) maxWidth = width
  }

  // Place nodes
  for (const l of sortedLayers) {
    const ids = layerIds.get(l)!
    const width = layerWidths.get(l)!
    const offset = (maxWidth - width) / 2 // centre this layer
    for (let i = 0; i < ids.length; i++) {
      const x = offset + (i + 0.5) * NODE_GAP
      const y = PADDING + l * LAYER_HEIGHT + NODE_RADIUS
      positions.set(ids[i], { x, y })
    }
  }

  return positions
}

// ─── Stage 3: reduceCrossings ──────────────────────────────────────────────

/**
 * Barycenter heuristic to reduce edge crossings.
 * Runs 4 iterations, alternating direction (odd = top-down, even = bottom-up).
 * For each node in the current layer, compute its new x as the average x of
 * all adjacent nodes in the neighbouring layer (children or parents).
 */
export function reduceCrossings(
  layers: Map<string, number>,
  positions: Map<string, { x: number; y: number }>,
  edges: GraphEdge[],
  iterations = 4,
): Map<string, { x: number; y: number }> {
  if (layers.size <= 1 || edges.length === 0) return positions

  // Build adjacency maps
  // parentId → Set<childId>
  const childrenOf = new Map<string, Set<string>>()
  // childId → Set<parentId>
  const parentsOf = new Map<string, Set<string>>()

  for (const edge of edges) {
    if (edge.type !== 'child') continue // only tree edges participate
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, new Set())
    if (!parentsOf.has(edge.target)) parentsOf.set(edge.target, new Set())
    childrenOf.get(edge.source)!.add(edge.target)
    parentsOf.get(edge.target)!.add(edge.source)
  }

  // Determine the sorted layers
  const layerIds = new Map<number, string[]>()
  for (const [id, layer] of layers) {
    let list = layerIds.get(layer)
    if (!list) { list = []; layerIds.set(layer, list) }
    list.push(id)
  }
  const sortedLayers = Array.from(layerIds.keys()).sort((a, b) => a - b)

  // Work on a mutable copy
  const mutable = new Map(positions)

  for (let iter = 0; iter < iterations; iter++) {
    const topDown = iter % 2 === 0 // even: top-down; odd: bottom-up
    const layerRange = topDown
      ? sortedLayers.slice(0, -1)     // process layers 0..n-2
      : sortedLayers.slice(1).reverse() // process layers n-1..1

    for (const currentLayer of layerRange) {
      const nodeIds = layerIds.get(currentLayer) ?? []

      for (const nodeId of nodeIds) {
        // Pick adjacent nodes from the neighbour layer
        const neighbours: string[] = topDown
          ? Array.from(childrenOf.get(nodeId) ?? [])
          : Array.from(parentsOf.get(nodeId) ?? [])

        if (neighbours.length === 0) continue

        const neighbourXs = neighbours
          .map((n) => mutable.get(n)?.x)
          .filter((v): v is number => v !== undefined)

        if (neighbourXs.length > 0) {
          const avgX = neighbourXs.reduce((a, b) => a + b, 0) / neighbourXs.length
          mutable.set(nodeId, { x: avgX, y: mutable.get(nodeId)!.y })
        }
      }

      // Re-sort the nodes in this layer by their new x to enforce ordering
      nodeIds.sort((a, b) => (mutable.get(a)?.x ?? 0) - (mutable.get(b)?.x ?? 0))
    }
  }

  return mutable
}

// ─── Stage 4: computeViewBox ──────────────────────────────────────────────

/**
 * Compute an SVG viewBox string that encloses all positioned nodes plus padding.
 * Returns a string like "0 0 800 600".
 */
export function computeViewBox(
  positionedNodes: GraphLayoutNode[],
): string {
  if (positionedNodes.length === 0) {
    return `0 0 ${MIN_LAYER_WIDTH + PADDING * 2} ${LAYER_HEIGHT + PADDING * 2}`
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const node of positionedNodes) {
    const left = node.x - NODE_RADIUS
    const right = node.x + NODE_RADIUS
    const top = node.y - NODE_RADIUS
    const bottom = node.y + NODE_RADIUS
    if (left < minX) minX = left
    if (right > maxX) maxX = right
    if (top < minY) minY = top
    if (bottom > maxY) maxY = bottom
  }

  const width = (maxX - minX) + PADDING * 2
  const height = (maxY - minY) + PADDING * 2
  const x = minX - PADDING
  const y = minY - PADDING

  return `${x} ${y} ${width} ${height}`
}

// ─── Main orchestrator ────────────────────────────────────────────────────

/**
 * Build the complete graph layout for a given topic.
 *
 * 1. Filter nodes by topicId
 * 2. Assign layers (Sugiyama stage 1)
 * 3. Compute initial positions (Sugiyama stage 2)
 * 4. Build edges from node links
 * 5. Reduce crossings (Sugiyama stage 3)
 * 6. Finalise GraphLayoutNode[]
 * 7. Compute viewBox (Sugiyama stage 4)
 */
export function buildGraphLayout(
  nodes: Record<string, LearningNode>,
  topicId: string,
  nowMs?: number,
): { nodes: GraphLayoutNode[]; edges: GraphEdge[]; viewBox: string; layerCount: number } {
  const now = nowMs ?? Date.now()
  const filtered = Object.values(nodes).filter((n) => n.topic_id === topicId)
  const filteredSet = new Set(filtered.map((n) => n.id))

  // Handle empty case
  if (filtered.length === 0) {
    return { nodes: [], edges: [], viewBox: computeViewBox([]), layerCount: 0 }
  }

  // Stage 1: assign layers
  const layers = assignLayers(nodes, topicId)
  const layerCount = Math.max(...Array.from(layers.values())) + 1

  // Stage 2: compute initial positions
  const positions = computePositions(layers)

  // Stage 3a: build edges (only between nodes that exist in our filtered set)
  const edges: GraphEdge[] = []
  for (const node of filtered) {
    // child edges: node → each child
    for (const childId of node.links.children_ids) {
      if (filteredSet.has(childId)) {
        edges.push({ source: node.id, target: childId, type: 'child' })
      }
    }
    // related edges
    for (const relId of node.links.related_node_ids) {
      if (filteredSet.has(relId)) {
        // deduplicate: only add when source < target to avoid double-counting
        if (node.id < relId) {
          edges.push({ source: node.id, target: relId, type: 'related' })
        }
      }
    }
    // prerequisite edges
    for (const prereqId of node.links.prerequisite_node_ids) {
      if (filteredSet.has(prereqId)) {
        edges.push({ source: node.id, target: prereqId, type: 'prerequisite' })
      }
    }
  }

  // Stage 3b: reduce crossings
  const reducedPositions = reduceCrossings(layers, positions, edges)

  // Stage 4: build final GraphLayoutNode[]
  const graphNodes: GraphLayoutNode[] = filtered.map((node) => {
    const pos = reducedPositions.get(node.id) ?? { x: 0, y: 0 }
    const isDue =
      node.mastery.next_review_at !== undefined &&
      node.mastery.next_review_at <= now - GRACE_MS

    return {
      id: node.id,
      x: pos.x,
      y: pos.y,
      layer: layers.get(node.id) ?? 0,
      role: node.learning_role,
      mastery: {
        confidence: node.mastery.confidence,
        check_status: node.mastery.check_status,
      },
      isStarred: node.mastery.is_starred,
      isDue,
      shortTitle: truncate(node.short_title),
    }
  })

  // Stage 5: compute viewBox
  const viewBox = computeViewBox(graphNodes)

  return { nodes: graphNodes, edges, viewBox, layerCount }
}
