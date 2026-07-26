import { useEffect, useState } from 'react'
import { CHECK_STATUS_LABEL } from '../constants'
import type { CheckStatus } from '../types'
import { generateReportText } from '../hooks/use-weekly-report'
import type { WeeklyReportData } from '../hooks/use-weekly-report'
import { Modal } from './Modal'
import { copyToClipboard } from '../utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECK_STATUS_ORDER: CheckStatus[] = ['understood', 'uncertain', 'needs_review', 'untested']

const STATUS_COLORS: Record<CheckStatus, string> = {
  understood: '#3f8d70',
  uncertain: '#b8751a',
  needs_review: '#b84040',
  untested: '#a2917c',
}

// 一个状态变化是否为"正向"（已理解增加 / 未检测减少属于正向）
const POSITIVE_DELTA: Record<CheckStatus, boolean> = {
  understood: true,
  uncertain: false,
  needs_review: false,
  untested: false,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(start: number, end: number): string {
  const s = new Date(start)
  const e = new Date(end)
  return `${s.getMonth() + 1}月${s.getDate()}日 - ${e.getMonth() + 1}月${e.getDate()}日`
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`
  if (delta < 0) return `${delta}`
  return '0'
}

// ---------------------------------------------------------------------------
// WeeklyReportModal
// ---------------------------------------------------------------------------

export interface WeeklyReportModalProps {
  report: WeeklyReportData
  onClose: () => void
}

export function WeeklyReportModal({ report, onClose }: WeeklyReportModalProps) {
  const [toast, setToast] = useState<string | null>(null)

  // 成功提示自动消失
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  // 概览卡片数据
  const overviewCards = [
    { value: report.newNodesCount, label: '本周新增' },
    { value: report.totalNodes, label: '累计节点' },
    { value: report.masteredNodesCount, label: '已掌握' },
    { value: report.dueForReview, label: '待复习' },
    { value: report.streakDays, label: '连续学习天' },
  ]

  // 掌握度变化：before / after 对比，以全局最大值为标尺画条
  const masteryRows = CHECK_STATUS_ORDER.map((status) => {
    const before = report.masteryChange.before[status] ?? 0
    const after = report.masteryChange.after[status] ?? 0
    const delta = after - before
    return { status, before, after, delta }
  })
  const maxMasteryCount = Math.max(
    1,
    ...masteryRows.map((r) => Math.max(r.before, r.after)),
  )

  // 复制 / 分享
  const handleCopy = async () => {
    const text = generateReportText(report)
    const ok = await copyToClipboard(text)
    setToast(ok ? '周报文本已复制到剪贴板' : '复制失败，请手动选择文本')
  }

  const handleShare = async () => {
    const text = generateReportText(report)
    const ok = await copyToClipboard(text)
    setToast(ok ? '周报已分享到剪贴板' : '分享失败，请手动选择文本')
  }

  return (
    <Modal title="学习周报" onClose={onClose} className="weekly-report-modal">
      {/* 日期范围副标题（替代原 header 中的额外信息） */}
      <div style={{ marginTop: '-4px', marginBottom: '14px', fontSize: '0.85rem', color: 'var(--muted)' }}>
        {formatDateRange(report.periodStart, report.periodEnd)}
      </div>

      {/* 1. 概览卡片网格 */}
        <div
          className="stats-overview-grid"
          style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '18px' }}
        >
          {overviewCards.map((card) => (
            <div className="stat-card" key={card.label}>
              <span className="stat-value">{card.value}</span>
              <span className="stat-label">{card.label}</span>
            </div>
          ))}
        </div>

        {/* 2. 掌握度变化对比 */}
        <section className="stats-section">
          <h3>掌握度变化</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {masteryRows.map((row) => {
              const beforePct = (row.before / maxMasteryCount) * 100
              const afterPct = (row.after / maxMasteryCount) * 100
              const positive = POSITIVE_DELTA[row.status]
              const deltaPositive = row.delta > 0
              const deltaColor =
                row.delta === 0
                  ? 'var(--faint)'
                  : deltaPositive === positive
                    ? '#4ec9a8'
                    : '#f0a090'
              return (
                <div
                  key={row.status}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr auto',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '8px 10px',
                    border: '1px solid var(--line)',
                    borderRadius: '14px',
                    background: 'var(--card)',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.85rem',
                      color: 'var(--text)',
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '3px',
                        background: STATUS_COLORS[row.status],
                        flexShrink: 0,
                      }}
                    />
                    {CHECK_STATUS_LABEL[row.status]}
                  </span>

                  {/* before / after 双进度条 */}
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--faint)', width: '32px' }}>
                        之前
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: '8px',
                          borderRadius: '999px',
                          background: 'rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${beforePct}%`,
                            height: '100%',
                            borderRadius: '999px',
                            background: STATUS_COLORS[row.status],
                            opacity: 0.45,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          color: 'var(--muted)',
                          width: '24px',
                          textAlign: 'right',
                        }}
                      >
                        {row.before}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--faint)', width: '32px' }}>
                        现在
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: '8px',
                          borderRadius: '999px',
                          background: 'rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${afterPct}%`,
                            height: '100%',
                            borderRadius: '999px',
                            background: STATUS_COLORS[row.status],
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          color: 'var(--text)',
                          fontWeight: 700,
                          width: '24px',
                          textAlign: 'right',
                        }}
                      >
                        {row.after}
                      </span>
                    </div>
                  </div>

                  {/* 变化值 */}
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      color: deltaColor,
                      width: '40px',
                      textAlign: 'right',
                    }}
                  >
                    {formatDelta(row.delta)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="stats-hint">
            “之前”以本周新增节点默认未检测来估算，仅作参考。
          </p>
        </section>

        {/* 3. 关键收获 */}
        <section className="stats-section">
          <h3>关键收获</h3>
          {report.keyLearnings.length > 0 ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              {report.keyLearnings.map((k, i) => (
                <div
                  key={`${k.title}-${i}`}
                  style={{
                    display: 'grid',
                    gap: '4px',
                    padding: '12px 14px',
                    border: '1px solid var(--line)',
                    borderRadius: '16px',
                    background: 'var(--card)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text)' }}>
                      {k.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--accent)',
                        background: 'rgba(255,176,0,0.1)',
                        border: '1px solid rgba(255,176,0,0.25)',
                        borderRadius: '999px',
                        padding: '2px 9px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {k.topic}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.88rem',
                      color: 'var(--muted)',
                      lineHeight: 1.55,
                    }}
                  >
                    {k.memory}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">本周还没有带一句话记忆的节点，继续追问吧。</p>
          )}
        </section>

        {/* 4. 学习主题 */}
        <section className="stats-section">
          <h3>学习主题</h3>
          {report.topicsStudied.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {report.topicsStudied.map((topic) => (
                <span
                  key={topic}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    border: '1px solid var(--line)',
                    borderRadius: '999px',
                    padding: '6px 12px',
                    color: 'var(--text)',
                    background: 'var(--card)',
                    fontSize: '0.85rem',
                  }}
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="empty">本周还没有学习主题。</p>
          )}
        </section>

        {/* 5. 热门标签 */}
        <section className="stats-section">
          <h3>热门标签</h3>
          {report.topTags.length > 0 ? (
            <div className="top-tags">
              {report.topTags.map((t) => (
                <span className="top-tag-item" key={t.tag}>
                  #{t.tag}
                  <small>{t.count}</small>
                </span>
              ))}
            </div>
          ) : (
            <p className="empty">本周新增节点还没有标签。</p>
          )}
        </section>

        {/* 6. 底部操作栏 */}
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginTop: '8px',
            paddingTop: '14px',
            borderTop: '1px solid var(--line)',
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              padding: '10px 18px',
              borderRadius: '999px',
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: '#fff8eb',
              fontWeight: 800,
              fontSize: '0.92rem',
              cursor: 'pointer',
              transition: '0.18s ease',
            }}
          >
            复制周报文本
          </button>
          <button
            onClick={handleShare}
            style={{
              padding: '10px 18px',
              borderRadius: '999px',
              border: '1px solid rgba(255,176,0,0.4)',
              background: 'rgba(255,176,0,0.1)',
              color: 'var(--accent)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              transition: '0.18s ease',
            }}
          >
            分享到剪贴板
          </button>
          {toast && (
            <span
              role="status"
              style={{
                fontSize: '0.86rem',
                color: 'var(--accent-2)',
                fontWeight: 600,
              }}
            >
              {toast}
            </span>
          )}
        </div>
    </Modal>
  )
}
