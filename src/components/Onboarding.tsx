import { useEffect, useState, useCallback } from 'react'

const ONBOARDING_KEY = 'exploratory-learning-onboarding-v2'
const FIRST_QUESTION_KEY = 'exploratory-learning-first-question-done'

const STEPS = [
  {
    title: '欢迎来到探索式学习',
    desc: '输入一个问题，AI 会生成一张学习卡片。你可以沿着卡片底部的推荐不断追问，把答案长成一棵知识树。',
    icon: (
      <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="14" r="5" fill="currentColor" />
        <circle cx="12" cy="32" r="4" fill="currentColor" />
        <circle cx="36" cy="32" r="4" fill="currentColor" />
        <path d="M24 19v8M24 27l-8 5M24 27l8 5" />
      </svg>
    ),
  },
  {
    title: '从这里开始提问',
    desc: '在页面中央的输入框写下你真正想学的问题，例如「什么是马尔可夫链？」。配好 API Key 后点「生成学习卡片」即可。',
    icon: (
      <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="14" width="36" height="20" rx="4" />
        <path d="M14 24h16M14 24l4-4M14 24l4 4" />
        <circle cx="34" cy="24" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: '用追问长出知识树',
    desc: '每张卡片底部有「下一步推荐」。点击任意追问，新卡片会作为子节点接入，逐步形成你的知识树。',
    icon: (
      <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="12" r="4" fill="currentColor" />
        <circle cx="14" cy="32" r="4" />
        <circle cx="34" cy="32" r="4" />
        <path d="M24 16v8M24 24l-8 6M24 24l8 6" />
      </svg>
    ),
  },
]

const API_SETUP_STEP = {
  title: '先配置 API Key',
  desc: '设置你的 AI API Key 即可开始提问。Key 只保存在本地浏览器，不会上传。也可以先去模板市场试用内置路径。',
  icon: (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="18" />
      <path d="M18 24h12M24 18v12" />
    </svg>
  ),
}

export function useOnboarding() {
  const [open, setOpen] = useState(false)
  const [showPulse, setShowPulse] = useState(false)

  useEffect(() => {
    try {
      const done = localStorage.getItem(ONBOARDING_KEY)
      if (!done) {
        setOpen(true)
      }
      // 如果引导已完成但还没问过第一个问题，显示脉冲提示
      const firstQuestionDone = localStorage.getItem(FIRST_QUESTION_KEY)
      if (done && !firstQuestionDone) {
        setShowPulse(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const finish = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      // ignore
    }
    setOpen(false)
    // 关闭引导后，如果还没问过第一个问题，显示脉冲提示
    try {
      const firstQuestionDone = localStorage.getItem(FIRST_QUESTION_KEY)
      if (!firstQuestionDone) {
        setShowPulse(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const markFirstQuestionDone = useCallback(() => {
    try {
      localStorage.setItem(FIRST_QUESTION_KEY, '1')
    } catch {
      // ignore
    }
    setShowPulse(false)
  }, [])

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(ONBOARDING_KEY)
      localStorage.removeItem(FIRST_QUESTION_KEY)
    } catch {
      // ignore
    }
    setOpen(true)
    setShowPulse(false)
  }, [])

  return { open, finish, reset, showPulse, markFirstQuestionDone }
}

export function OnboardingModal(props: {
  open: boolean
  onFinish: () => void
  hasApiKey?: boolean
  onOpenSettings?: () => void
}) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (props.open) setStep(0)
  }, [props.open])

  if (!props.open) return null

  const needsApiSetup = !props.hasApiKey
  const steps = needsApiSetup ? [...STEPS, API_SETUP_STEP] : STEPS
  const current = steps[step]
  const isLast = step === steps.length - 1
  const isApiStep = needsApiSetup && step === steps.length - 1

  return (
    <div className="modal-backdrop onboarding-backdrop" onClick={props.onFinish}>
      <div className="modal onboarding-modal" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-step-indicator">
          {steps.map((_, i) => (
            <span key={i} className={i === step ? 'active' : i < step ? 'done' : ''} />
          ))}
        </div>

        <div className="onboarding-icon">{current.icon}</div>
        <h2>{current.title}</h2>
        <p>{current.desc}</p>

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="ghost" onClick={() => setStep((s) => s - 1)}>
              上一步
            </button>
          )}
          {isLast ? (
            <button onClick={props.onFinish}>开始使用</button>
          ) : isApiStep ? (
            <button onClick={() => { props.onOpenSettings?.(); props.onFinish(); }}>现在去配置</button>
          ) : (
            <button onClick={() => setStep((s) => s + 1)}>下一步</button>
          )}
        </div>

        <button className="onboarding-skip" onClick={props.onFinish}>
          跳过引导
        </button>
      </div>
    </div>
  )
}
