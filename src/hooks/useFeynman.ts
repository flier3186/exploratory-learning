import { useState, useCallback } from 'react'
import type { AppState, LearningNode } from '../types'
import { buildFeynmanPrompt, type FeynmanFeedback } from '../quiz-generator'
import { callModel, cleanJsonText } from '../ai'
import { updateSRS, calculateNextReview } from '../spaced-repetition'

interface UseFeynmanParams {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  setNotice: (msg: string) => void
}

export function useFeynman({ state, setState, setNotice }: UseFeynmanParams) {
  const [activeNode, setActiveNode] = useState<LearningNode | null>(null)
  const [explanation, setExplanation] = useState('')
  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<FeynmanFeedback | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  // 打开费曼检验面板
  const openFeynman = useCallback((node: LearningNode) => {
    if (!state.apiKey) {
      setNotice('费曼检验需要配置 API Key，请先到设置里配置。')
      return
    }
    setActiveNode(node)
    setExplanation('')
    setMode('text')
    setFeedback(null)
    setIsSubmitting(false)
    setIsOpen(true)
  }, [state.apiKey, setNotice])

  // 关闭面板
  const closeFeynman = useCallback(() => {
    setIsOpen(false)
    setActiveNode(null)
    setExplanation('')
    setFeedback(null)
    setIsSubmitting(false)
  }, [])

  // 提交费曼解释，请求 AI 评估
  const submitExplanation = useCallback(async () => {
    if (!activeNode || !explanation.trim() || isSubmitting) return

    setIsSubmitting(true)
    setFeedback(null)

    const userPrompt = `${buildFeynmanPrompt(activeNode)}\n\n学生的解释：${explanation.trim()}`

    try {
      const raw = await callModel(state.apiBase, state.apiKey, state.model, userPrompt, 1)

      // 解析费曼评估 JSON（与学习卡片格式不同）
      const cleaned = cleanJsonText(raw)
      let feynmanFeedback: FeynmanFeedback | null = null

      try {
        const parsed = JSON.parse(cleaned)
        // 验证必要字段
        if (parsed.score && parsed.overall) {
          const score = Math.max(1, Math.min(5, Number(parsed.score))) as 1 | 2 | 3 | 4 | 5
          feynmanFeedback = {
            score,
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter(Boolean).slice(0, 5) : [],
            gaps: Array.isArray(parsed.gaps) ? parsed.gaps.filter(Boolean).slice(0, 5) : [],
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter(Boolean).slice(0, 3) : [],
            overall: String(parsed.overall || '评估完成'),
          }
        }
      } catch {
        // JSON 解析失败
      }

      if (!feynmanFeedback) {
        setNotice('AI 返回的评估格式有误，请重试。')
        return
      }

      setFeedback(feynmanFeedback)

      // 更新 SRS 参数
      const quality = feynmanFeedback.score >= 4 ? 5 : feynmanFeedback.score === 3 ? 3 : feynmanFeedback.score === 2 ? 2 : 1
      setState((current) => {
        const node = current.nodes[activeNode.id]
        if (!node) return current
        const srs = updateSRS(
          node.mastery.srs_repetitions ?? 0,
          node.mastery.srs_ease_factor ?? 2.5,
          quality,
        )
        const nextReview = feynmanFeedback.score >= 3 ? calculateNextReview(srs.interval) : undefined
        return {
          ...current,
          nodes: {
            ...current.nodes,
            [activeNode.id]: {
              ...node,
              mastery: {
                ...node.mastery,
                srs_interval: srs.interval,
                srs_ease_factor: srs.easeFactor,
                srs_repetitions: srs.repetitions,
                next_review_at: nextReview,
                confidence: feynmanFeedback.score as 1 | 2 | 3 | 4 | 5,
                check_status: feynmanFeedback.score >= 4 ? 'understood' as const : feynmanFeedback.score <= 2 ? 'needs_review' as const : 'uncertain' as const,
              },
            },
          },
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '评估失败'
      setNotice(`费曼评估失败：${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }, [activeNode, explanation, isSubmitting, state, setState, setNotice])

  // 重置为输入状态（"再试一次"按钮）
  const resetFeynman = useCallback(() => {
    setExplanation('')
    setFeedback(null)
    setMode('text')
    setIsSubmitting(false)
  }, [])

  return {
    isOpen,
    activeNode,
    explanation,
    mode,
    isSubmitting,
    feedback,
    openFeynman,
    closeFeynman,
    setExplanation,
    submitExplanation,
    resetFeynman,
  }
}
