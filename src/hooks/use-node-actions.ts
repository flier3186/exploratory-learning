import { useCallback, useMemo } from 'react'
import type { AppState, CheckStatus, FeedbackValue, FollowupQuestion, FollowupType, LearningNode, Topic } from '../types'
import { clampText, now, uid } from '../utils'
import { checkStatusToQuality, updateSRS, calculateNextReview, resetSRS, SRS_CONFIG } from '../spaced-repetition'

interface UseNodeActionsParams {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
}

export function useNodeActions({ state, setState }: UseNodeActionsParams) {
  const selectedNode = useMemo(
    () => (state.selectedNodeId ? state.nodes[state.selectedNodeId] : null),
    [state.nodes, state.selectedNodeId],
  )

  const selectNode = useCallback((nodeId: string) => {
    setState((current) => ({
      ...current,
      selectedNodeId: nodeId,
      nodes: {
        ...current.nodes,
        [nodeId]: {
          ...current.nodes[nodeId],
          last_accessed_at: now(),
          mastery: {
            ...current.nodes[nodeId].mastery,
            is_visited: true,
          },
        },
      },
    }))
  }, [setState])

  const openNode = useCallback((nodeId: string) => {
    setState((current) => {
      const node = current.nodes[nodeId]
      if (!node) return current
      return {
        ...current,
        selectedTopicId: node.topic_id,
        selectedNodeId: nodeId,
        nodes: {
          ...current.nodes,
          [nodeId]: {
            ...node,
            last_accessed_at: now(),
            mastery: {
              ...node.mastery,
              is_visited: true,
            },
          },
        },
      }
    })
  }, [setState])

  const addNode = useCallback((node: LearningNode) => {
    setState((current) => {
      const nodes = { ...current.nodes, [node.id]: node }
      const hasTopic = current.topics.some((topic) => topic.id === node.topic_id)
      if (node.parent_id && nodes[node.parent_id]) {
        nodes[node.parent_id] = {
          ...nodes[node.parent_id],
          links: {
            ...nodes[node.parent_id].links,
            children_ids: [...nodes[node.parent_id].links.children_ids, node.id],
          },
        }
      }
      return {
        ...current,
        nodes,
        selectedNodeId: node.id,
        selectedTopicId: node.topic_id,
        topics: hasTopic
          ? current.topics.map((topic) => (topic.id === node.topic_id ? { ...topic, last_accessed_at: now() } : topic))
          : [
              {
                id: node.topic_id,
                title: clampText(node.question, 18),
                created_at: now(),
                last_accessed_at: now(),
              },
              ...current.topics,
            ],
      }
    })
  }, [setState])

  const updateNode = useCallback((nodeId: string, updater: (node: LearningNode) => LearningNode) => {
    setState((current) => ({
      ...current,
      nodes: {
        ...current.nodes,
        [nodeId]: updater(current.nodes[nodeId]),
      },
    }))
  }, [setState])

  const deleteNode = useCallback((nodeId: string) => {
    setState((current) => {
      const node = current.nodes[nodeId]
      if (!node) return current

      const toDelete = new Set<string>([nodeId])
      const queue = [nodeId]
      while (queue.length > 0) {
        const currentId = queue.shift()!
        for (const candidate of Object.values(current.nodes)) {
          if (candidate.parent_id === currentId && !toDelete.has(candidate.id)) {
            toDelete.add(candidate.id)
            queue.push(candidate.id)
          }
        }
      }

      const count = toDelete.size
      const label = count > 1 ? `「${node.short_title}」及其 ${count - 1} 个子节点` : `「${node.short_title}」`
      if (!confirm(`确定删除 ${label} 吗？删除后无法恢复。`)) return current

      const nodes = { ...current.nodes }
      for (const id of toDelete) {
        const target = nodes[id]
        if (target?.parent_id && nodes[target.parent_id]) {
          nodes[target.parent_id] = {
            ...nodes[target.parent_id],
            links: {
              ...nodes[target.parent_id].links,
              children_ids: nodes[target.parent_id].links.children_ids.filter((cid) => cid !== id),
            },
          }
        }
        delete nodes[id]
      }

      for (const [id, node] of Object.entries(nodes)) {
        const links = node.links
        const dirty =
          links.related_node_ids.some((cid) => toDelete.has(cid)) ||
          links.prerequisite_node_ids.some((cid) => toDelete.has(cid))
        if (dirty) {
          nodes[id] = {
            ...node,
            links: {
              ...links,
              related_node_ids: links.related_node_ids.filter((cid) => !toDelete.has(cid)),
              prerequisite_node_ids: links.prerequisite_node_ids.filter((cid) => !toDelete.has(cid)),
            },
          }
        }
      }

      const wasSelected = current.selectedNodeId === nodeId || toDelete.has(current.selectedNodeId || '')
      return {
        ...current,
        nodes,
        selectedNodeId: wasSelected ? null : current.selectedNodeId,
      }
    })
  }, [setState])

  const createTopic = useCallback((title: string) => {
    const clean = title.trim()
    if (!clean) return
    const topic: Topic = {
      id: uid('topic'),
      title: clean,
      created_at: now(),
      last_accessed_at: now(),
    }
    setState((current) => ({
      ...current,
      topics: [topic, ...current.topics],
      selectedTopicId: topic.id,
      selectedNodeId: null,
    }))
  }, [setState])

  const deleteTopic = useCallback((topicId: string) => {
    setState((current) => {
      const topic = current.topics.find((t) => t.id === topicId)
      if (!topic) return current

      const nodeCount = Object.values(current.nodes).filter((n) => n.topic_id === topicId).length
      if (nodeCount > 0) {
        if (!confirm(`「${topic.title}」下有 ${nodeCount} 个学习节点，删除后无法恢复。确定删除吗？`)) return current
      } else {
        if (!confirm(`确定删除分类「${topic.title}」吗？`)) return current
      }

      const deletedIds = new Set(Object.keys(current.nodes).filter((id) => current.nodes[id].topic_id === topicId))
      const nodes = { ...current.nodes }
      for (const id of deletedIds) delete nodes[id]

      for (const [id, node] of Object.entries(nodes)) {
        const links = node.links
        const dirty =
          links.children_ids.some((cid) => deletedIds.has(cid)) ||
          links.related_node_ids.some((cid) => deletedIds.has(cid)) ||
          links.prerequisite_node_ids.some((cid) => deletedIds.has(cid))
        if (dirty) {
          nodes[id] = {
            ...node,
            links: {
              children_ids: links.children_ids.filter((cid) => !deletedIds.has(cid)),
              related_node_ids: links.related_node_ids.filter((cid) => !deletedIds.has(cid)),
              prerequisite_node_ids: links.prerequisite_node_ids.filter((cid) => !deletedIds.has(cid)),
            },
          }
        }
      }

      const topics = current.topics.filter((t) => t.id !== topicId)
      const selectedTopicId = current.selectedTopicId === topicId ? (topics[0]?.id || null) : current.selectedTopicId

      return {
        ...current,
        topics,
        nodes,
        selectedTopicId,
        selectedNodeId: current.selectedTopicId === topicId ? null : current.selectedNodeId,
      }
    })
  }, [setState])

  const toggleStar = useCallback((nodeId: string) => {
    updateNode(nodeId, (node) => ({
      ...node,
      mastery: {
        ...node.mastery,
        is_starred: !node.mastery.is_starred,
      },
    }))
  }, [updateNode])

  const setConfidence = useCallback((nodeId: string, confidence: 1 | 2 | 3 | 4 | 5) => {
    updateNode(nodeId, (node) => {
      // SM-2: 低信心值重置，高信心值更新
      const srs = confidence <= 2
        ? resetSRS()
        : updateSRS(
            node.mastery.srs_repetitions ?? 0,
            node.mastery.srs_ease_factor ?? SRS_CONFIG.DEFAULT_EASE_FACTOR,
            confidence, // 用 confidence 作为 quality 的近似
          )
      const nextReview = confidence <= 2 ? undefined : calculateNextReview(srs.interval)

      return {
        ...node,
        mastery: {
          ...node.mastery,
          confidence,
          review_later: confidence <= 2,
          check_status: confidence >= 4 ? 'understood' : confidence <= 2 ? 'needs_review' : node.mastery.check_status,
          srs_interval: srs.interval,
          srs_ease_factor: srs.easeFactor,
          srs_repetitions: srs.repetitions,
          next_review_at: nextReview,
        },
      }
    })
  }, [updateNode])

  const setCheckStatus = useCallback((nodeId: string, status: Exclude<CheckStatus, 'untested'>) => {
    const confidence = status === 'understood' ? 4 : status === 'uncertain' ? 3 : 2
    updateNode(nodeId, (node) => {
      // SM-2: 根据检查状态更新间隔复习参数
      const quality = checkStatusToQuality(status)
      const srs = updateSRS(
        node.mastery.srs_repetitions ?? 0,
        node.mastery.srs_ease_factor ?? SRS_CONFIG.DEFAULT_EASE_FACTOR,
        quality,
      )
      const nextReview = calculateNextReview(srs.interval)

      return {
        ...node,
        mastery: {
          ...node.mastery,
          confidence,
          check_status: status,
          checked_at: now(),
          review_later: status !== 'understood',
          srs_interval: srs.interval,
          srs_ease_factor: srs.easeFactor,
          srs_repetitions: srs.repetitions,
          next_review_at: nextReview,
        },
      }
    })
  }, [updateNode])

  const recordFeedback = useCallback((nodeId: string, followupId: string, feedback: FeedbackValue) => {
    setState((current) => {
      const node = current.nodes[nodeId]
      const followup = node?.followups.find((item) => item.id === followupId)
      if (!node || !followup) return current

      const followupItem = followup
      const previousFeedback = followup.user_feedback
      const nextFeedback = previousFeedback === feedback ? undefined : feedback
      const preference = { ...current.preference }
      const preferred = { ...preference.preferred_followup_types }
      const disliked = { ...preference.disliked_followup_types }
      const positive = [...preference.recent_positive_examples]
      const negative = [...preference.recent_negative_examples]

      function applyFeedback(value: FeedbackValue | undefined, sign: 1 | -1) {
        if (!value) return
        const target = value === 'helpful' ? preferred : disliked
        target[followupItem.type] = Math.max(0, (target[followupItem.type] || 0) + sign)
        if (value === 'helpful') {
          if (sign === 1) positive.push(followupItem.question)
          if (sign === -1) {
            const index = positive.indexOf(followupItem.question)
            if (index >= 0) positive.splice(index, 1)
          }
        } else {
          if (sign === 1) negative.push(followupItem.question)
          if (sign === -1) {
            const index = negative.indexOf(followupItem.question)
            if (index >= 0) negative.splice(index, 1)
          }
        }
      }

      applyFeedback(previousFeedback, -1)
      applyFeedback(nextFeedback, 1)

      let difficulty = preference.difficulty_preference
      if (nextFeedback === 'too_easy') difficulty = 'harder'
      if (nextFeedback === 'too_hard') difficulty = 'easier'

      return {
        ...current,
        nodes: {
          ...current.nodes,
          [nodeId]: {
            ...node,
            followups: node.followups.map((fu) => (fu.id === followupId ? { ...fu, user_feedback: nextFeedback } : fu)),
          },
        },
        preference: {
          ...preference,
          preferred_followup_types: preferred,
          disliked_followup_types: disliked,
          difficulty_preference: difficulty,
          recent_positive_examples: positive.slice(-12),
          recent_negative_examples: negative.slice(-12),
          updated_at: now(),
        },
      }
    })
  }, [setState])

  const replaceFollowups = useCallback((selectedNode: LearningNode, angle: 'batch' | 'foundation' | 'application' | 'challenge' | 'system') => {
    const angleMap: Record<typeof angle, Array<[FollowupType, string, string]>> = {
      batch: [
        ['comparison', '它和相近概念有什么区别？', '换一个辨析角度，避免重复上一批推荐。'],
        ['connection', '它和我已经学过的知识怎么连接？', '把当前节点放回知识体系。'],
        ['practice', '给我一道能检验理解的小题。', '用练习确认是否真的理解。'],
        ['boundary', '它最容易被用错的情况是什么？', '通过边界减少误用。'],
        ['application', '它在真实项目里会怎么出现？', '连接实际场景。'],
      ],
      foundation: [
        ['foundation', '理解它之前需要知道哪些基础概念？', '补齐前置知识。'],
        ['example', '能不能用一个生活例子重新解释？', '先建立直觉。'],
        ['foundation', '这个概念最小可理解版本是什么？', '降低理解门槛。'],
        ['practice', '能不能给一道很简单的判断题？', '用低难度题确认基础。'],
        ['comparison', '它和一个常见概念有什么区别？', '用对比辅助记忆。'],
      ],
      application: [
        ['application', '它在真实场景中解决什么问题？', '把知识连接到实际用途。'],
        ['application', '能不能给一个产品或工程案例？', '通过案例形成记忆。'],
        ['practice', '如果让我应用它，第一步该怎么做？', '从理解转向使用。'],
        ['connection', '它能和哪些工具或方法配合？', '扩展应用网络。'],
        ['boundary', '应用它时最常见的坑是什么？', '避免错误迁移。'],
      ],
      challenge: [
        ['challenge', '这个说法有什么反例？', '用反例测试理解强度。'],
        ['boundary', '它的适用边界在哪里？', '避免把概念用过头。'],
        ['comparison', '有没有另一种理论会反对它？', '建立批判性理解。'],
        ['mechanism', '它成立依赖哪些隐藏假设？', '追问底层前提。'],
        ['practice', '给我一道容易答错的题。', '检验是否真正掌握。'],
      ],
      system: [
        ['connection', '它在整个知识体系里处在哪一层？', '建立结构感。'],
        ['mechanism', '它的上游和下游概念是什么？', '理解知识关系。'],
        ['comparison', '和它相邻的三个概念分别是什么？', '扩展知识地图。'],
        ['foundation', '如果要系统学习，前置路线是什么？', '规划学习顺序。'],
        ['connection', '能不能把这一支整理成小结？', '为后续复习做准备。'],
      ],
    }

    const suffix = selectedNode.short_title
    const next = angleMap[angle].map(([type, title, reason]) => ({
      id: uid('fu'),
      question: `${title.replace('它', `"${suffix}"`)}`,
      type,
      reason,
      difficulty: angle === 'foundation' ? 1 : angle === 'challenge' ? 4 : 2,
      expected_gain: '获得一个不同角度的下一步。',
    })) as FollowupQuestion[]

    updateNode(selectedNode.id, (node) => ({
      ...node,
      followups: next,
    }))

    setState((current) => ({
      ...current,
      preference: {
        ...current.preference,
        preferred_followup_types:
          angle === 'batch'
            ? current.preference.preferred_followup_types
            : {
                ...current.preference.preferred_followup_types,
                [angle === 'system' ? 'connection' : angle]: (current.preference.preferred_followup_types[angle] || 0) + 1,
              },
        updated_at: now(),
      },
    }))
  }, [setState, updateNode])

  return {
    selectedNode,
    selectNode,
    openNode,
    addNode,
    updateNode,
    deleteNode,
    createTopic,
    deleteTopic,
    toggleStar,
    setConfidence,
    setCheckStatus,
    recordFeedback,
    replaceFollowups,
  }
}
