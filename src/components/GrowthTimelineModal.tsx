import { useMemo } from 'react'
import { CHECK_STATUS_LABEL, ROLE_META } from '../constants'
import type { CheckStatus, LearningNode, Topic } from '../types'
import { Modal } from './Modal'
import { startOfDay, DAY_MS } from '../utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GrowthTimelineModalProps {
  nodes: Record<string, LearningNode>
  topics: Topic[]
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<CheckStatus, string> = {
  understood: '#3f8d70',
  uncertain: '#b8751a',
  needs_review: '#b84040',
  untested: '#a2917c',
}

const MILESTONES: { index: number; label: string; description: string }[] = [
  { index: 1, label: '开始学习', description: '种下第一颗知识的种子' },
  { index: 10, label: '渐入佳境', description: '知识树开始抽枝展叶' },
  { index: 50, label: '知识树初具规模', description: '已经有了枝繁叶茂的模样' },
  { index: 100, label: '知识森林', description: '从一棵树长成了一片森林' },
]

/** 中文日期格式：7月25日 */
function formatChineseDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 中文日期格式（带年份）：2026年7月25日 */
function formatChineseDateWithYear(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

// ---------------------------------------------------------------------------
// Derived data types
// ---------------------------------------------------------------------------

interface DayGroup {
  dayKey: number
  dayNodes: LearningNode[]
}

interface TopicGrowth {
  id: string
  title: string
  count: number
  earliest: number | null
  latest: number | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GrowthTimelineModal({ nodes, topics, onClose }: GrowthTimelineModalProps) {
  // 主题标题查找表
  const topicTitleMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of topics) m.set(t.id, t.title)
    return m
  }, [topics])

  // 统计概览
  const overview = useMemo(() => {
    const nodeList = Object.values(nodes)
    const totalNodes = nodeList.length
    const totalTopics = topics.length

    let earliestTs: number | null = null
    let latestTs: number | null = null
    for (const n of nodeList) {
      if (earliestTs === null || n.created_at < earliestTs) earliestTs = n.created_at
      if (latestTs === null || n.created_at > latestTs) latestTs = n.created_at
    }

    const spanDays =
      earliestTs !== null && latestTs !== null
        ? Math.max(1, Math.floor((startOfDay(latestTs) - startOfDay(earliestTs)) / DAY_MS) + 1)
        : 0

    return { totalNodes, totalTopics, earliestTs, latestTs, spanDays }
  }, [nodes, topics])

  // 时间线核心数据：按日期分组 + 里程碑标记
  const timeline = useMemo(() => {
    const nodeList = Object.values(nodes).sort((a, b) => a.created_at - b.created_at)

    // 节点序号（按创建时间升序，从 1 开始）+ 里程碑标记
    const orderMap = new Map<string, number>()
    const milestoneMap = new Map<string, { label: string; description: string }>()
    nodeList.forEach((node, idx) => {
      const order = idx + 1
      orderMap.set(node.id, order)
      const milestone = MILESTONES.find((m) => m.index === order)
      if (milestone) {
        milestoneMap.set(node.id, { label: milestone.label, description: milestone.description })
      }
    })

    // 按天分组
    const dayGroups = new Map<number, LearningNode[]>()
    for (const node of nodeList) {
      const dayKey = startOfDay(node.created_at)
      const arr = dayGroups.get(dayKey)
      if (arr) arr.push(node)
      else dayGroups.set(dayKey, [node])
    }

    // 从最新到最旧排列；同一天内按创建时间升序
    const sortedDays: DayGroup[] = Array.from(dayGroups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([dayKey, dayNodes]) => ({
        dayKey,
        dayNodes: dayNodes.slice().sort((a, b) => a.created_at - b.created_at),
      }))

    return { sortedDays, orderMap, milestoneMap, totalNodes: nodeList.length }
  }, [nodes])

  // 主题成长统计
  const topicGrowth = useMemo<TopicGrowth[]>(() => {
    const acc = new Map<string, { count: number; earliest: number; latest: number }>()
    for (const topic of topics) {
      acc.set(topic.id, { count: 0, earliest: Number.MAX_SAFE_INTEGER, latest: 0 })
    }
    for (const node of Object.values(nodes)) {
      const stat = acc.get(node.topic_id)
      if (!stat) continue
      stat.count++
      if (node.created_at < stat.earliest) stat.earliest = node.created_at
      if (node.created_at > stat.latest) stat.latest = node.created_at
    }
    return topics
      .map((topic) => {
        const stat = acc.get(topic.id)!
        return {
          id: topic.id,
          title: topic.title,
          count: stat.count,
          earliest: stat.count > 0 ? stat.earliest : null,
          latest: stat.count > 0 ? stat.latest : null,
        }
      })
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count || a.earliest! - b.earliest!)
  }, [nodes, topics])

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  if (overview.totalNodes === 0) {
    return (
      <Modal title="知识成长时间线" onClose={onClose} className="growth-timeline-modal">
        <div className="growth-empty">
          <p>还没有学习任何节点。</p>
          <p className="growth-empty-hint">开始探索一个真实问题后，这里会记录知识树的成长轨迹。</p>
        </div>
      </Modal>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const maxTopicCount = Math.max(1, ...topicGrowth.map((t) => t.count))

  return (
    <Modal title="知识成长时间线" onClose={onClose} className="growth-timeline-modal">
      {/* 1. 统计概览 */}
      <div className="growth-overview-grid">
          <div className="growth-stat-card">
            <span className="growth-stat-value">{overview.totalNodes}</span>
            <span className="growth-stat-label">总节点数</span>
          </div>
          <div className="growth-stat-card">
            <span className="growth-stat-value">{overview.totalTopics}</span>
            <span className="growth-stat-label">总主题数</span>
          </div>
          <div className="growth-stat-card">
            <span className="growth-stat-value">
              {overview.earliestTs !== null ? formatChineseDate(overview.earliestTs) : '-'}
            </span>
            <span className="growth-stat-label">最早学习日期</span>
          </div>
          <div className="growth-stat-card">
            <span className="growth-stat-value">{overview.spanDays}</span>
            <span className="growth-stat-label">学习跨度（天）</span>
          </div>
        </div>

        {/* 2. 里程碑概览 */}
        <section className="growth-section">
          <h3>成长里程碑</h3>
          <div className="growth-milestones">
            {MILESTONES.map((m) => {
              const reached = overview.totalNodes >= m.index
              return (
                <div
                  key={m.index}
                  className={`growth-milestone-pill ${reached ? 'reached' : 'locked'}`}
                >
                  <span className="growth-milestone-index">#{m.index}</span>
                  <span className="growth-milestone-label">{m.label}</span>
                  <span className="growth-milestone-desc">{m.description}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* 3. 时间线视图（核心） */}
        <section className="growth-section">
          <h3>成长时间线</h3>
          <div className="timeline-line">
            {timeline.sortedDays.map((group) => (
              <div className="timeline-item" key={group.dayKey}>
                <div className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-date">
                    {formatChineseDate(group.dayKey)}
                    <span className="timeline-day-count">
                      当天新增 {group.dayNodes.length} 个节点
                    </span>
                  </div>
                  <div className="timeline-nodes">
                    {group.dayNodes.map((node) => {
                      const order = timeline.orderMap.get(node.id) ?? 0
                      const milestone = timeline.milestoneMap.get(node.id)
                      const status = node.mastery.check_status
                      const roleMeta = ROLE_META[node.learning_role]
                      return (
                        <div
                          key={node.id}
                          className={`timeline-node ${milestone ? 'is-milestone' : ''}`}
                        >
                          {milestone && (
                            <div className="timeline-milestone-banner">
                              <span className="timeline-milestone-tag">
                                #{order} · {milestone.label}
                              </span>
                              <span className="timeline-milestone-desc">
                                {milestone.description}
                              </span>
                            </div>
                          )}
                          <div className="timeline-node-head">
                            <span className="timeline-node-order">#{order}</span>
                            <strong className="timeline-node-title">{node.short_title}</strong>
                            {node.mastery.is_starred && (
                              <span className="timeline-star" aria-label="星标节点">★</span>
                            )}
                          </div>
                          <div className="timeline-node-meta">
                            <span className="timeline-node-topic">
                              {topicTitleMap.get(node.topic_id) ?? node.topic_id}
                            </span>
                            <span className={`role-chip ${roleMeta.tone}`}>{roleMeta.label}</span>
                            <span
                              className="check-status-dot"
                              style={{ background: STATUS_COLORS[status] }}
                              title={CHECK_STATUS_LABEL[status]}
                            />
                            <span className={`check-status ${status}`}>
                              {CHECK_STATUS_LABEL[status]}
                            </span>
                            {node.mastery.confidence !== undefined && (
                              <span className="timeline-node-confidence">
                                信心 L{node.mastery.confidence}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. 主题成长统计 */}
        {topicGrowth.length > 0 && (
          <section className="growth-section">
            <h3>主题成长统计</h3>
            <div className="growth-topic-list">
              {topicGrowth.map((t) => {
                const widthPct = (t.count / maxTopicCount) * 100
                return (
                  <div className="growth-topic-row" key={t.id}>
                    <div className="growth-topic-head">
                      <span className="growth-topic-title">{t.title}</span>
                      <span className="growth-topic-count">{t.count} 个节点</span>
                    </div>
                    <div className="growth-topic-track">
                      <div className="growth-topic-fill" style={{ width: `${widthPct}%` }} />
                    </div>
                    <div className="growth-topic-time">
                      {t.earliest !== null && (
                        <span>最早 {formatChineseDateWithYear(t.earliest)}</span>
                      )}
                      {t.latest !== null && (
                        <span>最近 {formatChineseDateWithYear(t.latest)}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
    </Modal>
  )
}

export default GrowthTimelineModal
