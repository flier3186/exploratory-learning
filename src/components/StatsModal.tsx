import { useMemo } from 'react'
import { CHECK_STATUS_LABEL, ROLE_META } from '../constants'
import type { CheckStatus, HeatmapDay, LearningNode, LearningProfile, LearningRole, SRSWeekDay, Topic, TopicCompetence } from '../types'
import { Modal } from './Modal'
import { startOfDay, DAY_MS } from '../utils'

const SEVEN_DAYS_MS = 7 * DAY_MS

const CHECK_STATUS_ORDER: CheckStatus[] = ['understood', 'uncertain', 'needs_review', 'untested']

const STATUS_COLORS: Record<CheckStatus, string> = {
  understood: '#3f8d70',
  uncertain: '#b8751a',
  needs_review: '#b84040',
  untested: '#a2917c',
}

const ROLE_ORDER: LearningRole[] = [
  'foundation',
  'mechanism',
  'application',
  'comparison',
  'boundary',
  'practice',
  'review',
]

const ROLE_BAR_COLORS: Record<LearningRole, string> = {
  root: '#e0a020',
  foundation: '#3f8d70',
  mechanism: '#4f69b6',
  application: '#2a8db8',
  comparison: '#8e5db8',
  boundary: '#b84040',
  practice: '#c9931e',
  review: '#7d6d58',
}

const CONFIDENCE_COLORS = ['#b84040', '#c47a30', '#b8751a', '#7da850', '#3f8d70']

// ---------------------------------------------------------------------------
// RadarChart (inline sub-component)
// ---------------------------------------------------------------------------

function RadarChart({ topics }: { topics: TopicCompetence[] }) {
  const n = topics.length
  const cx = 150
  const cy = 150
  const radius = 100

  // Compute vertices for a given fraction of the radius
  function polygonPoints(fraction: number): string {
    return topics
      .map((_, i) => {
        const angle = (2 * Math.PI / n) * i - Math.PI / 2
        const x = cx + radius * fraction * Math.cos(angle)
        const y = cy + radius * fraction * Math.sin(angle)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }

  const dataPolygon = topics
    .map((t, i) => {
      const angle = (2 * Math.PI / n) * i - Math.PI / 2
      const fraction = Math.min(t.avg_confidence / 5, 1)
      const x = cx + radius * fraction * Math.cos(angle)
      const y = cy + radius * fraction * Math.sin(angle)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const labelPositions = topics.map((t, i) => {
    const angle = (2 * Math.PI / n) * i - Math.PI / 2
    const labelRadius = radius + 22
    const x = cx + labelRadius * Math.cos(angle)
    const y = cy + labelRadius * Math.sin(angle)
    return { x, y, label: t.topic_id, confidence: t.avg_confidence.toFixed(1) }
  })

  return (
    <svg viewBox="0 0 300 300" className="radar-svg" role="img" aria-label="领域掌握雷达图">
      {/* Guide polygons at 25%, 50%, 75%, 100% */}
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <polygon
          key={fraction}
          points={polygonPoints(fraction)}
          fill="none"
          stroke="rgba(91, 64, 35, 0.15)"
          strokeWidth={0.5}
        />
      ))}
      {/* Axis lines from center to each vertex */}
      {topics.map((_, i) => {
        const angle = (2 * Math.PI / n) * i - Math.PI / 2
        const x = cx + radius * Math.cos(angle)
        const y = cy + radius * Math.sin(angle)
        return (
          <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(91, 64, 35, 0.12)" strokeWidth={0.5} />
        )
      })}
      {/* Data polygon */}
      <polygon
        points={dataPolygon}
        fill="rgba(13, 148, 136, 0.2)"
        stroke="#0d9488"
        strokeWidth={1.5}
      />
      {/* Data points */}
      {topics.map((t, i) => {
        const angle = (2 * Math.PI / n) * i - Math.PI / 2
        const fraction = Math.min(t.avg_confidence / 5, 1)
        const x = cx + radius * fraction * Math.cos(angle)
        const y = cy + radius * fraction * Math.sin(angle)
        return <circle key={i} cx={x} cy={y} r={3} fill="#0d9488" />
      })}
      {/* Labels */}
      {labelPositions.map((pos, i) => (
        <text
          key={i}
          x={pos.x}
          y={pos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="10"
          fill="#7d6d58"
        >
          {pos.label} ({pos.confidence})
        </text>
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// TrendLine (inline sub-component)
// ---------------------------------------------------------------------------

function TrendLine({ nodes }: { nodes: LearningNode[] }) {
  const { points, labels, maxCount } = useMemo(() => {
    const now = Date.now()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const dayMs = 24 * 60 * 60 * 1000

    // Cumulative counts per day over last 30 days
    const dayCounts: { date: string; cumulative: number }[] = []
    let cumulative = 0

    for (let i = 29; i >= 0; i--) {
      const dayTs = todayStart.getTime() - i * dayMs
      const nextDayStart = dayTs + dayMs

      // Count nodes created on this day
      const count = nodes.filter(
        (n) => n.created_at >= dayTs && n.created_at < nextDayStart,
      ).length
      cumulative += count

      const d = new Date(dayTs)
      const label = `${d.getMonth() + 1}/${d.getDate()}`
      dayCounts.push({ date: label, cumulative })
    }

    const max = Math.max(1, ...dayCounts.map((d) => d.cumulative))
    const chartW = 260
    const chartH = 80
    const padLeft = 30
    const padTop = 10

    const pts = dayCounts.map((d, idx) => {
      const x = padLeft + (idx / (dayCounts.length - 1)) * chartW
      const y = padTop + chartH - (d.cumulative / max) * chartH
      return { x: x.toFixed(1), y: y.toFixed(1) }
    })

    const xLabelPositions = dayCounts
      .filter((_, idx) => idx % 5 === 0 || idx === dayCounts.length - 1)
      .map((_, filterIdx, filteredArr) => {
        const origIdx = filterIdx === filteredArr.length - 1
          ? dayCounts.length - 1
          : filterIdx * 5
        const x = padLeft + (origIdx / (dayCounts.length - 1)) * chartW
        return { x, label: dayCounts[origIdx]!.date }
      })

    return {
      points: pts.map((p) => `${p.x},${p.y}`).join(' '),
      labels: xLabelPositions,
      maxCount: max,
    }
  }, [nodes])

  return (
    <svg viewBox="0 0 300 120" className="trend-svg" role="img" aria-label="30 天学习趋势">
      {/* Gradient for area fill */}
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b8751a" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#b8751a" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      <line x1={30} y1={10} x2={30} y2={90} stroke="rgba(91, 64, 35, 0.1)" strokeWidth={0.5} />
      <line x1={30} y1={90} x2={290} y2={90} stroke="rgba(91, 64, 35, 0.16)" strokeWidth={0.5} />
      {/* Y-axis labels */}
      <text x={26} y={14} textAnchor="end" fontSize="7" fill="#a2917c">{maxCount}</text>
      <text x={26} y={52} textAnchor="end" fontSize="7" fill="#a2917c">{Math.round(maxCount / 2)}</text>
      <text x={26} y={93} textAnchor="end" fontSize="7" fill="#a2917c">0</text>
      {/* Area fill */}
      {points && (
        <polygon
          points={`30,90 ${points} 290,90`}
          fill="url(#trendGrad)"
        />
      )}
      {/* Line */}
      {points && (
        <polyline
          points={points}
          fill="none"
          stroke="#b8751a"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {/* X-axis labels */}
      {labels.map((lbl, i) => (
        <text key={i} x={lbl.x} y={105} textAnchor="middle" fontSize="7" fill="#a2917c">
          {lbl.label}
        </text>
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// EfficiencyTrendLine (inline sub-component)
// ---------------------------------------------------------------------------

function EfficiencyTrendLine({ weeklyData }: {
  weeklyData: { weekLabel: string; passRate: number; checkedCount: number }[]
}) {
  const chartW = 260
  const chartH = 80
  const padLeft = 30
  const padTop = 10

  const points = weeklyData.map((d, idx) => {
    const x = padLeft + (idx / (weeklyData.length - 1)) * chartW
    const y = padTop + chartH - d.passRate * chartH
    return { x: x.toFixed(1), y: y.toFixed(1), ...d }
  })

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <svg viewBox="0 0 300 120" className="efficiency-svg" role="img" aria-label="学习效率趋势">
      <defs>
        <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f8d70" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#3f8d70" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      <line x1={30} y1={10} x2={30} y2={90} stroke="rgba(91, 64, 35, 0.1)" strokeWidth={0.5} />
      <line x1={30} y1={90} x2={290} y2={90} stroke="rgba(91, 64, 35, 0.16)" strokeWidth={0.5} />
      <line x1={30} y1={50} x2={290} y2={50} stroke="rgba(91, 64, 35, 0.08)" strokeWidth={0.5} strokeDasharray="2,2" />
      {/* Y-axis labels */}
      <text x={26} y={14} textAnchor="end" fontSize="7" fill="#a2917c">100%</text>
      <text x={26} y={53} textAnchor="end" fontSize="7" fill="#a2917c">50%</text>
      <text x={26} y={93} textAnchor="end" fontSize="7" fill="#a2917c">0%</text>
      {/* Area fill */}
      {linePoints && (
        <polygon points={`30,90 ${linePoints} 290,90`} fill="url(#effGrad)" />
      )}
      {/* Line */}
      {linePoints && (
        <polyline
          points={linePoints}
          fill="none"
          stroke="#3f8d70"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {/* Data points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={2.5} fill="#3f8d70" />
          {p.checkedCount > 0 && (
            <text x={p.x} y={parseInt(p.y) - 5} textAnchor="middle" fontSize="6" fill="#3f8d70">
              {Math.round(p.passRate * 100)}%
            </text>
          )}
        </g>
      ))}
      {/* X-axis labels */}
      {points.map((p, i) => (
        (i % 2 === 0 || i === points.length - 1) && (
          <text key={`lbl-${i}`} x={p.x} y={105} textAnchor="middle" fontSize="7" fill="#a2917c">
            {p.weekLabel}
          </text>
        )
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// StatsModal
// ---------------------------------------------------------------------------

export function StatsModal(props: {
  nodes: Record<string, LearningNode>
  topics: Topic[]
  dueReviewCount: number
  profile: LearningProfile
  heatmap: HeatmapDay[]
  currentStreak: number
  longestStreak: number
  totalActiveDays: number
  srsWeek: SRSWeekDay[]
  onClose: () => void
}) {
  const { nodes, topics, dueReviewCount, profile, heatmap, currentStreak, longestStreak, totalActiveDays, srsWeek, onClose } = props

  const stats = useMemo(() => {
    const nodeList = Object.values(nodes)
    const totalNodes = nodeList.length
    const starredCount = nodeList.filter((n) => n.mastery.is_starred).length

    // 1. Mastery distribution
    const masteryCount: Record<CheckStatus, number> = {
      understood: 0,
      uncertain: 0,
      needs_review: 0,
      untested: 0,
    }
    for (const n of nodeList) {
      masteryCount[n.mastery.check_status]++
    }

    // 2. Confidence distribution (levels 1-5)
    const confidenceBuckets = [0, 0, 0, 0, 0]
    for (const n of nodeList) {
      const c = n.mastery.confidence
      if (c !== undefined && c >= 1 && c <= 5) {
        confidenceBuckets[c - 1]++
      }
    }
    const ratedConfidenceCount = confidenceBuckets.reduce((a, b) => a + b, 0)
    const maxConfidenceCount = Math.max(1, ...confidenceBuckets)

    // 3. Role distribution
    const roleCount: Record<string, number> = {}
    for (const n of nodeList) {
      roleCount[n.learning_role] = (roleCount[n.learning_role] || 0) + 1
    }
    const maxRoleCount = Math.max(1, ...ROLE_ORDER.map((r) => roleCount[r] || 0))

    // 4. Knowledge tree depth — traverse parent_id chains with memoisation
    const depthCache = new Map<string, number>()
    const computeDepth = (nodeId: string): number => {
      if (depthCache.has(nodeId)) return depthCache.get(nodeId)!
      const chain: string[] = []
      const guard = new Set<string>()
      let cursor: string | null = nodeId
      while (cursor !== null && nodes[cursor] && !guard.has(cursor) && !depthCache.has(cursor)) {
        guard.add(cursor)
        chain.push(cursor)
        cursor = nodes[cursor].parent_id
      }
      let baseDepth = 0
      if (cursor !== null && nodes[cursor] && depthCache.has(cursor) && !guard.has(cursor)) {
        baseDepth = depthCache.get(cursor)! + 1
      }
      for (let i = 0; i < chain.length; i++) {
        depthCache.set(chain[chain.length - 1 - i], baseDepth + i)
      }
      return depthCache.get(nodeId)!
    }

    let maxDepth = 0
    let depthSum = 0
    for (const n of nodeList) {
      const d = computeDepth(n.id)
      if (d > maxDepth) maxDepth = d
      depthSum += d
    }
    const avgDepth = totalNodes ? depthSum / totalNodes : 0

    // 5. Recent activity — group nodes by created_at date (last 7 days)
    const nowTs = Date.now()
    const weekAgo = nowTs - SEVEN_DAYS_MS
    const recentNodes = nodeList.filter((n) => n.created_at >= weekAgo)
    const sparkBuckets = [0, 0, 0, 0, 0, 0, 0]
    const todayStart = startOfDay(nowTs)
    for (const n of recentNodes) {
      const dayDiff = Math.floor((todayStart - startOfDay(n.created_at)) / DAY_MS)
      if (dayDiff >= 0 && dayDiff < 7) {
        sparkBuckets[6 - dayDiff]++
      }
    }
    const maxSpark = Math.max(1, ...sparkBuckets)

    // 6. Top tags
    const tagCount: Record<string, number> = {}
    for (const n of nodeList) {
      for (const tag of n.tags) {
        tagCount[tag] = (tagCount[tag] || 0) + 1
      }
    }
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)

    // 7. Weekly efficiency trend (last 8 weeks)
    //    For each week, compute the pass rate of understanding checks
    const weeklyEfficiency: { weekLabel: string; passRate: number; checkedCount: number }[] = []
    const weekMs = 7 * DAY_MS
    for (let w = 7; w >= 0; w--) {
      const weekStart = nowTs - (w + 1) * weekMs
      const weekEnd = nowTs - w * weekMs
      const weekNodes = nodeList.filter(
        (n) => n.mastery.checked_at !== undefined &&
          n.mastery.checked_at >= weekStart &&
          n.mastery.checked_at < weekEnd,
      )
      const checkedCount = weekNodes.length
      const passedCount = weekNodes.filter((n) => n.mastery.check_status === 'understood').length
      const passRate = checkedCount > 0 ? passedCount / checkedCount : 0
      const d = new Date(weekEnd)
      weeklyEfficiency.push({
        weekLabel: `${d.getMonth() + 1}/${d.getDate()}`,
        passRate,
        checkedCount,
      })
    }

    // 8. SRS completion rate: nodes that are due (next_review_at <= now) and have been checked
    const srsDueNodes = nodeList.filter(
      (n) => n.mastery.next_review_at !== undefined && n.mastery.next_review_at <= nowTs,
    )
    const srsCheckedCount = srsDueNodes.filter(
      (n) => n.mastery.check_status !== 'untested',
    ).length
    const srsCompletionRate = srsDueNodes.length > 0 ? srsCheckedCount / srsDueNodes.length : 0

    // 9. Retention estimate: based on SRS interval and confidence
    //    R = exp(-t / S) where t = days since last review, S = stability estimate
    //    Stability ≈ srs_interval * (confidence / 3) (simplified)
    const retentionNodes = nodeList.filter(
      (n) => n.mastery.is_visited && n.mastery.srs_interval !== undefined,
    )
    let totalRetention = 0
    let retentionCount = 0
    for (const n of retentionNodes) {
      const daysSinceReview = n.mastery.checked_at !== undefined
        ? (nowTs - n.mastery.checked_at) / DAY_MS
        : 0
      const stability = Math.max(1, (n.mastery.srs_interval ?? 1) * ((n.mastery.confidence ?? 3) / 3))
      const retention = Math.exp(-daysSinceReview / stability)
      totalRetention += retention
      retentionCount++
    }
    const avgRetention = retentionCount > 0 ? totalRetention / retentionCount : 0

    // 10. This week / this month active days
    const weekAgoTs = nowTs - 7 * DAY_MS
    const monthAgoTs = nowTs - 30 * DAY_MS
    const weekActiveDays = new Set(
      nodeList
        .filter((n) => n.created_at >= weekAgoTs)
        .map((n) => Math.floor(n.created_at / DAY_MS))
    ).size
    const monthActiveDays = new Set(
      nodeList
        .filter((n) => n.created_at >= monthAgoTs)
        .map((n) => Math.floor(n.created_at / DAY_MS))
    ).size

    return {
      totalNodes,
      starredCount,
      masteryCount,
      confidenceBuckets,
      ratedConfidenceCount,
      maxConfidenceCount,
      roleCount,
      maxRoleCount,
      maxDepth,
      avgDepth,
      recentNodesCount: recentNodes.length,
      sparkBuckets,
      maxSpark,
      topTags,
      weeklyEfficiency,
      srsCompletionRate,
      srsDueCount: srsDueNodes.length,
      avgRetention,
      retentionCount,
      weekActiveDays,
      monthActiveDays,
    }
  }, [nodes])

  // Mastery bar segments (for the stacked SVG bar)
  const masterySegments = CHECK_STATUS_ORDER.map((status) => {
    const count = stats.masteryCount[status]
    const pct = stats.totalNodes ? (count / stats.totalNodes) * 100 : 0
    return { status, count, pct }
  })

  return (
    <Modal title="学习进度概览" onClose={onClose} className="stats-modal">
      {/* 1. Overview cards */}
      <div className="stats-overview-grid">
          <div className="stat-card">
            <span className="stat-value">{topics.length}</span>
            <span className="stat-label">学习主题</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.totalNodes}</span>
            <span className="stat-label">知识节点</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.starredCount}</span>
            <span className="stat-label">星标节点</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{dueReviewCount}</span>
            <span className="stat-label">待复习</span>
          </div>
        </div>

        {/* 2. Mastery distribution bar */}
        <section className="stats-section">
          <h3>掌握度分布</h3>
          <div className="mastery-bar-wrap">
            {stats.totalNodes > 0 ? (
              <svg
                className="mastery-bar"
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                role="img"
                aria-label="掌握度分布条"
              >
                {masterySegments.map((seg, i) => {
                  let offset = 0
                  for (let j = 0; j < i; j++) offset += masterySegments[j].pct
                  return (
                    <rect
                      key={seg.status}
                      x={offset}
                      y={0}
                      width={seg.pct}
                      height={10}
                      fill={STATUS_COLORS[seg.status]}
                    />
                  )
                })}
              </svg>
            ) : (
              <div className="empty-bar">暂无节点数据</div>
            )}
          </div>
          <div className="mastery-legend">
            {masterySegments.map((seg) => (
              <span key={seg.status} className="mastery-legend-item">
                <span className="legend-dot" style={{ background: STATUS_COLORS[seg.status] }} />
                <span className="legend-text">{CHECK_STATUS_LABEL[seg.status]}</span>
                <span className="legend-count">
                  {seg.count} · {seg.pct.toFixed(0)}%
                </span>
              </span>
            ))}
          </div>
        </section>

        {/* 3. Confidence distribution */}
        <section className="stats-section">
          <h3>信心度分布</h3>
          <div className="confidence-chart">
            {[1, 2, 3, 4, 5].map((level) => {
              const count = stats.confidenceBuckets[level - 1]
              const heightPct = count > 0 ? Math.max((count / stats.maxConfidenceCount) * 100, 6) : 0
              return (
                <div key={level} className="confidence-bar-col">
                  <span className="confidence-count">{count}</span>
                  <div className="confidence-bar-track">
                    <div
                      className="confidence-bar-fill"
                      style={{ height: `${heightPct}%`, background: CONFIDENCE_COLORS[level - 1] }}
                    />
                  </div>
                  <span className="confidence-label">L{level}</span>
                </div>
              )
            })}
          </div>
          <p className="stats-hint">
            从 L1（最不熟）到 L5（最扎实），共 {stats.ratedConfidenceCount} 个已评分节点。
          </p>
        </section>

        {/* 4. Learning role distribution */}
        <section className="stats-section">
          <h3>学习角色分布</h3>
          <div className="role-stats">
            {ROLE_ORDER.map((role) => {
              const count = stats.roleCount[role] || 0
              const widthPct = (count / stats.maxRoleCount) * 100
              return (
                <div key={role} className="role-stat-row">
                  <span className="role-stat-label">{ROLE_META[role].label}</span>
                  <div className="role-stat-track">
                    <div
                      className="role-stat-fill"
                      style={{ width: `${widthPct}%`, background: ROLE_BAR_COLORS[role] }}
                    />
                  </div>
                  <span className="role-stat-count">{count}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* 5. Knowledge tree depth */}
        <section className="stats-section">
          <h3>知识树深度</h3>
          <div className="depth-stats">
            <div className="depth-card">
              <span className="depth-value">{stats.maxDepth}</span>
              <span className="depth-label">最大深度</span>
            </div>
            <div className="depth-card">
              <span className="depth-value">{stats.avgDepth.toFixed(1)}</span>
              <span className="depth-label">平均深度</span>
            </div>
          </div>
        </section>

        {/* 6. Recent activity */}
        <section className="stats-section">
          <h3>近 7 天活动</h3>
          <div className="activity-wrap">
            <span className="activity-count">{stats.recentNodesCount} 个新节点</span>
            <svg
              className="activity-sparkline"
              viewBox="0 0 140 40"
              preserveAspectRatio="none"
              role="img"
              aria-label="近 7 天创建节点数"
            >
              <line x1={0} y1={36} x2={140} y2={36} stroke="rgba(91, 64, 35, 0.16)" strokeWidth={0.5} />
              {stats.sparkBuckets.map((count, i) => {
                const slotWidth = 140 / 7
                const barWidth = slotWidth - 6
                const x = i * slotWidth + 3
                const h = (count / stats.maxSpark) * 30
                const y = 36 - h
                return (
                  <g key={i}>
                    <rect
                      x={x}
                      y={y}
                      width={Math.max(barWidth, 0)}
                      height={Math.max(h, 0)}
                      rx={2}
                      fill="#b8751a"
                      opacity={0.82}
                    />
                    {count > 0 && (
                      <text x={x + barWidth / 2} y={y - 2} textAnchor="middle" fontSize="7" fill="#7d6d58">
                        {count}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
            <div className="sparkline-labels">
              <span>7 天前</span>
              <span>今天</span>
            </div>
          </div>
        </section>

        {/* 7. Top tags */}
        <section className="stats-section">
          <h3>热门标签</h3>
          {stats.topTags.length > 0 ? (
            <div className="top-tags">
              {stats.topTags.map(([tag, count]) => (
                <span key={tag} className="top-tag-item">
                  {tag}
                  <small>{count}</small>
                </span>
              ))}
            </div>
          ) : (
            <p className="empty">还没有标签数据，生成学习卡片后会自动汇总。</p>
          )}
        </section>

        {/* 8. Activity Heatmap */}
        <section className="stats-section">
          <h3>学习热力图</h3>
          <div className="heatmap-wrap">
            <div className="streak-info">
              <span className="streak-number">{currentStreak}</span>
              <span className="streak-label">天连续学习</span>
              <span className="streak-longest">最长 {longestStreak} 天</span>
            </div>
            <svg className="heatmap-svg" viewBox="0 0 210 125" role="img" aria-label="学习活动热力图">
              {heatmap.map((day, i) => {
                const col = Math.floor(i / 7)
                const row = i % 7
                const x = col * 15 + 20
                const y = row * 15 + 14
                const opacity = [0, 0.25, 0.5, 0.75, 1][day.level]
                return (
                  <rect
                    key={day.date}
                    x={x}
                    y={y}
                    width={12}
                    height={12}
                    rx={2}
                    fill="#0d9488"
                    opacity={opacity}
                  >
                    <title>{day.date}: {day.count} 个节点</title>
                  </rect>
                )
              })}
            </svg>
            <div className="heatmap-labels">
              <span>少</span>
              {[0, 1, 2, 3, 4].map(l => (
                <rect key={l} width={10} height={10} rx={2} fill="#0d9488" opacity={[0, 0.25, 0.5, 0.75, 1][l]} />
              ))}
              <span>多</span>
            </div>
          </div>
        </section>

        {/* 9. SRS Week View */}
        {profile.total_nodes > 0 && (
          <section className="stats-section">
            <h3>未来 7 天复习计划</h3>
            <div className="srs-week">
              {srsWeek.map(day => (
                <div key={day.date} className={`srs-day-card${day.dueCount > 0 ? ' has-due' : ''}`}>
                  <span className="srs-day-date">
                    {new Date(day.date + 'T00:00:00').toLocaleDateString('zh-CN', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  {day.dueCount > 0 ? (
                    <span className="srs-day-count">{day.dueCount}</span>
                  ) : (
                    <span className="srs-day-empty">-</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 10. Topic Competence Radar */}
        {profile.topic_competence.length >= 2 && (
          <section className="stats-section">
            <h3>领域掌握雷达</h3>
            <div className="radar-wrap">
              <RadarChart topics={profile.topic_competence} />
            </div>
          </section>
        )}

        {/* 11. 30-Day Trend Line */}
        {totalActiveDays > 0 && (
          <section className="stats-section">
            <h3>30 天学习趋势</h3>
            <div className="trend-wrap">
              <TrendLine nodes={Object.values(nodes)} />
            </div>
          </section>
        )}

        {/* 12. Learning efficiency trend (weekly pass rate) */}
        {profile.total_nodes > 0 && stats.weeklyEfficiency.some((w) => w.checkedCount > 0) && (
          <section className="stats-section">
            <h3>学习效率趋势</h3>
            <div className="efficiency-wrap">
              <EfficiencyTrendLine weeklyData={stats.weeklyEfficiency} />
              <p className="stats-hint">
                每周理解检测通过率，反映学习效率变化。检测次数越多，数据越准确。
              </p>
            </div>
          </section>
        )}

        {/* 13. Retention estimate */}
        {stats.retentionCount > 0 && (
          <section className="stats-section">
            <h3>知识留存率预估</h3>
            <div className="retention-wrap">
              <div className="retention-gauge">
                <svg viewBox="0 0 120 70" className="retention-svg" role="img" aria-label="知识留存率">
                  {/* Background arc */}
                  <path
                    d="M 10 60 A 50 50 0 0 1 110 60"
                    fill="none"
                    stroke="rgba(91, 64, 35, 0.12)"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  {/* Data arc */}
                  <path
                    d="M 10 60 A 50 50 0 0 1 110 60"
                    fill="none"
                    stroke={stats.avgRetention > 0.7 ? '#3f8d70' : stats.avgRetention > 0.4 ? '#b8751a' : '#b84040'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${stats.avgRetention * 157} 157`}
                  />
                  <text x="60" y="50" textAnchor="middle" fontSize="18" fontWeight="700" fill="#5b4023">
                    {Math.round(stats.avgRetention * 100)}%
                  </text>
                  <text x="60" y="64" textAnchor="middle" fontSize="7" fill="#a2917c">留存率</text>
                </svg>
              </div>
              <div className="retention-detail">
                <p>基于 {stats.retentionCount} 个已学习节点的 SRS 间隔和掌握度估算。</p>
                <p className="retention-advice">
                  {stats.avgRetention > 0.7
                    ? '记忆状态良好，继续按计划复习即可。'
                    : stats.avgRetention > 0.4
                      ? '部分知识开始遗忘，建议优先复习到期节点。'
                      : '大量知识可能已遗忘，建议集中复习薄弱环节。'}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 14. SRS completion rate */}
        {stats.srsDueCount > 0 && (
          <section className="stats-section">
            <h3>复习完成率</h3>
            <div className="srs-completion-wrap">
              <div className="srs-completion-bar">
                <div
                  className="srs-completion-fill"
                  style={{ width: `${stats.srsCompletionRate * 100}%` }}
                />
              </div>
              <span className="srs-completion-text">
                {Math.round(stats.srsCompletionRate * 100)}% · {stats.srsDueCount} 个待复习
              </span>
            </div>
          </section>
        )}

        {/* 15. Learning rhythm analysis */}
        {profile.total_nodes >= 5 && (
          <section className="stats-section">
            <h3>学习节奏分析</h3>
            <div className="rhythm-grid">
              <div className="rhythm-card">
                <span className="rhythm-icon">
                  {profile.learning_rhythm.preferred_time_of_day === 'morning' && '🌅'}
                  {profile.learning_rhythm.preferred_time_of_day === 'afternoon' && '☀️'}
                  {profile.learning_rhythm.preferred_time_of_day === 'evening' && '🌆'}
                  {profile.learning_rhythm.preferred_time_of_day === 'night' && '🌙'}
                  {profile.learning_rhythm.preferred_time_of_day === 'unknown' && '⏰'}
                </span>
                <span className="rhythm-value">
                  {profile.learning_rhythm.preferred_time_of_day === 'morning' && '上午'}
                  {profile.learning_rhythm.preferred_time_of_day === 'afternoon' && '下午'}
                  {profile.learning_rhythm.preferred_time_of_day === 'evening' && '晚间'}
                  {profile.learning_rhythm.preferred_time_of_day === 'night' && '深夜'}
                  {profile.learning_rhythm.preferred_time_of_day === 'unknown' && '未知'}
                </span>
                <span className="rhythm-label">偏好时段</span>
              </div>
              <div className="rhythm-card">
                <span className="rhythm-value">{profile.learning_rhythm.avg_nodes_per_session.toFixed(1)}</span>
                <span className="rhythm-label">平均每次节点</span>
              </div>
              <div className="rhythm-card">
                <span className="rhythm-value">{profile.learning_rhythm.avg_session_gap_hours.toFixed(1)}h</span>
                <span className="rhythm-label">平均会话间隔</span>
              </div>
              <div className="rhythm-card">
                <span className="rhythm-value">{stats.weekActiveDays}</span>
                <span className="rhythm-label">本周活跃</span>
              </div>
              <div className="rhythm-card">
                <span className="rhythm-value">{stats.monthActiveDays}</span>
                <span className="rhythm-label">本月活跃</span>
              </div>
              <div className="rhythm-card">
                <span className="rhythm-value">{profile.learning_rhythm.active_days_30}</span>
                <span className="rhythm-label">30天活跃</span>
              </div>
            </div>
          </section>
        )}
    </Modal>
  )
}
