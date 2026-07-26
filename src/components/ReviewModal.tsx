import { CHECK_STATUS_LABEL } from '../constants'
import { getConfidence } from '../learning'
import type { ReviewFilter, ReviewResult } from '../types'
import { Modal } from './Modal'

export function ReviewModal(props: {
  reviewFilter: ReviewFilter
  reviewResults: ReviewResult[]
  dueReviewCount: number
  currentTopicReviewCount: number
  starredReviewCount: number
  onClose: () => void
  onReviewFilterChange: (filter: ReviewFilter) => void
  onOpenNode: (nodeId: string) => void
  onStartQuiz: () => void
}) {
  const {
    reviewFilter,
    reviewResults,
    dueReviewCount,
    currentTopicReviewCount,
    starredReviewCount,
    onClose,
    onReviewFilterChange,
    onOpenNode,
    onStartQuiz,
  } = props

  return (
    <Modal title="复习入口" onClose={onClose} className="review-modal">
      <div className="review-summary">
        <span>{dueReviewCount} 个待复习</span>
        <span>{currentTopicReviewCount} 个在当前主题</span>
        <span>{starredReviewCount} 个星标回看</span>
      </div>
      <div className="review-actions-bar">
        <button className="quiz-start-btn" onClick={() => { onClose(); onStartQuiz() }}>
          开始闪测
        </button>
        <span className="quiz-hint-text">闪测会随机出题让你主动回忆，比"再看一遍"有效得多</span>
      </div>
      <div className="filter-row">
        <button className={reviewFilter === 'all' ? 'active' : ''} onClick={() => onReviewFilterChange('all')}>
          全部
        </button>
        <button className={reviewFilter === 'due' ? 'active' : ''} onClick={() => onReviewFilterChange('due')}>
          待复习
        </button>
        <button className={reviewFilter === 'uncertain' ? 'active' : ''} onClick={() => onReviewFilterChange('uncertain')}>
          不稳定
        </button>
        <button className={reviewFilter === 'starred' ? 'active' : ''} onClick={() => onReviewFilterChange('starred')}>
          星标
        </button>
        <button className={reviewFilter === 'current-topic' ? 'active' : ''} onClick={() => onReviewFilterChange('current-topic')}>
          当前主题
        </button>
      </div>
      <div className="search-results">
        {reviewResults.map((result) => (
          <button
            key={result.node.id}
            className="search-result review-result"
            onClick={() => {
              onClose()
              onOpenNode(result.node.id)
            }}
          >
            <div>
              <strong>{result.node.short_title}</strong>
              <span className={`check-status ${result.node.mastery.check_status}`}>
                {CHECK_STATUS_LABEL[result.node.mastery.check_status]}
              </span>
            </div>
            <p>{result.node.one_line_memory || result.node.answer.summary}</p>
            <small>{result.path || result.node.short_title}</small>
            <div className="tag-row">
              {result.reasons.map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
              {getConfidence(result.node) ? <span>掌握度 {getConfidence(result.node)}</span> : <span>尚未评分</span>}
            </div>
          </button>
        ))}
        {!reviewResults.length && (
          <p className="empty">当前没有符合条件的复习节点。你可以在学习卡片中选择"需要复习"，或把掌握度标为 1-3。</p>
        )}
      </div>
    </Modal>
  )
}
