import { memo, useEffect } from 'react'
import type { PathStep } from '../types'
import { CHECK_STATUS_LABEL, ROLE_META } from '../constants'

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<PathStep['category'], string> = {
  review: '复习',
  gap: '盲区',
  strengthen: '巩固',
  explore: '探索',
}

const REASON_LABELS: Record<PathStep['reason'], string> = {
  srs_due: 'SRS到期',
  weak_confidence: '薄弱',
  untested: '未检测',
  prerequisite_gap: '前置缺失',
  unvisited_branch: '未探索分支',
  starred_review: '星标',
  role_imbalance: '角色失衡',
}

function formatRelativeTime(nextReviewAt: number): string {
  const nowMs = Date.now()
  const diffMs = nextReviewAt - nowMs

  if (diffMs <= 0) {
    const overdueDays = Math.floor(-diffMs / 86_400_000)
    if (overdueDays === 0) return '今天已到期'
    return `已过期${overdueDays}天`
  }

  const date = new Date(nextReviewAt)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  const diffDays = diffMs / 86_400_000
  if (diffDays < 1) return `今天 ${timeStr}`

  const today = new Date(nowMs)
  const tomorrowDate = new Date(today)
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)

  if (
    date.getFullYear() === tomorrowDate.getFullYear() &&
    date.getMonth() === tomorrowDate.getMonth() &&
    date.getDate() === tomorrowDate.getDate()
  ) {
    return `明天 ${timeStr}`
  }

  const dayAfterTomorrow = new Date(today)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)

  if (
    date.getFullYear() === dayAfterTomorrow.getFullYear() &&
    date.getMonth() === dayAfterTomorrow.getMonth() &&
    date.getDate() === dayAfterTomorrow.getDate()
  ) {
    return `后天 ${timeStr}`
  }

  const days = Math.floor(diffDays)
  return `${days} 天后`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LearningPathModalProps {
  isOpen: boolean
  pathSteps: PathStep[]
  categoryFilter: PathStep['category'] | 'all'
  onSetCategoryFilter: (f: PathStep['category'] | 'all') => void
  categoryCounts: Record<PathStep['category'], number>
  onClose: () => void
  onOpenNode: (nodeId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LearningPathModalInner = memo(function LearningPathModal({
  isOpen,
  pathSteps,
  categoryFilter,
  onSetCategoryFilter,
  categoryCounts,
  onClose,
  onOpenNode,
}: LearningPathModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const counts = categoryCounts

  return (
    <div className="modal-backdrop path-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal path-modal">
        {/* Header */}
        <div className="modal-header">
          <h2>学习路径推荐</h2>
          <button onClick={onClose}>关闭</button>
        </div>

        {/* Summary pills */}
        <div className="path-summary">
          <span className="path-summary-item review">
            <strong>{counts.review}</strong> 个复习
          </span>
          <span className="path-summary-item gap">
            <strong>{counts.gap}</strong> 个盲区
          </span>
          <span className="path-summary-item strengthen">
            <strong>{counts.strengthen}</strong> 个巩固
          </span>
          <span className="path-summary-item explore">
            <strong>{counts.explore}</strong> 个探索
          </span>
        </div>

        {/* Category filter buttons */}
        <div className="path-filters">
          <button
            className={categoryFilter === 'all' ? 'active' : ''}
            onClick={() => onSetCategoryFilter('all')}
          >
            全部
          </button>
          {(['review', 'gap', 'strengthen', 'explore'] as const).map((cat) => (
            <button
              key={cat}
              className={categoryFilter === cat ? 'active' : ''}
              onClick={() => onSetCategoryFilter(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Low data warning */}
        {pathSteps.length > 0 && pathSteps.length < 3 && (
          <div className="path-low-data-warning">
            学习更多节点后，推荐会更准确。
          </div>
        )}

        {/* Step cards timeline */}
        <div className="path-timeline">
          {pathSteps.length === 0 && (
            <div className="path-empty">
              暂无学习推荐。开始探索知识节点后，这里会显示个性化的学习路径。
            </div>
          )}

          {pathSteps.length > 0 &&
            pathSteps
              .filter(
                (step) => categoryFilter === 'all' || step.category === categoryFilter,
              )
              .map((step, i) => (
                <div
                  key={step.id}
                  className={`path-step ${step.category}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenNode(step.nodeId)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenNode(step.nodeId) } }}
                >
                  <div className="path-step-head">
                    <span className="path-step-index">{i + 1}</span>
                    <span className="path-step-reason">
                      {REASON_LABELS[step.reason]}
                    </span>
                    <h4>{step.shortTitle}</h4>
                    <span className="path-step-arrow" aria-hidden="true">→</span>
                  </div>
                  <div className="path-step-meta">
                    <span className="path-step-confidence">
                      {step.confidence ? `信心 L${step.confidence}` : '未评分'}
                    </span>
                    <span className="path-step-mastery">
                      {CHECK_STATUS_LABEL[step.currentMastery]}
                    </span>
                    <span className="path-step-role">
                      {ROLE_META[step.role].label}
                    </span>
                    {step.nextReviewAt && (
                      <span className="path-step-srs">
                        到期: {formatRelativeTime(step.nextReviewAt)}
                      </span>
                    )}
                  </div>
                  <div className="path-step-action">
                    <span className="path-step-hint">
                      {step.category === 'review'
                        ? '点击复习此节点'
                        : step.category === 'gap'
                          ? '点击学习此节点'
                          : '点击巩固此节点'}
                    </span>
                  </div>
                </div>
              ))}

          {pathSteps.length > 0 &&
            pathSteps.filter(
              (step) => categoryFilter === 'all' || step.category === categoryFilter,
            ).length === 0 && (
              <div className="path-empty">
                当前筛选条件下没有匹配的学习步骤。
              </div>
            )}
        </div>
      </div>
    </div>
  )
})

export default LearningPathModalInner
