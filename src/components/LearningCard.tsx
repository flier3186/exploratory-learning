import { memo, useEffect, useRef, useState } from 'react'
import { CHECK_INTENT_LABEL, CHECK_STATUS_LABEL, FOLLOWUP_LABEL, ROLE_META } from '../constants'
import type { CheckStatus, FactCheckBlock, FeedbackValue, FollowupQuestion, LearningNode } from '../types'
import { MarkdownText } from './MarkdownText'

/** 检测当前是否为移动端视口（≤760px），用于控制折叠默认行为 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    // matchMedia 在 jsdom 测试环境中可能不存在，回退到 innerWidth 判断
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(max-width: 760px)').matches
    }
    return window.innerWidth <= 760
  })
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(max-width: 760px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isMobile
}

export const LearningCard = memo(function LearningCard(props: {
  node: LearningNode
  onToggleStar: () => void
  onConfidence: (value: 1 | 2 | 3 | 4 | 5) => void
  onCheckStatus: (status: Exclude<CheckStatus, 'untested'>) => void
  onAskFollowup: (followup: FollowupQuestion) => void
  onAskFollowups: (followups: FollowupQuestion[]) => void
  onFeedback: (followupId: string, feedback: FeedbackValue) => void
  onReplaceFollowups: (angle: 'batch' | 'foundation' | 'application' | 'challenge' | 'system') => void
  onGenerate?: () => void
  isGenerating?: boolean
  onSingleNodeQuiz?: () => void
  onOpenFeynman?: () => void
  highlightKey?: number
  onNotice?: (msg: string) => void
}) {
  const { node, onToggleStar, onConfidence, onCheckStatus, onAskFollowup, onAskFollowups, onFeedback, onReplaceFollowups, onGenerate, isGenerating, onSingleNodeQuiz, onOpenFeynman, highlightKey, onNotice } = props
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [selectedFollowupIds, setSelectedFollowupIds] = useState<string[]>([])
  const [isHighlighted, setIsHighlighted] = useState(false)
  const [ttsSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const masteryOptions: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string }> = [
    { value: 1, label: '刚接触' },
    { value: 2, label: '有点印象' },
    { value: 3, label: '能复述' },
    { value: 4, label: '能应用' },
    { value: 5, label: '能讲给别人' },
  ]

  // 预加载语音列表 + 组件卸载清理
  useEffect(() => {
    function loadVoices() {
      const voices = window.speechSynthesis?.getVoices() || []
      if (voices.length > 0) {
        voicesRef.current = voices
      }
    }
    loadVoices()
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis?.cancel()
      window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices)
      if (speakTimerRef.current) clearTimeout(speakTimerRef.current)
    }
  }, [])

  // Stop speech and reset state when node changes
  useEffect(() => {
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
    setSelectedFollowupIds([])
  }, [node.id])

  // 跳转高亮：highlightKey 变化时触发闪烁动画
  useEffect(() => {
    if (highlightKey === undefined || highlightKey === 0) return
    setIsHighlighted(true)
    const timer = setTimeout(() => setIsHighlighted(false), 2000)
    return () => clearTimeout(timer)
  }, [highlightKey])

  const visibleFollowups = node.followups.slice(0, 5)
  const selectedFollowups = visibleFollowups.filter((followup) => selectedFollowupIds.includes(followup.id))

  function toggleSpeak() {
    if (!ttsSupported || !('speechSynthesis' in window)) {
      onNotice?.('当前浏览器不支持语音朗读，建议使用 Chrome 或 Edge 浏览器。')
      return
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      if (speakTimerRef.current) clearTimeout(speakTimerRef.current)
      setIsSpeaking(false)
      return
    }
    // Build concise text for TTS - include memory, summary, plain; skip mechanism
    const summary = node.answer.summary || ''
    const plain = node.answer.plain || ''
    const memory = node.one_line_memory || ''
    const text = [
      memory ? `记忆点：${memory}。` : '',
      summary ? `一句话结论：${summary}。` : '',
      plain ? `通俗解释：${plain}` : '',
    ].filter(Boolean).join('\n').slice(0, 500)
    if (!text) return

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.9
    utterance.pitch = 1
    utterance.volume = 1
    // Use pre-loaded voices, fall back to getVoices()
    const voices = voicesRef.current.length > 0
      ? voicesRef.current
      : (window.speechSynthesis?.getVoices() || [])
    // Prefer zh-CN, then zh-TW, then any zh prefix, then any containing zh, then first available
    const zhVoice =
      voices.find((v) => v.lang === 'zh-CN') ||
      voices.find((v) => v.lang === 'zh-TW') ||
      voices.find((v) => v.lang.startsWith('zh')) ||
      voices.find((v) => v.lang.includes('zh')) ||
      voices[0] ||
      null
    // 显式赋值 voice（某些浏览器不赋值会导致静默失败）
    if (zhVoice) utterance.voice = zhVoice
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = (event) => {
      // Only show error state for real errors, not cancellation
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        setIsSpeaking(false)
        onNotice?.('语音朗读出现问题，可尝试刷新页面或换用其他浏览器。')
      }
    }
    // Cancel any ongoing speech first, then speak after a brief delay
    // This avoids race conditions on mobile browsers
    window.speechSynthesis.cancel()
    if (speakTimerRef.current) clearTimeout(speakTimerRef.current)
    speakTimerRef.current = window.setTimeout(() => {
      try {
        window.speechSynthesis.speak(utterance)
        setIsSpeaking(true)
        // 安全网：如果 3 秒后 onstart 从未触发且仍标记为 speaking，可能静默失败了
        setTimeout(() => {
          if (isSpeaking && !window.speechSynthesis.speaking) {
            setIsSpeaking(false)
          }
        }, 3000)
      } catch {
        setIsSpeaking(false)
        onNotice?.('语音朗读启动失败，可尝试刷新页面或换用其他浏览器。')
      }
    }, 200)
  }

  function toggleFollowupSelection(followupId: string) {
    setSelectedFollowupIds((current) => {
      if (current.includes(followupId)) return current.filter((id) => id !== followupId)
      if (current.length >= 3) return current
      return [...current, followupId]
    })
  }

  return (
    <section className={`learning-card${isHighlighted ? ' highlight-jump' : ''}`}>
      <div className="card-head">
        <div>
          <div className="tag-row">
            <span className={`role-chip ${ROLE_META[node.learning_role].tone}`}>{ROLE_META[node.learning_role].label}</span>
            {node.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
          <h2>{node.short_title}</h2>
          <p>{node.one_line_memory}</p>
          {node._learning_goal && (
            <div className="learning-goal-chip">
              <span className="goal-icon" aria-hidden="true">◎</span>
              <span>学习目标：{node._learning_goal}</span>
            </div>
          )}
        </div>
        <div className="card-actions">
          <button className={isSpeaking ? 'listen-button active' : 'listen-button'} onClick={toggleSpeak}>
            {isSpeaking ? '停止朗读' : ttsSupported ? '朗读摘要' : '朗读不可用'}
          </button>
          <button className={node.mastery.is_starred ? 'star active' : 'star'} onClick={onToggleStar}>
            {node.mastery.is_starred ? '重点回看' : '加入重点'}
          </button>
        </div>
      </div>

      {node.quality.is_demo && (
        <div className="demo-banner">
          <span className="demo-badge">演示模式</span>
          <span>本地模板：这不是 AI 生成的可靠答案，仅用于体验学习卡片结构。</span>
        </div>
      )}
      {node.quality.source_required && (
        <div className="quality-banner warning">
          需核验：这个问题涉及事实、时效或专业判断。当前工具没有联网检索能力，请结合可靠来源确认。
        </div>
      )}
      {node.quality.repaired && !node.quality.is_demo && node.quality.source_required && (
        <div className="quality-banner muted">提示：这类问题建议结合可靠来源再确认。</div>
      )}
      {node.quality.validation_warnings
        .filter((warning) => !warning.includes('问题类型异常') && !warning.includes('学习角色异常'))
        .filter((warning) => warning.includes('事实') || warning.includes('核验') || warning.includes('来源'))
        .map((warning) => (
          <div key={warning} className="quality-banner muted">
            {warning}
          </div>
        ))}
      {node.answer.source_note && <div className="source-note">{node.answer.source_note}</div>}
      {node.quality.generation_status === 'pending' && (
        <div className="quality-banner warning">
          <span>待生成：点击下方按钮调用 AI 填充完整学习内容。</span>
          <button className="notice-row" style={{ marginTop: 8, display: 'inline-flex' }} disabled={isGenerating || !onGenerate} onClick={onGenerate}>
            生成此节点
          </button>
        </div>
      )}
      {node.quality.parse_failed && <div className="source-note warn">模型结构化失败，本节点已使用降级方式生成。</div>}

      {(node.question_type === 'fact' || node.quality.source_required) && <FactCheckPanel factCheck={node.fact_check} />}

      <ConclusionSection summary={node.answer.summary} />

      <div className="answer-grid">
        <ArticleBlock title="通俗解释" body={node.answer.plain} defaultOpen />
        <ArticleBlock title="关键机制" body={node.answer.mechanism} mobileCollapsed />
        <ArticleBlock title="具体例子" body={node.answer.example} mobileCollapsed />
      </div>

      <details className="mistakes">
        <summary>易错点（{node.answer.misunderstandings.length} 条）</summary>
        <ul>
          {node.answer.misunderstandings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>

      <div className="mastery-row">
        <span>掌握度</span>
        <span className={`check-status ${node.mastery.check_status}`}>{CHECK_STATUS_LABEL[node.mastery.check_status]}</span>
        {masteryOptions.map((option) => (
          <button
            key={option.value}
            className={node.mastery.confidence === option.value ? 'active' : ''}
            onClick={() => onConfidence(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <details className="check-panel-wrapper">
        <summary className="check-panel-summary">理解检测</summary>
      <section className="check-panel">
        <div className="section-title">
          <h3>理解检测</h3>
          <p>先别急着追问，试着主动回忆一下。</p>
        </div>
        <div className="check-grid">
          {node.checks.map((check) => (
            <article key={check.id} className="check-card">
              <span>{CHECK_INTENT_LABEL[check.intent]}</span>
              <h4>{check.prompt}</h4>
              <p>{check.hint}</p>
            </article>
          ))}
        </div>
        <div className="check-actions">
          <button className={node.mastery.check_status === 'understood' ? 'active' : ''} onClick={() => onCheckStatus('understood')}>
            我能说清楚
          </button>
          <button className={node.mastery.check_status === 'uncertain' ? 'active' : ''} onClick={() => onCheckStatus('uncertain')}>
            还有点虚
          </button>
          <button className={node.mastery.check_status === 'needs_review' ? 'active' : ''} onClick={() => onCheckStatus('needs_review')}>
            需要复习
          </button>
        </div>
      </section>
      </details>

      <div className="verify-actions">
        <button className="verify-btn quiz-btn" onClick={onSingleNodeQuiz}>
          闪测检验
        </button>
        <button className="verify-btn feynman-btn" onClick={onOpenFeynman}>
          费曼检验
        </button>
      </div>

      <div className="followup-panel">
        <div className="section-title">
          <h3>下一步推荐</h3>
          <p>选择你感兴趣的追问（最多 3 个），一起生成。也可以单独追问某一个。</p>
        </div>
        {selectedFollowups.length > 0 && (
          <div className="followup-batch-bar">
            <span>已选择 {selectedFollowups.length}/3 个追问</span>
            <button className="batch-generate-btn" disabled={isGenerating} onClick={() => onAskFollowups(selectedFollowups)}>
              {isGenerating ? '生成中...' : '生成选中的追问'}
            </button>
            <button className="ghost" onClick={() => setSelectedFollowupIds([])}>
              清空选择
            </button>
          </div>
        )}
        <div className="followup-grid">
          {visibleFollowups.map((followup) => {
            const pathClass = followup.type === 'mechanism' || followup.type === 'foundation'
              ? 'path-depth'
              : followup.type === 'comparison' || followup.type === 'connection'
                ? 'path-compare'
                : followup.type === 'boundary' || followup.type === 'challenge'
                  ? 'path-boundary'
                  : 'path-action'
            const pathLabel = followup.type === 'mechanism' || followup.type === 'foundation'
              ? '深度路径'
              : followup.type === 'comparison' || followup.type === 'connection'
                ? '对比路径'
                : followup.type === 'boundary' || followup.type === 'challenge'
                  ? '边界路径'
                  : '实践路径'
            const isSelected = selectedFollowupIds.includes(followup.id)
            const isMaxed = selectedFollowupIds.length >= 3 && !isSelected
            return (
            <article
              key={followup.id}
              className={`followup-card ${pathClass}${followup.user_feedback === 'not_interested' ? ' dismissed' : ''}${followup.user_feedback === 'helpful' ? ' liked' : ''}${isSelected ? ' selected' : ''}${isMaxed ? ' disabled' : ''}`}
              onClick={() => !isMaxed && toggleFollowupSelection(followup.id)}
              role="checkbox"
              aria-checked={isSelected}
              aria-disabled={isMaxed}
              tabIndex={0}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isMaxed) { e.preventDefault(); toggleFollowupSelection(followup.id) } }}
            >
              <div className="followup-top">
                <span>{FOLLOWUP_LABEL[followup.type]}</span>
                <small className="path-tag">{pathLabel}</small>
                <small>难度 {followup.difficulty}</small>
                <span className={`followup-check ${isSelected ? 'checked' : ''}`} aria-hidden="true">
                  {isSelected ? '\u2713' : ''}
                </span>
              </div>
              <h4>{followup.question}</h4>
              <p>{followup.reason}</p>
              <small>{followup.expected_gain}</small>
              <div className="followup-actions" onClick={(e) => e.stopPropagation()}>
                <button disabled={isGenerating} onClick={() => onAskFollowup(followup)}>仅追问此个</button>
                <button onClick={() => onFeedback(followup.id, 'helpful')}>
                  {followup.user_feedback === 'helpful' ? '已偏好' : '多推荐这类'}
                </button>
                <button onClick={() => onFeedback(followup.id, 'not_interested')}>
                  {followup.user_feedback === 'not_interested' ? '已减少' : '少推荐这类'}
                </button>
              </div>
            </article>
            )
          })}
        </div>
        <div className="direction-row">
          <button onClick={() => onReplaceFollowups('batch')}>换一批</button>
          <button onClick={() => onReplaceFollowups('foundation')}>更基础</button>
          <button onClick={() => onReplaceFollowups('application')}>更应用</button>
          <button onClick={() => onReplaceFollowups('challenge')}>更有挑战</button>
          <button onClick={() => onReplaceFollowups('system')}>更系统</button>
        </div>
      </div>
    </section>
  )
})

function FactCheckPanel(props: { factCheck: FactCheckBlock }) {
  const { factCheck } = props
  const sections = [
    { title: '可以先学的部分', items: factCheck.explainable },
    { title: '必须查证的事实点', items: factCheck.to_verify },
    { title: '建议查证来源', items: factCheck.suggested_sources },
    { title: '暂不应下结论', items: factCheck.avoid_conclusions },
  ].filter((section) => section.items.length)

  if (!sections.length) return null

  return (
    <details className="fact-panel fact-panel-collapsible">
      <summary className="fact-panel-summary">
        <span className="fact-panel-title">事实核验</span>
        <small className="fact-panel-hint">{sections.length} 个维度 · 点击展开</small>
      </summary>
      <div className="section-title" style={{ marginTop: 12 }}>
        <h3>事实核验</h3>
        <p>先区分“能学习的解释”和“必须查证的事实”。</p>
      </div>
      <div className="fact-grid">
        {sections.map((section) => (
          <article key={section.title} className="fact-card">
            <h4>{section.title}</h4>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </details>
  )
}

function ArticleBlock({ title, body, tone, defaultOpen, mobileCollapsed }: { title: string; body: string; tone?: 'primary'; defaultOpen?: boolean; mobileCollapsed?: boolean }) {
  const isMobile = useIsMobile()
  // 移动端：mobileCollapsed 的块默认折叠，其余默认展开
  // 桌面端：全部默认展开（用 div 保持原有网格布局）
  if (!isMobile || !mobileCollapsed) {
    return (
      <article className={tone === 'primary' ? 'answer-block primary' : 'answer-block'}>
        <h3>{title}</h3>
        <MarkdownText text={body} />
      </article>
    )
  }
  // 移动端折叠模式
  return (
    <details className="answer-block answer-block-collapsible" open={defaultOpen}>
      <summary className="answer-block-summary">
        <span className="answer-block-arrow" aria-hidden="true">▸</span>
        {title}
      </summary>
      <div className="answer-block-content">
        <MarkdownText text={body} />
      </div>
    </details>
  )
}

function ConclusionSection({ summary }: { summary: string }) {
  if (!summary) return null
  return (
    <section className="conclusion-section">
      <div className="conclusion-label">
        <span className="conclusion-icon" aria-hidden="true">✦</span>
        <span>一句话结论</span>
      </div>
      <p className="conclusion-summary">{summary}</p>
    </section>
  )
}

