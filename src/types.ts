export type QuestionType = 'concept' | 'mechanism' | 'comparison' | 'fact' | 'application' | 'challenge'

export type LearningRole =
  | 'root'
  | 'foundation'
  | 'mechanism'
  | 'application'
  | 'comparison'
  | 'boundary'
  | 'practice'
  | 'review'

export type FollowupType =
  | 'foundation'
  | 'mechanism'
  | 'boundary'
  | 'example'
  | 'application'
  | 'comparison'
  | 'challenge'
  | 'connection'
  | 'practice'

export type FeedbackValue = 'helpful' | 'not_interested' | 'too_easy' | 'too_hard' | 'irrelevant'
export type DifficultyPreference = 'easier' | 'balanced' | 'harder'
export type CheckStatus = 'untested' | 'understood' | 'uncertain' | 'needs_review'
export type ReviewFilter = 'all' | 'due' | 'uncertain' | 'starred' | 'current-topic'
export type ReviewReason = '稍后复习' | '需要复习' | '还有点虚' | '未检测' | '低掌握度' | '星标回看'
export type GenerationStatus = 'ok' | 'repaired' | 'needs_verification' | 'failed' | 'pending'

export interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: {
    transcript: string
  }
}

export interface SpeechRecognitionEventLike {
  resultIndex: number
  results: {
    length: number
    [index: number]: SpeechRecognitionResultLike
  }
}

export interface SpeechRecognitionErrorEventLike {
  error: string
  message?: string
}

export interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  start: () => void
  stop: () => void
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export interface Topic {
  id: string
  title: string
  goal?: string
  created_at: number
  last_accessed_at: number
}

export interface FollowupQuestion {
  id: string
  question: string
  type: FollowupType
  reason: string
  difficulty: 1 | 2 | 3 | 4 | 5
  expected_gain: string
  novelty_score?: number
  user_feedback?: FeedbackValue
}

export interface UnderstandingCheck {
  id: string
  prompt: string
  intent: 'recall' | 'application' | 'boundary'
  hint: string
}

export interface FactCheckBlock {
  explainable: string[]
  to_verify: string[]
  suggested_sources: string[]
  avoid_conclusions: string[]
}

export interface LearningNode {
  id: string
  topic_id: string
  parent_id: string | null
  question: string
  short_title: string
  one_line_memory: string
  tags: string[]
  question_type: QuestionType
  learning_role: LearningRole
  answer: {
    summary: string
    plain: string
    mechanism: string
    misunderstandings: string[]
    example: string
    source_note?: string
  }
  fact_check: FactCheckBlock
  followups: FollowupQuestion[]
  checks: UnderstandingCheck[]
  quality: {
    parse_failed: boolean
    repaired: boolean
    regenerated_count: number
    source_required: boolean
    is_demo: boolean
    generation_status: GenerationStatus
    validation_errors: string[]
    validation_warnings: string[]
    failure_reason?: string
    user_rating?: 1 | 2 | 3 | 4 | 5
  }
  mastery: {
    is_visited: boolean
    is_starred: boolean
    confidence?: 1 | 2 | 3 | 4 | 5
    review_later: boolean
    check_status: CheckStatus
    checked_at?: number
    // SM-2 间隔复习字段（可选，确保向后兼容）
    srs_interval?: number     // 当前复习间隔（天），默认 1
    srs_ease_factor?: number  // 难度因子，默认 2.5
    srs_repetitions?: number  // 连续正确次数，默认 0
    next_review_at?: number   // 下次复习时间戳（毫秒），默认 undefined
  }
  links: {
    children_ids: string[]
    related_node_ids: string[]
    prerequisite_node_ids: string[]
  }
  search_index: {
    text: string
    updated_at: number
  }
  _learning_goal?: string
  created_at: number
  last_accessed_at: number
}

export interface UserPreference {
  preferred_followup_types: Record<string, number>
  disliked_followup_types: Record<string, number>
  difficulty_preference: DifficultyPreference
  recent_positive_examples: string[]
  recent_negative_examples: string[]
  updated_at: number
}

/** 单个领域（Topic）的能力快照 */
export interface TopicCompetence {
  topic_id: string
  node_count: number
  avg_confidence: number      // 0-5 平均掌握度
  check_pass_rate: number     // 0-1 理解检测通过率
  depth: number               // 知识树最大深度
  weak_roles: string[]         // 薄弱的学习角色（通过率最低的 2 个）
  last_active_at: number
}

/** 认知风格快照 */
export interface CognitiveStyle {
  /** 各 intent 检测通过率 */
  intent_pass_rates: Record<string, number>  // recall/application/boundary → 0-1
  /** 偏好的追问类型 top 3 */
  preferred_followup_types: string[]
  /** 偏好的内容类型（基于追问类型加权） */
  content_preference: 'example_driven' | 'mechanism_driven' | 'balanced'
  /** 难度倾向（基于实际选择的追问难度均值） */
  actual_difficulty: number  // 1-5
}

/** 学习节奏 */
export interface LearningRhythm {
  /** 平均每次学习会话的节点数 */
  avg_nodes_per_session: number
  /** 活跃天数（过去 30 天有学习行为的天数） */
  active_days_30: number
  /** 平均会话间隔（小时） */
  avg_session_gap_hours: number
  /** 偏好时段（基于 created_at 统计） */
  preferred_time_of_day: 'morning' | 'afternoon' | 'evening' | 'night' | 'unknown'
}

/** 知识盲区 */
export interface KnowledgeGap {
  /** 缺失的前置概念（标签存在于其他 Topic 但当前 Topic 没有） */
  missing_prerequisites: string[]
  /** 知识树中从未被访问过的分支（有子节点但父节点从未被访问） */
  unvisited_branches: string[]
  /** 高相关但从未追问的方向（基于标签关联但无对应节点） */
  unexplored_directions: string[]
}

/** 学习画像 — 完全由行为数据自动生成 */
export interface LearningProfile {
  /** 画像版本，用于后续结构升级时的迁移 */
  version: number
  /** 更新时间 */
  updated_at: number
  /** 总体统计 */
  total_nodes: number
  total_topics: number
  total_study_days: number
  /** 各领域能力 */
  topic_competence: TopicCompetence[]
  /** 认知风格 */
  cognitive_style: CognitiveStyle
  /** 学习节奏 */
  learning_rhythm: LearningRhythm
  /** 知识盲区 */
  knowledge_gaps: KnowledgeGap
}

export interface AppState {
  topics: Topic[]
  nodes: Record<string, LearningNode>
  selectedTopicId: string | null
  selectedNodeId: string | null
  apiKey: string
  apiBase: string
  model: string
  preference: UserPreference
}

export interface GeneratedPayload {
  question_type?: QuestionType
  learning_role?: LearningRole
  short_title?: string
  one_line_memory?: string
  tags?: string[]
  source_note?: string
  answer?: {
    summary?: string
    plain?: string
    mechanism?: string
    misunderstandings?: string[]
    example?: string
    source_note?: string
  }
  fact_check?: Partial<FactCheckBlock>
  followups?: Array<Partial<FollowupQuestion>>
  checks?: Array<Partial<UnderstandingCheck>>
  keywords?: string[]
}

export interface SearchResult {
  node: LearningNode
  score: number
  path: string
  matched: string
}

export interface ReviewResult {
  node: LearningNode
  score: number
  path: string
  reasons: ReviewReason[]
}

export interface GenerationDraft {
  question: string
  parentId: string | null
  roleHint?: LearningRole
}

// ===== P2: Knowledge Graph & Learning Path =====

/** Graph node after layout computation */
export interface GraphLayoutNode {
  id: string
  x: number
  y: number
  layer: number
  role: LearningRole
  mastery: { confidence?: 1|2|3|4|5; check_status: CheckStatus }
  isStarred: boolean
  isDue: boolean
  shortTitle: string
}

/** Graph edge connecting two nodes */
export interface GraphEdge {
  source: string
  target: string
  type: 'child' | 'related' | 'prerequisite'
}

/** Learning path recommendation step */
export interface PathStep {
  id: string
  nodeId: string
  reason: PathStepReason
  priority: number
  category: 'review' | 'gap' | 'explore' | 'strengthen'
  topicId: string
  shortTitle: string
  role: LearningRole
  currentMastery: CheckStatus
  confidence?: 1|2|3|4|5
  nextReviewAt?: number
  /** 人类可读的推荐理由细节，用于增强可解释性 */
  reasonDetail?: string
  /** 预估学习收益（0-100），用于排序和展示 */
  estimatedGain?: number
}

export type PathStepReason =
  | 'srs_due'
  | 'weak_confidence'
  | 'untested'
  | 'prerequisite_gap'
  | 'unvisited_branch'
  | 'starred_review'
  | 'role_imbalance'

/** Heatmap day cell for streak tracking */
export interface HeatmapDay {
  date: string           // 'YYYY-MM-DD'
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

/** SRS due day for week view */
export interface SRSWeekDay {
  date: string
  dueCount: number
  nodeIds: string[]
}

/** SVG transform state for pan/zoom */
export interface GraphTransform {
  scale: number
  translateX: number
  translateY: number
}
