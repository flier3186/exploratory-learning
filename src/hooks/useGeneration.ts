import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, FollowupQuestion, GeneratedPayload, LearningNode, LearningRole } from '../types'
import { buildMainPrompt, callModel, safeParsePayload, validateGeneratedPayload } from '../ai'
import { buildContext, fallbackPayload, payloadToNode, roleFromFollowupType } from '../app-helpers'
import { uid } from '../utils'

export type BatchProgress =
  | { mode: 'serial'; current: number; total: number }
  | { mode: 'parallel'; total: number }
  | null

interface GenerateNodeResult {
  node: LearningNode | null
  notice?: string
  failedDraft?: { question: string; parentId: string | null; roleHint?: LearningRole }
}

export function useGeneration(
  state: AppState,
  selectedTopic: { title: string } | null,
  actions: {
    addNode: (node: LearningNode) => void
    openNode: (nodeId: string) => void
  },
  setNotice: (msg: string) => void,
  profileSummary?: string,
) {
  const [question, setQuestion] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [batchProgress, setBatchProgress] = useState<BatchProgress>(null)
  const [lastFailedDraft, setLastFailedDraft] = useState<{ question: string; parentId: string | null; roleHint?: LearningRole } | null>(null)
  const answerRef = useRef<HTMLDivElement | null>(null)

  // Generation step animation
  useEffect(() => {
    if (!isGenerating) {
      setGenerationStep(0)
      return
    }
    const timer = window.setInterval(() => {
      setGenerationStep((current) => Math.min(current + 1, 3))
    }, 4500)
    return () => window.clearInterval(timer)
  }, [isGenerating])

  // Pure helper: calls AI and builds a node, but does NOT mutate state (no addNode, no setIsGenerating, etc.)
  // Returns the constructed node or error information. Caller is responsible for state updates.
  const generateSingleNodeData = useCallback(async (
    inputQuestion: string,
    parentId: string | null,
    roleHint?: LearningRole,
  ): Promise<GenerateNodeResult> => {
    const clean = inputQuestion.trim()
    if (!clean) return { node: null }
    const topicId = state.selectedTopicId || uid('topic')

    try {
      let payload: GeneratedPayload
      let repaired = false
      if (state.apiKey.trim()) {
        const prompt = buildMainPrompt(clean, buildContext(state.nodes, selectedTopic, parentId), state.preference, roleHint, profileSummary)
        const content = await callModel(state.apiBase, state.apiKey.trim(), state.model, prompt)
        const parsed = safeParsePayload(content)
        if (parsed.payload) {
          payload = parsed.payload
          repaired = parsed.repaired
        } else {
          return {
            node: null,
            notice: '模型返回了乱码格式，没有生成卡片。再试一次通常就好了。',
            failedDraft: { question: clean, parentId, roleHint },
          }
        }
      } else {
        payload = fallbackPayload(clean, roleHint)
        const node = payloadToNode(payload, clean, topicId!, parentId, roleHint, false, false)
        node.quality.is_demo = true
        node.quality.source_required = false
        node.quality.generation_status = 'failed'
        node.quality.failure_reason = '未配置 API Key，本节点为本地模板。'
        return {
          node,
          notice: '当前未配置 API Key，已使用演示模式生成。',
        }
      }

      const validation = validateGeneratedPayload(payload, clean)
      if (!validation.ok) {
        return {
          node: null,
          notice: `模型回答缺少关键内容（${validation.errors.join('、')}），没有生成卡片。再试一次。`,
          failedDraft: { question: clean, parentId, roleHint },
        }
      }

      const node = payloadToNode(validation.normalized, clean, topicId!, parentId, roleHint, false, repaired || validation.warnings.length > 0)
      node.quality.is_demo = false
      node.quality.source_required = validation.factualRisk || Boolean(validation.normalized.source_note || validation.normalized.answer?.source_note)
      node.quality.validation_warnings = validation.warnings
      node.quality.generation_status = node.quality.source_required ? 'needs_verification' : node.quality.repaired ? 'repaired' : 'ok'
      return { node }
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      return {
        node: null,
        notice: `${message} 没有生成卡片，你可以检查设置或换个问题再试。`,
        failedDraft: { question: clean, parentId, roleHint },
      }
    }
  }, [state.apiKey, state.apiBase, state.model, state.preference, state.selectedTopicId, state.nodes, selectedTopic, profileSummary])

  const generateNode = useCallback(async (inputQuestion: string, parentId: string | null, roleHint?: LearningRole, skipAutoScroll = false): Promise<string | null> => {
    const clean = inputQuestion.trim()
    if (!clean) return null

    setIsGenerating(true)
    setGenerationStep(0)
    setNotice('')
    setLastFailedDraft(null)

    try {
      const result = await generateSingleNodeData(clean, parentId, roleHint)
      if (result.notice) {
        setNotice(result.notice)
      }
      if (result.failedDraft) {
        setLastFailedDraft(result.failedDraft)
      }
      if (!result.node) return null

      actions.addNode(result.node)
      setQuestion('')
      setLastFailedDraft(null)
      if (!skipAutoScroll) {
        window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
      }
      return result.node.id
    } finally {
      setIsGenerating(false)
    }
  }, [generateSingleNodeData, actions, setNotice])

  const generateFollowupBatch = useCallback(async (parentId: string, followups: FollowupQuestion[]) => {
    const limited = followups.slice(0, 3)
    if (!limited.length) return

    setIsGenerating(true)
    setGenerationStep(0)
    setNotice(`正在并行生成 ${limited.length} 个追问节点...`)
    setBatchProgress({ mode: 'parallel', total: limited.length })

    // Scroll to show generation progress immediately
    window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)

    // Step 1: Generate all nodes in parallel (network calls happen concurrently)
    const results = await Promise.all(
      limited.map((followup) =>
        generateSingleNodeData(followup.question, parentId, roleFromFollowupType(followup.type)),
      ),
    )

    // Step 2: Add all successfully generated nodes to state sequentially
    // (state updates are functional, so no race conditions; addNode uses setState updater form)
    let successCount = 0
    let firstFailedDraft: GenerateNodeResult['failedDraft'] = undefined
    for (const result of results) {
      if (result.node) {
        actions.addNode(result.node)
        successCount += 1
      } else if (result.failedDraft && !firstFailedDraft) {
        firstFailedDraft = result.failedDraft
      }
    }

    setBatchProgress(null)
    setIsGenerating(false)

    if (successCount > 0) {
      // Keep parent node selected so user sees the parent with updated children list
      actions.openNode(parentId)
      window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 160)
      if (successCount === limited.length) {
        setNotice(`已生成 ${successCount} 个追问节点，可在知识树中查看。`)
      } else {
        setNotice(`已生成 ${successCount}/${limited.length} 个追问节点，部分生成失败。`)
      }
    } else {
      if (firstFailedDraft) {
        setLastFailedDraft(firstFailedDraft)
      }
      setNotice('批量生成失败，没有节点被创建。')
    }
  }, [generateSingleNodeData, actions, setNotice])

  const batchGenerateTopic = useCallback(async (topicId: string) => {
    const pendingNodes = Object.values(state.nodes).filter(
      (n) => n.topic_id === topicId && n.quality.generation_status === 'pending',
    )
    if (!pendingNodes.length) {
      setNotice('当前主题下没有待生成的节点。')
      return
    }
    if (!state.apiKey.trim()) {
      setNotice('批量生成需要配置 API Key。')
      return
    }
    if (!confirm(`确定批量生成 ${pendingNodes.length} 个 pending 节点吗？这会消耗 ${pendingNodes.length} 次 API 调用。`)) return

    setNotice(`开始批量生成 ${pendingNodes.length} 个节点...`)
    let success = 0
    for (let i = 0; i < pendingNodes.length; i++) {
      const node = pendingNodes[i]
      setBatchProgress({ mode: 'serial', current: i + 1, total: pendingNodes.length })
      const nodeId = await generateNode(node.question, node.parent_id, node.learning_role)
      if (nodeId) success++
    }
    setBatchProgress(null)
    setNotice(`批量生成完成：${success}/${pendingNodes.length} 个节点成功。`)
  }, [state.nodes, state.apiKey, generateNode, setNotice])

  const retryLastFailedDraft = useCallback(() => {
    if (!lastFailedDraft) return
    setQuestion(lastFailedDraft.question)
    void generateNode(lastFailedDraft.question, lastFailedDraft.parentId, lastFailedDraft.roleHint)
  }, [lastFailedDraft, generateNode])

  return {
    question,
    setQuestion,
    isGenerating,
    generationStep,
    batchProgress,
    lastFailedDraft,
    answerRef,
    generateNode,
    generateFollowupBatch,
    batchGenerateTopic,
    retryLastFailedDraft,
  }
}
