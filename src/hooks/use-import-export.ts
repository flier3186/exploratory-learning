import { useCallback } from 'react'
import type { AppState } from '../types'
import { APP_STATE_VERSION, initialState } from '../constants'
import { normalizeState, normalizeTemplateState } from '../storage'

interface UseImportExportParams {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
}

export function useImportExport({ state, setState }: UseImportExportParams) {
  const exportTopicAsTemplate = useCallback((topicId: string) => {
    const topic = state.topics.find((t) => t.id === topicId)
    if (!topic) return null

    const topicNodes = Object.values(state.nodes).filter((n) => n.topic_id === topicId)
    if (!topicNodes.length) return null

    const cleanNodes: Record<string, unknown> = {}
    for (const node of topicNodes) {
      cleanNodes[node.id] = {
        id: node.id,
        topic_id: node.topic_id,
        parent_id: node.parent_id,
        question: node.question,
        short_title: node.short_title,
        one_line_memory: node.one_line_memory,
        tags: node.tags,
        question_type: node.question_type,
        learning_role: node.learning_role,
        _learning_goal: node._learning_goal || undefined,
        answer: node.answer,
        fact_check: node.fact_check,
        followups: node.followups.map((fu) => ({
          id: fu.id,
          question: fu.question,
          type: fu.type,
          reason: fu.reason,
          difficulty: fu.difficulty,
          expected_gain: fu.expected_gain,
        })),
        checks: node.checks.map((c) => ({
          id: c.id,
          prompt: c.prompt,
          intent: c.intent,
          hint: c.hint,
        })),
        quality: {
          is_demo: false,
          generation_status: 'pending',
          parse_failed: false,
          repaired: false,
          regenerated_count: 0,
          source_required: node.quality.source_required,
          validation_errors: [],
          validation_warnings: [],
        },
        links: node.links,
        created_at: node.created_at,
        last_accessed_at: node.created_at,
      }
    }

    return {
      _template: true,
      _template_meta: {
        title: topic.title,
        author: '用户导出',
        description: topic.goal || `围绕「${topic.title}」的知识树模板`,
        version: '1.0.0',
        node_count: topicNodes.length,
        tags: [...new Set(topicNodes.flatMap((n) => n.tags))].slice(0, 6),
      },
      topics: [{
        id: topic.id,
        title: topic.title,
        goal: topic.goal,
        created_at: 0,
        last_accessed_at: 0,
      }],
      nodes: cleanNodes,
    }
  }, [state.topics, state.nodes])

  const exportData = useCallback(() => {
    return {
      version: APP_STATE_VERSION,
      exported_at: new Date().toISOString(),
      app: '探索式 AI 学习工具',
      data: {
        topics: state.topics,
        nodes: state.nodes,
        selectedTopicId: state.selectedTopicId,
        selectedNodeId: state.selectedNodeId,
        preference: state.preference,
        model: state.model,
      },
    }
  }, [state])

  const importData = useCallback((raw: Record<string, unknown>) => {
    const data = raw.data || raw
    setState((current) => normalizeState(data, current))
  }, [setState])

  const clearAll = useCallback(() => {
    setState(initialState)
  }, [setState])

  const importBuiltInTemplate = useCallback(async (templateData: Record<string, unknown>) => {
    const templateTopicId = Array.isArray(templateData.topics) ? (templateData.topics[0] as { id?: string })?.id : null
    const meta = templateData._template_meta as { title?: string } | undefined

    let noticeMsg: string | null = null
    setState((prev) => {
      if (templateTopicId && prev.topics.some((t) => t.id === templateTopicId)) {
        noticeMsg = `「${meta?.title || '模板'}」已经导入过了。`
        return prev
      }
      const merged = normalizeTemplateState(templateData, prev)
      const newNodeCount = Object.keys(merged.nodes).length - Object.keys(prev.nodes).length
      if (newNodeCount === 0) {
        noticeMsg = '模板没有包含可导入的新节点。'
        return prev
      }
      const rootId = templateTopicId
        ? Object.values(merged.nodes).find((n) => n.topic_id === templateTopicId && !n.parent_id)?.id || null
        : null
      noticeMsg = `「${meta?.title || '模板'}」已导入，包含 ${newNodeCount} 个学习节点。点击节点开始探索！`
      return {
        ...merged,
        selectedTopicId: templateTopicId || merged.selectedTopicId,
        selectedNodeId: rootId || null,
      }
    })

    return noticeMsg
  }, [setState])

  const importTemplateFile = useCallback((templateData: Record<string, unknown>) => {
    const meta = templateData._template_meta as { title?: string } | undefined
    const templateTopicId = Array.isArray(templateData.topics) ? templateData.topics[0]?.id : null

    let noticeMsg: string | null = null
    setState((prev) => {
      if (templateTopicId && prev.topics.some((t) => t.id === templateTopicId)) {
        noticeMsg = `「${meta?.title || '本地文件'}」已经导入过了。`
        return prev
      }
      const merged = normalizeTemplateState(templateData, prev)
      const newNodeCount = Object.keys(merged.nodes).length - Object.keys(prev.nodes).length
      if (newNodeCount === 0) {
        noticeMsg = '该模板没有包含可导入的新节点（可能已导入过）。'
        return prev
      }
      const rootId = templateTopicId
        ? Object.values(merged.nodes).find((n) => n.topic_id === templateTopicId && !n.parent_id)?.id || null
        : null
      noticeMsg = `模板「${meta?.title || '本地文件'}」已导入，包含 ${newNodeCount} 个节点。`
      return {
        ...merged,
        selectedTopicId: templateTopicId || merged.selectedTopicId,
        selectedNodeId: rootId || null,
      }
    })

    return noticeMsg
  }, [setState])

  return {
    exportTopicAsTemplate,
    exportData,
    importData,
    clearAll,
    importBuiltInTemplate,
    importTemplateFile,
  }
}
