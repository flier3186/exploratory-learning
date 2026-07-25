import type { GraphLayoutNode } from './layout'

/**
 * Build an SVG path string for an edge between source and target nodes.
 *
 * Three edge types with different visual styles:
 * - 'child': solid bezier curve, flows downward from parent to child
 * - 'related': dashed line (stroke-dasharray="6 4"), horizontal or slight curve
 * - 'prerequisite': dotted line (stroke-dasharray="2 6"), slight curve
 *
 * For child edges: path goes from source bottom (source.y + 24) to target top (target.y - 24),
 * using a cubic bezier where control points are at the midpoint Y.
 *
 * For related/prerequisite edges connecting nodes at the same layer:
 * use horizontal bezier with control points offset vertically by 30px.
 *
 * For related/prerequisite edges crossing layers:
 * use similar bezier to child edges but with different control point offsets.
 *
 * Returns the 'd' attribute string for an SVG <path> element.
 */
export function buildEdgePath(
  source: GraphLayoutNode,
  target: GraphLayoutNode,
  type: 'child' | 'related' | 'prerequisite',
): string {
  const NODE_HALF = 24

  if (type === 'child') {
    // Source bottom → target top, cubic bezier through midpoint Y
    const x1 = source.x
    const y1 = source.y + NODE_HALF
    const x2 = target.x
    const y2 = target.y - NODE_HALF
    const midY = (y1 + y2) / 2
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
  }

  // related / prerequisite
  const sameLayer = Math.abs(source.y - target.y) < 1

  if (sameLayer) {
    // Horizontal bezier with control points offset vertically by 30px
    const x1 = source.x
    const y1 = source.y
    const x2 = target.x
    const y2 = target.y
    const offset = target.x > source.x ? 30 : -30
    return `M ${x1} ${y1} C ${x1} ${y1 + offset}, ${x2} ${y2 + offset}, ${x2} ${y2}`
  }

  // Cross-layer related / prerequisite
  const x1 = source.x
  const y1 = source.y + NODE_HALF
  const x2 = target.x
  const y2 = target.y - NODE_HALF
  const midY = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
}

export const EDGE_STYLES: Record<
  'child' | 'related' | 'prerequisite',
  { strokeDasharray: string; opacity: number; strokeWidth: number }
> = {
  child: { strokeDasharray: 'none', opacity: 0.7, strokeWidth: 2 },
  related: { strokeDasharray: '6 4', opacity: 0.5, strokeWidth: 1.5 },
  prerequisite: { strokeDasharray: '2 6', opacity: 0.5, strokeWidth: 1.5 },
}
