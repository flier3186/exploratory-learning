/**
 * KnowledgeGraphModal — 知识图谱可视化组件
 *
 * 在暗色模态框中渲染 SVG 知识图谱，支持：
 * - 鼠标滚轮缩放 + 拖拽平移
 * - 触摸双指缩放 + 单指平移
 * - 节点掌握度着色环、角色着色填充、角色缩写文本
 * - 连线样式（实线/虚线/点线）及类型着色
 * - 工具栏：连线类型过滤、掌握度高亮、重置视图
 * - 节点悬浮提示
 * - 点击节点打开详情（onOpenNode）
 * - 选中节点高亮
 * - 空图谱处理
 */
import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { GraphLayoutNode, GraphEdge } from '../graph/layout'
import type { CheckStatus } from '../types'
import { buildEdgePath, EDGE_STYLES } from '../graph/edges'
import {
  MASTERY_COLORS,
  ROLE_COLORS,
  EDGE_COLORS,
  DUE_PULSE_COLOR,
  SELECTED_HIGHLIGHT,
} from '../graph/colors'
import { ROLE_META, CHECK_STATUS_LABEL } from '../constants'

// ─── Types ──────────────────────────────────────────────────────────────

interface KnowledgeGraphModalProps {
  isOpen: boolean
  graphData: {
    nodes: GraphLayoutNode[]
    edges: GraphEdge[]
    viewBox: string
    layerCount: number
  }
  visibleEdgeTypes: Set<'child' | 'related' | 'prerequisite'>
  onToggleEdgeType: (type: 'child' | 'related' | 'prerequisite') => void
  highlightMastery: CheckStatus | null
  onSetHighlightMastery: (status: CheckStatus | null) => void
  selectedNodeId: string | null
  onClose: () => void
  onOpenNode: (nodeId: string) => void
}

interface Transform {
  scale: number
  translateX: number
  translateY: number
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  node: GraphLayoutNode | null
}

// ─── Constants ──────────────────────────────────────────────────────────

const EDGE_TYPE_LABELS: Record<'child' | 'related' | 'prerequisite', string> = {
  child: '层级',
  related: '关联',
  prerequisite: '前置',
}

const CONFIDENCE_LABELS: Record<number, string> = {
  1: '极低',
  2: '较低',
  3: '中等',
  4: '较高',
  5: '很高',
}

const ALL_EDGE_TYPES = ['child', 'related', 'prerequisite'] as const
const ALL_CHECK_STATUSES = ['understood', 'uncertain', 'needs_review', 'untested'] as const

const ZOOM_FACTOR = 1.1
const MIN_SCALE = 0.3
const MAX_SCALE = 3
const NODE_RADIUS = 24 // must match layout.ts NODE_RADIUS
const TARGET_NODE_DIAMETER = 60 // target node diameter in CSS pixels

// ─── Helpers ────────────────────────────────────────────────────────────

/** Parse an SVG viewBox string "x y w h" into its four numeric components. */
function parseViewBox(viewBox: string): [number, number, number, number] {
  const parts = viewBox.trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) {
    return [0, 0, 800, 600]
  }
  return parts as [number, number, number, number]
}

/**
 * Calculate the initial pan/zoom transform so the graph fits the container
 * nicely.  For small graphs (few nodes) we zoom out so nodes do not appear
 * gigantic.  For large graphs we fit everything in view.
 *
 * The SVG viewBox already scales the graph to fill the container.  The
 * transform scale is an additional zoom on top of that.  At scale = 1 the
 * graph exactly fills the container; at scale < 1 it appears smaller with
 * whitespace around it.
 */
function calculateFitToView(
  viewBox: string,
  containerWidth: number,
  containerHeight: number,
): { scale: number; translateX: number; translateY: number } {
  const [vbX, vbY, vbW, vbH] = parseViewBox(viewBox)

  if (vbW === 0 || vbH === 0 || containerWidth === 0 || containerHeight === 0) {
    return { scale: 1, translateX: 0, translateY: 0 }
  }

  // How many CSS pixels does one SVG unit occupy when the graph fills the
  // container (i.e. at transform.scale = 1)?
  const naturalScale = Math.min(containerWidth / vbW, containerHeight / vbH)

  // Actual on-screen node diameter at scale = 1
  const actualNodeDiameter = NODE_RADIUS * 2 * naturalScale

  // Target: nodes should be about TARGET_NODE_DIAMETER px across.
  // If actual size is already smaller (big graph), just fit everything.
  const targetScale =
    actualNodeDiameter > TARGET_NODE_DIAMETER
      ? TARGET_NODE_DIAMETER / actualNodeDiameter
      : 1

  // Clamp to allowed range
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale))

  // Centre the scaled graph in the viewBox.
  // translate(tx, ty) scale(s) →  point = point * s + (tx, ty)
  // We want the centre of the graph to stay at the centre of the viewBox.
  const centerX = vbX + vbW / 2
  const centerY = vbY + vbH / 2
  const translateX = centerX * (1 - scale)
  const translateY = centerY * (1 - scale)

  return { scale, translateX, translateY }
}

// ─── Component ──────────────────────────────────────────────────────────

const KnowledgeGraphModal = memo(function KnowledgeGraphModal(
  props: KnowledgeGraphModalProps,
) {
  const {
    isOpen,
    graphData,
    visibleEdgeTypes,
    onToggleEdgeType,
    highlightMastery,
    onSetHighlightMastery,
    selectedNodeId,
    onClose,
    onOpenNode,
  } = props

  // Pan / Zoom state
  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  })
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  })

  const svgRef = useRef<SVGSVGElement>(null)
  const svgWrapRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  // Touch state for pinch zoom
  const touchStartDistRef = useRef(0)
  const touchStartScaleRef = useRef(1)
  const isTwoFingerTouchRef = useRef(false)

  // ─── Derived data ────────────────────────────────────────────────────

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphLayoutNode>()
    for (const node of graphData.nodes) {
      map.set(node.id, node)
    }
    return map
  }, [graphData.nodes])

  const filteredEdges = useMemo(
    () => graphData.edges.filter((e) => visibleEdgeTypes.has(e.type)),
    [graphData.edges, visibleEdgeTypes],
  )

  const isEmpty = graphData.nodes.length === 0

  // ─── Fit-to-view ──────────────────────────────────────────────────────

  const fitToView = useCallback(() => {
    const wrap = svgWrapRef.current
    if (!wrap || isEmpty) {
      setTransform({ scale: 1, translateX: 0, translateY: 0 })
      return
    }
    const rect = wrap.getBoundingClientRect()
    const result = calculateFitToView(graphData.viewBox, rect.width, rect.height)
    setTransform(result)
  }, [graphData.viewBox, isEmpty])

  // ─── Reset transform when modal opens / graphData changes ────────────

  useEffect(() => {
    if (!isOpen) return
    // Defer to next frame so the DOM is laid out before we measure
    const id = requestAnimationFrame(() => {
      fitToView()
    })
    return () => cancelAnimationFrame(id)
  }, [isOpen, graphData.viewBox, fitToView])

  // ─── Wheel zoom handler ──────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()

    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    // Mouse position relative to SVG element (CSS pixels)
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    setTransform((prev) => {
      const direction = e.deltaY > 0 ? -1 : 1
      const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))

      // Adjust translation so that the point under the cursor stays fixed
      // Formula: newTranslate = mousePos - (mousePos - prevTranslate) * (newScale / prevScale)
      const ratio = newScale / prev.scale
      const newTranslateX = mouseX - (mouseX - prev.translateX) * ratio
      const newTranslateY = mouseY - (mouseY - prev.translateY) * ratio

      return {
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY,
      }
    })
  }, [])

  // ─── Mouse drag pan handlers ─────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Only start pan if clicking on the SVG background or a non-interactive area
    // If clicking a node, don't start panning (let onClick handle it)
    const target = e.target as Element
    if (target.closest('.graph-node')) return

    e.preventDefault()
    isPanningRef.current = true
    lastPosRef.current = { x: e.clientX, y: e.clientY }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isPanningRef.current) return

    const dx = e.clientX - lastPosRef.current.x
    const dy = e.clientY - lastPosRef.current.y
    lastPosRef.current = { x: e.clientX, y: e.clientY }

    setTransform((prev) => ({
      ...prev,
      translateX: prev.translateX + dx,
      translateY: prev.translateY + dy,
    }))
  }, [])

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false
  }, [])

  // ─── Touch handlers for pinch zoom + single finger pan ────────────────

  const getTouchDistance = useCallback((touches: React.TouchList): number => {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }, [])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      if (e.touches.length === 2) {
        isTwoFingerTouchRef.current = true
        touchStartDistRef.current = getTouchDistance(e.touches)
        touchStartScaleRef.current = transform.scale
      } else if (e.touches.length === 1) {
        isTwoFingerTouchRef.current = false
        const touch = e.touches[0]
        isPanningRef.current = true
        lastPosRef.current = { x: touch.clientX, y: touch.clientY }
      }
    },
    [getTouchDistance, transform.scale],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      e.preventDefault()

      if (e.touches.length === 2 && isTwoFingerTouchRef.current) {
        // Pinch zoom
        const dist = getTouchDistance(e.touches)
        if (dist === 0 || touchStartDistRef.current === 0) return

        const newScale = Math.min(
          MAX_SCALE,
          Math.max(
            MIN_SCALE,
            touchStartScaleRef.current * (dist / touchStartDistRef.current),
          ),
        )

        // Zoom towards the center of the two fingers
        const svg = svgRef.current
        if (!svg) return

        const rect = svg.getBoundingClientRect()
        const centerX =
          (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const centerY =
          (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top

        setTransform((prev) => {
          const ratio = newScale / prev.scale
          return {
            scale: newScale,
            translateX: centerX - (centerX - prev.translateX) * ratio,
            translateY: centerY - (centerY - prev.translateY) * ratio,
          }
        })
      } else if (e.touches.length === 1 && !isTwoFingerTouchRef.current) {
        // Single finger pan
        const touch = e.touches[0]
        const dx = touch.clientX - lastPosRef.current.x
        const dy = touch.clientY - lastPosRef.current.y
        lastPosRef.current = { x: touch.clientX, y: touch.clientY }

        setTransform((prev) => ({
          ...prev,
          translateX: prev.translateX + dx,
          translateY: prev.translateY + dy,
        }))
      }
    },
    [getTouchDistance],
  )

  const handleTouchEnd = useCallback(() => {
    isPanningRef.current = false
    isTwoFingerTouchRef.current = false
  }, [])

  // ─── Reset view / zoom to fit ─────────────────────────────────────────

  const resetView = useCallback(() => {
    setTransform({ scale: 1, translateX: 0, translateY: 0 })
  }, [])

  const zoomToFit = useCallback(() => {
    fitToView()
  }, [fitToView])

  // ─── Tooltip handlers ────────────────────────────────────────────────

  const showTooltip = useCallback(
    (e: React.PointerEvent, node: GraphLayoutNode) => {
      const wrap = svgWrapRef.current
      if (!wrap) return

      const rect = wrap.getBoundingClientRect()
      const x = e.clientX - rect.left + 14
      const y = e.clientY - rect.top - 10

      setTooltip({ visible: true, x, y, node })
    },
    [],
  )

  const hideTooltip = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }, [])

  // ─── Render: nothing if modal not open ───────────────────────────────

  if (!isOpen) return null

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="modal-backdrop graph-modal-backdrop" onClick={onClose}>
      <div className="modal graph-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>知识图谱</h2>
          <button onClick={onClose}>关闭</button>
        </div>

        {/* Toolbar */}
        <div className="graph-toolbar">
          <div className="graph-toolbar-group">
            <span className="toolbar-label">连线</span>
            {ALL_EDGE_TYPES.map((type) => (
              <button
                key={type}
                className={visibleEdgeTypes.has(type) ? 'active' : ''}
                onClick={() => onToggleEdgeType(type)}
              >
                {EDGE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="graph-toolbar-group">
            <span className="toolbar-label">掌握度</span>
            <button
              className={highlightMastery === null ? 'active' : ''}
              onClick={() => onSetHighlightMastery(null)}
            >
              全部
            </button>
            {ALL_CHECK_STATUSES.map((status) => (
              <button
                key={status}
                className={highlightMastery === status ? 'active' : ''}
                onClick={() => onSetHighlightMastery(status)}
              >
                {CHECK_STATUS_LABEL[status]}
              </button>
            ))}
          </div>
          <button className="graph-fit-btn" onClick={zoomToFit}>
            适应视图
          </button>
          <button className="graph-reset-btn" onClick={resetView}>
            重置视图
          </button>
        </div>

        {/* SVG graph area */}
        <div className="graph-svg-wrap" ref={svgWrapRef}>
          {isEmpty ? (
            <div className="graph-empty">
              <p>当前主题还没有知识节点。</p>
              <p>添加学习内容后，知识图谱会自动生成。</p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={graphData.viewBox}
              className="graph-svg"
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ touchAction: 'none' }}
            >
              <g
                transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}
              >
                {/* Edges */}
                {filteredEdges.map((edge) => {
                  const source = nodeMap.get(edge.source)
                  const target = nodeMap.get(edge.target)
                  if (!source || !target) return null
                  const style = EDGE_STYLES[edge.type]
                  return (
                    <path
                      key={`${edge.source}-${edge.target}`}
                      d={buildEdgePath(source, target, edge.type)}
                      fill="none"
                      stroke={EDGE_COLORS[edge.type]}
                      strokeDasharray={style.strokeDasharray}
                      opacity={style.opacity}
                      strokeWidth={style.strokeWidth}
                    />
                  )
                })}

                {/* Nodes */}
                {graphData.nodes.map((node) => {
                  const isSelected = node.id === selectedNodeId
                  const isHighlighted =
                    !highlightMastery ||
                    node.mastery.check_status === highlightMastery
                  const roleColor = ROLE_COLORS[node.role]
                  const masteryColor = MASTERY_COLORS[node.mastery.check_status]

                  return (
                    <g
                      key={node.id}
                      className={`graph-node${isSelected ? ' selected' : ''}${!isHighlighted ? ' dimmed' : ''}${node.isDue ? ' due' : ''}`}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenNode(node.id)
                      }}
                      onPointerEnter={(e) => showTooltip(e, node)}
                      onPointerLeave={hideTooltip}
                    >
                      {/* Mastery outer ring */}
                      <circle
                        r="28"
                        fill="none"
                        stroke={masteryColor}
                        strokeWidth="3.5"
                        opacity="0.8"
                      />
                      {/* Role fill circle */}
                      <circle
                        r="24"
                        fill={roleColor}
                        opacity="0.3"
                        stroke={roleColor}
                        strokeWidth="2"
                      />
                      {/* Role abbreviation text (SVG text — short 1-2 char labels) */}
                      <text
                        textAnchor="middle"
                        dy="0.35em"
                        fontSize="11"
                        fill={roleColor}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {ROLE_META[node.role].label}
                      </text>
                      {/* Star indicator */}
                      {node.isStarred && (
                        <text
                          x="16"
                          y="-14"
                          fontSize="10"
                          fill="#e0a020"
                          style={{ pointerEvents: 'none' }}
                        >
                          &#9733;
                        </text>
                      )}
                      {/* SRS due pulse */}
                      {node.isDue && (
                        <circle
                          r="30"
                          fill="none"
                          stroke={DUE_PULSE_COLOR}
                          strokeWidth="1.5"
                          opacity="0.6"
                        >
                          <animate
                            attributeName="r"
                            values="28;34;28"
                            dur="2s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                      {/* Selected highlight ring */}
                      {isSelected && (
                        <circle
                          r="32"
                          fill="none"
                          stroke={SELECTED_HIGHLIGHT}
                          strokeWidth="2"
                          opacity="0.8"
                        />
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          )}

          {/* Tooltip (HTML overlay) */}
          {tooltip.visible && tooltip.node && (
            <div
              className="graph-tooltip"
              style={{
                left: tooltip.x,
                top: tooltip.y,
              }}
            >
              <div className="graph-tooltip-title">
                {tooltip.node.shortTitle}
              </div>
              <div className="graph-tooltip-detail">
                <div>
                  掌握度：{CHECK_STATUS_LABEL[tooltip.node.mastery.check_status]}
                </div>
                {tooltip.node.mastery.confidence !== undefined && (
                  <div>
                    置信度：{tooltip.node.mastery.confidence}/5
                    {CONFIDENCE_LABELS[tooltip.node.mastery.confidence] !== undefined
                      ? `（${CONFIDENCE_LABELS[tooltip.node.mastery.confidence]}）`
                      : ''}
                  </div>
                )}
              </div>
              <div>
                {tooltip.node.isDue && (
                  <span className="graph-tooltip-badge due">待复习</span>
                )}
                {tooltip.node.isStarred && (
                  <span className="graph-tooltip-badge starred">星标</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        {!isEmpty && (
          <div className="graph-legend">
            <div className="legend-section">
              <span className="legend-label">连线类型</span>
              {ALL_EDGE_TYPES.map((type) => (
                <span key={type} className="graph-legend-item">
                  <span
                    className="legend-line"
                    style={{
                      borderTopStyle:
                        type === 'child'
                          ? 'solid'
                          : type === 'related'
                            ? 'dashed'
                            : 'dotted',
                      borderColor: EDGE_COLORS[type],
                    }}
                  />
                  <span>{EDGE_TYPE_LABELS[type]}</span>
                </span>
              ))}
            </div>
            <div className="legend-section">
              <span className="legend-label">掌握度</span>
              {ALL_CHECK_STATUSES.map((status) => (
                <span key={status} className="graph-legend-item">
                  <span
                    className="graph-legend-dot"
                    style={{ background: MASTERY_COLORS[status] }}
                  />
                  <span>{CHECK_STATUS_LABEL[status]}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

export default KnowledgeGraphModal
