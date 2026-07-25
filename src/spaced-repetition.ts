import type { CheckStatus } from './types'
import { now } from './utils'

/** SM-2 参数配置 */
export const SRS_CONFIG = {
  DEFAULT_INTERVAL: 1,        // 默认间隔 1 天
  DEFAULT_EASE_FACTOR: 2.5,  // 默认难度因子
  MIN_EASE_FACTOR: 1.3,      // 最低难度因子
  MAX_INTERVAL: 365,          // 最大间隔 365 天
  GRACE_PERIOD_HOURS: 4,     // 到期前 4 小时开始提醒
  LAPSE_INTERVAL: 1,          // 失败后重置为 1 天
} as const

/**
 * 更新 SM-2 参数
 * @param repetitions 之前连续正确次数
 * @param easeFactor 难度因子
 * @param quality 回答质量 0-5
 * @returns { interval, easeFactor, repetitions }
 */
export function updateSRS(
  repetitions: number,
  easeFactor: number,
  quality: number,
): { interval: number; easeFactor: number; repetitions: number } {
  let interval: number
  let newRepetitions: number

  if (quality >= 3) {
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = 6
    } else if (repetitions === 2) {
      interval = 15
    } else {
      // SM-2: 对 repetitions >= 3, interval = round(interval * easeFactor)
      // 由于我们没有上一轮的 interval，使用递推公式：
      // reps=2 时 interval=15, reps=3 时 15*EF, reps=4 时 15*EF^2 ...
      interval = Math.round(15 * Math.pow(easeFactor, repetitions - 2))
    }
    newRepetitions = repetitions + 1
  } else {
    // 回答质量 < 3，重置
    newRepetitions = 0
    interval = SRS_CONFIG.LAPSE_INTERVAL
  }

  // 更新难度因子
  const q = (5 - quality)
  let newEaseFactor = easeFactor + (0.1 - q * (0.08 + q * 0.02))
  if (newEaseFactor < SRS_CONFIG.MIN_EASE_FACTOR) {
    newEaseFactor = SRS_CONFIG.MIN_EASE_FACTOR
  }

  // 间隔上限
  if (interval > SRS_CONFIG.MAX_INTERVAL) {
    interval = SRS_CONFIG.MAX_INTERVAL
  }

  return { interval, easeFactor: newEaseFactor, repetitions: newRepetitions }
}

/**
 * 根据回答质量映射 quality (0-5)
 * - 5: 完美回忆，毫不费力
 * - 4: 需要一点思考后回忆
 * - 3: 回忆困难但正确
 * - 2: 回忆错误但看到答案后理解
 * - 1: 完全不记得
 * - 0: 完全不记得且答案也看不懂
 */
export function checkStatusToQuality(status: CheckStatus): number {
  switch (status) {
    case 'understood': return 5
    case 'uncertain': return 3
    case 'needs_review': return 2
    case 'untested': return 3  // 默认中等质量
    default: return 3
  }
}

/**
 * 计算下次复习时间
 */
export function calculateNextReview(interval: number): number {
  return now() + interval * 86_400_000
}

/**
 * 判断节点是否到期需要复习
 */
export function isReviewDue(nextReviewAt: number | undefined, nowMs: number): boolean {
  if (nextReviewAt === undefined) return false
  return nowMs >= nextReviewAt
}

/**
 * 判断节点是否即将到期（在宽限期内）
 */
export function isReviewSoon(nextReviewAt: number | undefined, nowMs: number): boolean {
  if (nextReviewAt === undefined) return false
  if (isReviewDue(nextReviewAt, nowMs)) return false
  const graceMs = SRS_CONFIG.GRACE_PERIOD_HOURS * 3_600_000
  return nowMs + graceMs >= nextReviewAt
}

/**
 * 重置节点 SM-2 参数（用于遗忘或失败）
 */
export function resetSRS(): { interval: number; easeFactor: number; repetitions: number } {
  return {
    interval: SRS_CONFIG.LAPSE_INTERVAL,
    easeFactor: SRS_CONFIG.DEFAULT_EASE_FACTOR,
    repetitions: 0,
  }
}

/**
 * 获取人类可读的复习时间描述
 * 例如 "今天 18:00"、"明天"、"后天"、"3 天后"
 */
export function getReviewTimeLabel(nextReviewAt: number | undefined): string {
  if (nextReviewAt === undefined) return '未设定'

  const current = now()
  const diffMs = nextReviewAt - current
  const diffDays = diffMs / 86_400_000

  if (diffMs <= 0) return '已到期'

  const date = new Date(nextReviewAt)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  if (diffDays < 1) return `今天 ${timeStr}`

  const today = new Date(current)
  const target = new Date(nextReviewAt)
  const tomorrowDate = new Date(today)
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)

  if (
    target.getFullYear() === tomorrowDate.getFullYear() &&
    target.getMonth() === tomorrowDate.getMonth() &&
    target.getDate() === tomorrowDate.getDate()
  ) {
    return `明天 ${timeStr}`
  }

  const dayAfterTomorrow = new Date(today)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)

  if (
    target.getFullYear() === dayAfterTomorrow.getFullYear() &&
    target.getMonth() === dayAfterTomorrow.getMonth() &&
    target.getDate() === dayAfterTomorrow.getDate()
  ) {
    return `后天 ${timeStr}`
  }

  const days = Math.floor(diffDays)
  return `${days} 天后`
}
