import type { CheckStatus, LearningRole } from '../types'

// Mastery ring colors - same as StatsModal STATUS_COLORS
export const MASTERY_COLORS: Record<CheckStatus, string> = {
  understood: '#3f8d70',
  uncertain: '#b8751a',
  needs_review: '#b84040',
  untested: '#a2917c',
}

// Role node fill colors - same as StatsModal ROLE_BAR_COLORS
export const ROLE_COLORS: Record<LearningRole, string> = {
  root: '#e0a020',
  foundation: '#3f8d70',
  mechanism: '#4f69b6',
  application: '#2a8db8',
  comparison: '#8e5db8',
  boundary: '#b84040',
  practice: '#c9931e',
  review: '#7d6d58',
}

// Edge colors
export const EDGE_COLORS = {
  child: '#5b8fb9',
  related: '#e8927c',
  prerequisite: '#3f8d70',
}

// SRS due pulse color
export const DUE_PULSE_COLOR = '#b84040'

// Selected node highlight color
export const SELECTED_HIGHLIGHT = '#e0a020'

// Tooltip background
export const TOOLTIP_BG = 'rgba(25, 25, 25, 0.95)'

/** Look up mastery color by CheckStatus */
export function getMasteryColor(checkStatus: CheckStatus): string {
  return MASTERY_COLORS[checkStatus]
}

/** Look up role color by LearningRole */
export function getRoleColor(role: LearningRole): string {
  return ROLE_COLORS[role]
}
