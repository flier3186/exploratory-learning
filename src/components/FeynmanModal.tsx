import { memo } from 'react'
import type { LearningNode } from '../types'
import type { FeynmanFeedback } from '../quiz-generator'
import { Modal } from './Modal'

const SCORE_LABELS: Record<number, { text: string; tone: string }> = {
  5: { text: '完全理解', tone: 'score-perfect' },
  4: { text: '基本理解', tone: 'score-good' },
  3: { text: '理解大意', tone: 'score-ok' },
  2: { text: '理解不全', tone: 'score-weak' },
  1: { text: '需要重学', tone: 'score-fail' },
}

export const FeynmanModal = memo(function FeynmanModal(props: {
  isOpen: boolean
  activeNode: LearningNode | null
  explanation: string
  mode: 'text' | 'voice'
  isSubmitting: boolean
  feedback: FeynmanFeedback | null
  isVoiceListening?: boolean
  voiceSupported?: boolean
  onClose: () => void
  onReset: () => void
  onExplanationChange: (text: string) => void
  onVoiceInputStart: () => void
  onVoiceInputStop: () => void
  onSubmit: () => void
}) {
  const {
    isOpen, activeNode, explanation, mode,
    isSubmitting, feedback, isVoiceListening, voiceSupported,
    onClose, onReset, onExplanationChange, onVoiceInputStart, onVoiceInputStop, onSubmit,
  } = props

  if (!isOpen || !activeNode) return null

  const scoreInfo = feedback ? SCORE_LABELS[feedback.score] || SCORE_LABELS[3] : null

  return (
    <Modal title="费曼检验" onClose={onClose} className="feynman-modal">
      <div className="feynman-intro">
        <p>用自己的话解释 <strong>「{activeNode.short_title}」</strong></p>
        <p className="feynman-hint-text">假装在给一个完全不懂的人讲这个概念。说得越通俗越好，能举例子就更好了。</p>
      </div>

      {!feedback ? (
        <div className="feynman-input-section">
          <div className="feynman-input-area">
            <textarea
              value={explanation}
              onChange={(e) => onExplanationChange(e.target.value)}
              placeholder="开始你的解释...（语音或文字输入都可以）"
              rows={6}
              disabled={isSubmitting}
            />
            <div className="feynman-input-actions">
              <span className="feynman-mode-label">{mode === 'voice' ? '语音输入' : '文字输入'}</span>
              <button
                className={`feynman-voice-btn ${isVoiceListening ? 'active' : ''}`}
                onPointerDown={(e) => { e.preventDefault(); onVoiceInputStart() }}
                onPointerUp={onVoiceInputStop}
                onPointerLeave={onVoiceInputStop}
                onPointerCancel={onVoiceInputStop}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isSubmitting || !voiceSupported}
                type="button"
                aria-label={isVoiceListening ? '正在聆听，松开结束' : '按住说话'}
              >
                <svg className="voice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                {isVoiceListening ? '松开结束' : voiceSupported === false ? '语音不可用' : '按住说话'}
              </button>
              <button
                className="feynman-submit-btn"
                onClick={onSubmit}
                disabled={isSubmitting || explanation.trim().length < 10}
              >
                {isSubmitting ? 'AI 正在评估...' : '提交让 AI 评估'}
              </button>
            </div>
          </div>
          <div className="feynman-rules">
            <h4>费曼检验要点</h4>
            <ul>
              <li>不要复述原话——用你自己的表达方式</li>
              <li>如果能在解释中打个比方，说明你真的懂了</li>
              <li>如果说不清楚某个点，那就是还没真正掌握</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="feynman-result-section">
          <div className={`feynman-score-banner ${scoreInfo?.tone || ''}`}>
            <span className="feynman-score-number">{feedback.score}</span>
            <span className="feynman-score-text">{scoreInfo?.text || '评估完成'}</span>
          </div>

          <p className="feynman-overall">{feedback.overall}</p>

          {feedback.strengths.length > 0 && (
            <div className="feynman-block feynman-strengths">
              <h4>你说的对的地方</h4>
              <ul>
                {feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {feedback.gaps.length > 0 && (
            <div className="feynman-block feynman-gaps">
              <h4>你可能遗漏了</h4>
              <ul>
                {feedback.gaps.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          )}

          {feedback.suggestions.length > 0 && (
            <div className="feynman-block feynman-suggestions">
              <h4>改进建议</h4>
              <ul>
                {feedback.suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          <div className="feynman-result-actions">
            <button onClick={onClose}>关闭</button>
            <button className="feynman-retry-btn" onClick={onReset}>
              再试一次
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
})
