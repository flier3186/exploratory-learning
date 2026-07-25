import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, LearningProfile } from '../types'
import { getNodePath } from '../learning'
import { loadState, saveState } from '../storage'
import { computeLearningProfile } from '../learning-profile'
import { useNodeActions } from './use-node-actions'
import { useSearch } from './use-search'
import { useReview } from './use-review'
import { useImportExport } from './use-import-export'
import { useQuiz } from './useQuiz'
import { useFeynman } from './useFeynman'
import { useKnowledgeGraph } from './use-knowledge-graph'
import { useLearningPath } from './use-learning-path'
import { useStreak } from './use-streak'

export function useAppState() {
  const [state, setState] = useState<AppState>(loadState)
  const [notice, setNotice] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-persist to localStorage
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        saveState(state)
      } catch {
        // Silent fail; UI can show a generic warning if needed
      }
    }, 600)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [state])

  const patchState = useCallback((updater: (draft: AppState) => AppState) => {
    setState((current) => updater(current))
  }, [])

  // Computed values that don't belong to any sub-hook
  const selectedTopic = useMemo(() => state.topics.find((t) => t.id === state.selectedTopicId) || null, [state.topics, state.selectedTopicId])
  const nodePath = useMemo(() => getNodePath(state.nodes, state.selectedNodeId), [state.nodes, state.selectedNodeId])
  const topicNodes = useMemo(() => Object.values(state.nodes).filter((n) => n.topic_id === state.selectedTopicId), [state.nodes, state.selectedTopicId])
  const profile: LearningProfile = useMemo(() => computeLearningProfile(state), [state])

  // Sub-hooks
  const nodeActions = useNodeActions({ state, setState })
  const { searchResults, tagCloud } = useSearch({ state })
  const { dueReviewCount, currentTopicReviewCount, starredReviewCount, reviewResults, srsDueCount } = useReview({ state })
  const { exportTopicAsTemplate, exportData, importData, clearAll, importBuiltInTemplate, importTemplateFile } = useImportExport({ state, setState })

  // Quiz and Feynman hooks
  const quiz = useQuiz({ state, setState })
  const feynman = useFeynman({ state, setState, setNotice })

  // P2: Knowledge Graph, Learning Path, Streak
  const knowledgeGraph = useKnowledgeGraph({ state })
  const learningPath = useLearningPath({ state })
  const streak = useStreak({ nodes: state.nodes })

  return {
    state,
    setState,
    patchState,
    notice,
    setNotice,
    selectedTopic,
    selectedNode: nodeActions.selectedNode,
    nodePath,
    topicNodes,
    profile,
    searchResults,
    tagCloud,
    dueReviewCount,
    currentTopicReviewCount,
    starredReviewCount,
    reviewResults,
    srsDueCount,
    createTopic: nodeActions.createTopic,
    selectNode: nodeActions.selectNode,
    openNode: nodeActions.openNode,
    addNode: nodeActions.addNode,
    updateNode: nodeActions.updateNode,
    toggleStar: nodeActions.toggleStar,
    setConfidence: nodeActions.setConfidence,
    setCheckStatus: nodeActions.setCheckStatus,
    recordFeedback: nodeActions.recordFeedback,
    replaceFollowups: nodeActions.replaceFollowups,
    toggleLink: nodeActions.toggleLink,
    exportTopicAsTemplate,
    exportData,
    importData,
    clearAll,
    importBuiltInTemplate,
    importTemplateFile,
    deleteNode: nodeActions.deleteNode,
    deleteTopic: nodeActions.deleteTopic,
    // Quiz
    quiz,
    // Feynman
    feynman,
    // P2: Knowledge Graph
    knowledgeGraph,
    // P2: Learning Path
    learningPath,
    // P2: Streak
    streak,
  }
}
