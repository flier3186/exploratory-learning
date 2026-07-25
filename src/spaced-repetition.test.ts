import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  updateSRS,
  checkStatusToQuality,
  isReviewDue,
  isReviewSoon,
  resetSRS,
  SRS_CONFIG,
} from './spaced-repetition'
import { calculateNextReview, getReviewTimeLabel } from './spaced-repetition'

// Mock Date.now() for deterministic tests
// 2025-06-15T12:00:00 UTC+8 = 2025-06-15T04:00:00Z
const MOCK_NOW = 1_749_995_200_000
let dateNowSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(MOCK_NOW)
})

afterEach(() => {
  dateNowSpy.mockRestore()
})

describe('updateSRS', () => {
  it('quality=5, repetitions=0 => interval=1, repetitions=1', () => {
    const result = updateSRS(0, 2.5, 5)
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
    // easeFactor: 2.5 + (0.1 - 0*(0.08 + 0*0.02)) = 2.6
    expect(result.easeFactor).toBeCloseTo(2.6)
  })

  it('quality=4, repetitions=1 => interval=6, repetitions=2', () => {
    const result = updateSRS(1, 2.6, 4)
    expect(result.interval).toBe(6)
    expect(result.repetitions).toBe(2)
    // easeFactor: 2.6 + (0.1 - 1*(0.08 + 1*0.02)) = 2.6 + (0.1 - 0.1) = 2.6
    expect(result.easeFactor).toBeCloseTo(2.6)
  })

  it('quality=3, repetitions=2 => interval=15, repetitions=3', () => {
    const result = updateSRS(2, 2.6, 3)
    expect(result.interval).toBe(15)
    expect(result.repetitions).toBe(3)
    // easeFactor: 2.6 + (0.1 - 2*(0.08 + 2*0.02)) = 2.6 + (0.1 - 0.24) = 2.46
    expect(result.easeFactor).toBeCloseTo(2.46)
  })

  it('quality=5, repetitions=3 => interval=15*easeFactor (递推)', () => {
    const ef = 2.46
    const result = updateSRS(3, ef, 5)
    // repetitions >= 3: interval = round(15 * easeFactor^(3-2)) = round(15 * 2.46) = round(36.9) = 37
    expect(result.interval).toBe(37)
    expect(result.repetitions).toBe(4)
  })

  it('quality=2 (失败) => repetitions=0, interval=1', () => {
    const result = updateSRS(3, 2.5, 2)
    expect(result.repetitions).toBe(0)
    expect(result.interval).toBe(SRS_CONFIG.LAPSE_INTERVAL)
    // easeFactor: 2.5 + (0.1 - 3*(0.08 + 3*0.02)) = 2.5 + (0.1 - 0.42) = 2.18
    expect(result.easeFactor).toBeCloseTo(2.18)
  })

  it('quality=0 (完全不记得) => repetitions=0, interval=1', () => {
    const result = updateSRS(5, 2.5, 0)
    expect(result.repetitions).toBe(0)
    expect(result.interval).toBe(SRS_CONFIG.LAPSE_INTERVAL)
    // easeFactor: 2.5 + (0.1 - 5*(0.08 + 5*0.02)) = 2.5 + (0.1 - 0.9) = 1.7
    expect(result.easeFactor).toBeCloseTo(1.7)
  })

  it('easeFactor 下限测试：quality=0 多次后不低于 1.3', () => {
    // Starting with low easeFactor and quality=0
    const result = updateSRS(0, 1.3, 0)
    expect(result.easeFactor).toBeGreaterThanOrEqual(SRS_CONFIG.MIN_EASE_FACTOR)
    // 1.3 + (0.1 - 5*(0.08+5*0.02)) = 1.3 + (0.1 - 0.9) = 0.5 => clamped to 1.3
    expect(result.easeFactor).toBe(1.3)
  })

  it('interval 上限测试：不超过 365 天', () => {
    // 非常高的 repetitions 和 easeFactor 应该不超过 MAX_INTERVAL
    const result = updateSRS(100, 3.0, 5)
    expect(result.interval).toBeLessThanOrEqual(SRS_CONFIG.MAX_INTERVAL)
    expect(result.repetitions).toBe(101)
  })

  it('quality=1 (完全不记得) => repetitions=0, interval=1', () => {
    const result = updateSRS(2, 2.5, 1)
    expect(result.repetitions).toBe(0)
    expect(result.interval).toBe(SRS_CONFIG.LAPSE_INTERVAL)
    // easeFactor: 2.5 + (0.1 - 4*(0.08+4*0.02)) = 2.5 + (0.1 - 0.64) = 1.96
    expect(result.easeFactor).toBeCloseTo(1.96)
  })

  it('连续 quality=5 递推：1 -> 6 -> 15 -> 37 -> 93...', () => {
    let ef = 2.5
    let rep = 0

    // 第1次: rep=0, q=5 => interval=1, rep=1
    let r = updateSRS(rep, ef, 5)
    expect(r.interval).toBe(1)
    ef = r.easeFactor; rep = r.repetitions

    // 第2次: rep=1, q=5 => interval=6, rep=2
    r = updateSRS(rep, ef, 5)
    expect(r.interval).toBe(6)
    ef = r.easeFactor; rep = r.repetitions

    // 第3次: rep=2, q=5 => interval=15, rep=3
    r = updateSRS(rep, ef, 5)
    expect(r.interval).toBe(15)
    ef = r.easeFactor; rep = r.repetitions

    // 第4次: rep=3, q=5 => interval=round(15*EF^1), rep=4
    r = updateSRS(rep, ef, 5)
    expect(r.interval).toBe(Math.round(15 * Math.pow(ef, 3 - 2)))
    ef = r.easeFactor; rep = r.repetitions

    // 第5次: rep=4, q=5 => interval=round(15*EF^2), rep=5
    r = updateSRS(rep, ef, 5)
    expect(r.interval).toBe(Math.round(15 * Math.pow(ef, 4 - 2)))
  })
})

describe('checkStatusToQuality', () => {
  it('understood => 5', () => {
    expect(checkStatusToQuality('understood')).toBe(5)
  })

  it('uncertain => 3', () => {
    expect(checkStatusToQuality('uncertain')).toBe(3)
  })

  it('needs_review => 2', () => {
    expect(checkStatusToQuality('needs_review')).toBe(2)
  })

  it('untested => 3 (默认中等质量)', () => {
    expect(checkStatusToQuality('untested')).toBe(3)
  })
})

describe('calculateNextReview', () => {
  it('interval=1 => 当前时间 + 1 天', () => {
    const result = calculateNextReview(1)
    expect(result).toBe(MOCK_NOW + 86_400_000)
  })

  it('interval=6 => 当前时间 + 6 天', () => {
    const result = calculateNextReview(6)
    expect(result).toBe(MOCK_NOW + 6 * 86_400_000)
  })

  it('interval=0 => 当前时间（立即复习）', () => {
    const result = calculateNextReview(0)
    expect(result).toBe(MOCK_NOW)
  })
})

describe('isReviewDue', () => {
  it('已过时间 => true', () => {
    expect(isReviewDue(MOCK_NOW - 1000, MOCK_NOW)).toBe(true)
  })

  it('未到时间 => false', () => {
    expect(isReviewDue(MOCK_NOW + 1000, MOCK_NOW)).toBe(false)
  })

  it('undefined => false', () => {
    expect(isReviewDue(undefined, MOCK_NOW)).toBe(false)
  })

  it('恰好等于当前时间 => true', () => {
    expect(isReviewDue(MOCK_NOW, MOCK_NOW)).toBe(true)
  })
})

describe('isReviewSoon', () => {
  it('在宽限期内 => isReviewSoon=true, isReviewDue=false', () => {
    const graceMs = SRS_CONFIG.GRACE_PERIOD_HOURS * 3_600_000
    const nextReview = MOCK_NOW + graceMs - 1000 // 刚好在宽限期内
    expect(isReviewDue(nextReview, MOCK_NOW)).toBe(false)
    expect(isReviewSoon(nextReview, MOCK_NOW)).toBe(true)
  })

  it('超出宽限期 => isReviewSoon=false', () => {
    const graceMs = SRS_CONFIG.GRACE_PERIOD_HOURS * 3_600_000
    const nextReview = MOCK_NOW + graceMs + 1000
    expect(isReviewDue(nextReview, MOCK_NOW)).toBe(false)
    expect(isReviewSoon(nextReview, MOCK_NOW)).toBe(false)
  })

  it('已到期 => isReviewSoon=false (因为 isReviewDue=true)', () => {
    expect(isReviewDue(MOCK_NOW - 1000, MOCK_NOW)).toBe(true)
    expect(isReviewSoon(MOCK_NOW - 1000, MOCK_NOW)).toBe(false)
  })

  it('undefined => isReviewSoon=false', () => {
    expect(isReviewSoon(undefined, MOCK_NOW)).toBe(false)
  })
})

describe('resetSRS', () => {
  it('返回默认值', () => {
    const result = resetSRS()
    expect(result.interval).toBe(SRS_CONFIG.LAPSE_INTERVAL)
    expect(result.easeFactor).toBe(SRS_CONFIG.DEFAULT_EASE_FACTOR)
    expect(result.repetitions).toBe(0)
  })
})

describe('getReviewTimeLabel', () => {
  it('next_review_at=undefined => "未设定"', () => {
    expect(getReviewTimeLabel(undefined)).toBe('未设定')
  })

  it('已到期 => "已到期"', () => {
    expect(getReviewTimeLabel(MOCK_NOW - 1000)).toBe('已到期')
  })

  it('今天 => 包含 "今天"', () => {
    // 2 小时后
    const label = getReviewTimeLabel(MOCK_NOW + 2 * 3_600_000)
    expect(label).toMatch(/^今天 \d{2}:\d{2}$/)
  })

  it('明天 => 包含 "明天"', () => {
    // MOCK_NOW = 正午，加 25h = 明天 13:00（超过 24h 才不会被归为 "今天"）
    const label = getReviewTimeLabel(MOCK_NOW + 25 * 3_600_000)
    expect(label).toMatch(/^明天 \d{2}:\d{2}$/)
  })

  it('后天 => 包含 "后天"', () => {
    // MOCK_NOW = 正午，加 49h = 后天 13:00
    const label = getReviewTimeLabel(MOCK_NOW + 49 * 3_600_000)
    expect(label).toMatch(/^后天 \d{2}:\d{2}$/)
  })

  it('N天后 => 包含 "N 天后"', () => {
    // 5 天后
    const label = getReviewTimeLabel(MOCK_NOW + 5 * 86_400_000 + 3_600_000)
    expect(label).toMatch(/^\d+ 天后$/)
  })
})
