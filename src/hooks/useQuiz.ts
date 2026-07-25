import { useState, useCallback, useRef, useMemo } from 'react'
import type { AppState, LearningNode } from '../types'
import { createQuizSession, generateQuizzesForNode, quizResultToQuality, type QuizSession, type QuizResult } from '../quiz-generator'
import { updateSRS, calculateNextReview } from '../spaced-repetition'
import { now } from '../utils'

interface UseQuizParams {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
}

export function useQuiz({ state, setState }: UseQuizParams) {
  const [session, setSession] = useState<QuizSession | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [results, setResults] = useState<QuizResult[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const questionStartTimeRef = useRef<number>(0)

  const currentQuiz = session ? session.quizzes[currentIndex] : null
  const currentNode = currentQuiz ? state.nodes[currentQuiz.nodeId] : null
  const progress = session ? `${currentIndex + 1} / ${session.totalQuestions}` : ''

  // 闪测会话统计
  const sessionStats = useMemo(() => {
    if (results.length === 0) return null
    const avgRating = results.reduce((s, r) => s + r.selfRating, 0) / results.length
    const perfectCount = results.filter((r) => r.selfRating === 3).length
    const fuzzyCount = results.filter((r) => r.selfRating === 1).length
    const forgotCount = results.filter((r) => r.selfRating === 0).length
    return { avgRating, perfectCount, fuzzyCount, forgotCount, total: results.length }
  }, [results])

  // 开始闪测会话：传入待复习的节点列表
  const startSession = useCallback((nodes: LearningNode[]) => {
    if (nodes.length === 0) return
    const newSession = createQuizSession(nodes)
    if (newSession.quizzes.length === 0) return
    setSession(newSession)
    setCurrentIndex(0)
    setShowAnswer(false)
    setResults([])
    setIsComplete(false)
    questionStartTimeRef.current = now()
  }, [])

  // 为单个节点开始闪测
  const startSingleNodeQuiz = useCallback((node: LearningNode) => {
    const quizzes = generateQuizzesForNode(node)
    if (quizzes.length === 0) return
    setSession({ quizzes, totalQuestions: quizzes.length, startedAt: now() })
    setCurrentIndex(0)
    setShowAnswer(false)
    setResults([])
    setIsComplete(false)
    questionStartTimeRef.current = now()
  }, [])

  // 揭晓答案
  const revealAnswer = useCallback(() => {
    setShowAnswer(true)
  }, [])

  // 自评并进入下一题
  const rateAndNext = useCallback((rating: QuizResult['selfRating']) => {
    if (!session || !currentQuiz) return

    const result: QuizResult = {
      quizId: currentQuiz.id,
      nodeId: currentQuiz.nodeId,
      selfRating: rating,
      timeSpentMs: now() - questionStartTimeRef.current,
      answeredAt: now(),
    }

    const newResults = [...results, result]

    // 更新 SRS 参数
    const quality = quizResultToQuality(rating)
    setState((current) => {
      const node = current.nodes[currentQuiz.nodeId]
      if (!node) return current
      const srs = updateSRS(
        node.mastery.srs_repetitions ?? 0,
        node.mastery.srs_ease_factor ?? 2.5,
        quality,
      )
      const nextReview = rating >= 2 ? calculateNextReview(srs.interval) : undefined
      return {
        ...current,
        nodes: {
          ...current.nodes,
          [currentQuiz.nodeId]: {
            ...node,
            mastery: {
              ...node.mastery,
              srs_interval: srs.interval,
              srs_ease_factor: srs.easeFactor,
              srs_repetitions: srs.repetitions,
              next_review_at: nextReview,
              confidence: rating >= 3 ? Math.min(5, (node.mastery.confidence ?? 3) + 1) as 1 | 2 | 3 | 4 | 5 : rating === 0 ? 1 as const : node.mastery.confidence,
              check_status: rating >= 3 ? 'understood' as const : rating <= 1 ? 'needs_review' as const : 'uncertain' as const,
            },
          },
        },
      }
    })

    setResults(newResults)

    // 检查是否还有下一题
    if (currentIndex + 1 < session.quizzes.length) {
      setCurrentIndex(currentIndex + 1)
      setShowAnswer(false)
      questionStartTimeRef.current = now()
    } else {
      setIsComplete(true)
    }
  }, [session, currentQuiz, results, currentIndex, setState])

  // 关闭闪测
  const closeSession = useCallback(() => {
    setSession(null)
    setCurrentIndex(0)
    setShowAnswer(false)
    setResults([])
    setIsComplete(false)
  }, [])

  // 跳过当前题
  const skipCurrent = useCallback(() => {
    if (!session) return
    if (currentIndex + 1 < session.quizzes.length) {
      setCurrentIndex(currentIndex + 1)
      setShowAnswer(false)
      questionStartTimeRef.current = now()
    } else {
      setIsComplete(true)
    }
  }, [session, currentIndex])

  return {
    session,
    currentQuiz,
    currentNode,
    currentIndex,
    progress,
    showAnswer,
    results,
    isComplete,
    sessionStats,
    startSession,
    startSingleNodeQuiz,
    revealAnswer,
    rateAndNext,
    closeSession,
    skipCurrent,
  }
}
