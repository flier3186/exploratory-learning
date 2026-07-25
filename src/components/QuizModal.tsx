import { memo } from 'react'
import type { QuizQuestion, QuizResult } from '../quiz-generator'

const RATING_OPTIONS: Array<{ value: QuizResult['selfRating']; label: string; emoji: string }> = [
  { value: 0, label: '完全想不起', emoji: '' },
  { value: 1, label: '有点印象', emoji: '' },
  { value: 2, label: '基本记得', emoji: '' },
  { value: 3, label: '完美回忆', emoji: '' },
]

const QUIZ_TYPE_LABEL: Record<string, string> = {
  recall: '主动回忆',
  fill_blank: '要点回忆',
  true_false: '判断辨析',
  scenario: '场景应用',
}

export const QuizModal = memo(function QuizModal(props: {
  currentQuiz: QuizQuestion | null
  currentNodeTitle: string | null
  progress: string
  showAnswer: boolean
  isComplete: boolean
  sessionStats: {
    avgRating: number
    perfectCount: number
    fuzzyCount: number
    forgotCount: number
    total: number
  } | null
  onRevealAnswer: () => void
  onRate: (rating: QuizResult['selfRating']) => void
  onSkip: () => void
  onClose: () => void
}) {
  const {
    currentQuiz,
    currentNodeTitle,
    progress,
    showAnswer,
    isComplete,
    sessionStats,
    onRevealAnswer,
    onRate,
    onSkip,
    onClose,
  } = props

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal quiz-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isComplete ? '闪测完成' : '闪测：主动回忆'}</h2>
          <div className="quiz-progress">{progress}</div>
          <button onClick={onClose}>关闭</button>
        </div>

        {isComplete && sessionStats ? (
          <div className="quiz-complete">
            <div className="quiz-complete-score">
              <span className="score-number">{sessionStats.avgRating.toFixed(1)}</span>
              <span className="score-label">/ 3 平均得分</span>
            </div>
            <div className="quiz-complete-stats">
              <div className="stat-item perfect">
                <strong>{sessionStats.perfectCount}</strong>
                <span>完美回忆</span>
              </div>
              <div className="stat-item basic">
                <strong>{sessionStats.total - sessionStats.fuzzyCount - sessionStats.forgotCount - sessionStats.perfectCount}</strong>
                <span>基本记得</span>
              </div>
              <div className="stat-item fuzzy">
                <strong>{sessionStats.fuzzyCount}</strong>
                <span>有点印象</span>
              </div>
              <div className="stat-item forgot">
                <strong>{sessionStats.forgotCount}</strong>
                <span>完全忘了</span>
              </div>
            </div>
            <div className="quiz-complete-message">
              {sessionStats.avgRating >= 2.5
                ? '掌握不错！继续保持间隔复习的习惯。'
                : sessionStats.avgRating >= 1.5
                  ? '还有一些模糊的知识点，建议对薄弱项再做一次费曼检验。'
                  : '大部分知识点需要重新学习，建议回顾原始学习卡片。'}
            </div>
            <button className="quiz-close-btn" onClick={onClose}>完成</button>
          </div>
        ) : currentQuiz ? (
          <div className="quiz-active">
            <div className="quiz-meta">
              <span className="quiz-type-chip">{QUIZ_TYPE_LABEL[currentQuiz.type] || '回忆'}</span>
              {currentNodeTitle && <span className="quiz-node-title">{currentNodeTitle}</span>}
            </div>
            <div className="quiz-question-card">
              <p className="quiz-prompt">{currentQuiz.prompt}</p>
              {currentQuiz.hint && (
                <details className="quiz-hint">
                  <summary>卡住了？看提示</summary>
                  <p>{currentQuiz.hint}</p>
                </details>
              )}
            </div>

            {showAnswer ? (
              <div className="quiz-answer-section">
                <div className="quiz-answer-card">
                  <h4>参考答案</h4>
                  <p>{currentQuiz.answer}</p>
                </div>
                <div className="quiz-rate-row">
                  <span>你回忆得怎么样？</span>
                  <div className="quiz-rate-buttons">
                    {RATING_OPTIONS.map((opt) => (
                      <button key={opt.value} className={`rate-btn rate-${opt.value}`} onClick={() => onRate(opt.value)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="quiz-action-row">
                <button className="quiz-reveal-btn" onClick={onRevealAnswer}>
                  我回忆完了，揭晓答案
                </button>
                <button className="quiz-skip-btn" onClick={onSkip}>
                  跳过这题
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="empty">没有可复习的闪测题目。</p>
        )}
      </div>
    </div>
  )
})
