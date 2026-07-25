import type { AppState, CheckStatus, FollowupType, LearningRole, UnderstandingCheck, UserPreference } from './types'

export const STORAGE_KEY = 'exploratory-learning-v31-state'
export const APP_STATE_VERSION = 2

export const ROLE_META: Record<LearningRole, { label: string; tone: string }> = {
  root: { label: '根', tone: 'role-root' },
  foundation: { label: '基础', tone: 'role-foundation' },
  mechanism: { label: '机制', tone: 'role-mechanism' },
  application: { label: '应用', tone: 'role-application' },
  comparison: { label: '比较', tone: 'role-comparison' },
  boundary: { label: '边界', tone: 'role-boundary' },
  practice: { label: '练习', tone: 'role-practice' },
  review: { label: '复习', tone: 'role-review' },
}

export const FOLLOWUP_LABEL: Record<FollowupType, string> = {
  foundation: '补基础',
  mechanism: '看机制',
  boundary: '辨边界',
  example: '要例子',
  application: '看应用',
  comparison: '做比较',
  challenge: '有挑战',
  connection: '连知识',
  practice: '做练习',
}

export const CHECK_INTENT_LABEL: Record<UnderstandingCheck['intent'], string> = {
  recall: '主动回忆',
  application: '应用迁移',
  boundary: '边界辨析',
}

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  untested: '未检测',
  understood: '已理解',
  uncertain: '不稳定',
  needs_review: '待复习',
}

export const initialPreference: UserPreference = {
  preferred_followup_types: {},
  disliked_followup_types: {},
  difficulty_preference: 'balanced',
  recent_positive_examples: [],
  recent_negative_examples: [],
  updated_at: Date.now(),
}

export const LEARNING_PROFILE_VERSION = 1

export const initialState: AppState = {
  topics: [],
  nodes: {},
  selectedTopicId: null,
  selectedNodeId: null,
  apiKey: '',
  apiBase: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-v4-flash',
  preference: initialPreference,
}
