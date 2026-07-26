import { useMemo } from 'react'
import type { HeatmapDay, SRSWeekDay, LearningNode } from '../types'
import { startOfDay, DAY_MS } from '../utils'

const HEATMAP_DAYS = 84
const SRS_WEEK_DAYS = 7
const SRS_GRACE_MS = 4 * 3600 * 1000 // 4-hour grace period

function toDateString(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function computeLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 5) return 3
  return 4
}

export function useStreak({ nodes }: { nodes: Record<string, LearningNode> }) {
  return useMemo(() => {
    const now = Date.now()
    const todayStart = startOfDay(now)

    // -----------------------------------------------------------------------
    // Group nodes by created_at date
    // -----------------------------------------------------------------------
    const nodesByDate = new Map<string, number>()
    for (const node of Object.values(nodes)) {
      const date = toDateString(node.created_at)
      nodesByDate.set(date, (nodesByDate.get(date) ?? 0) + 1)
    }

    // -----------------------------------------------------------------------
    // Heatmap: 84 days (today = index 83, 84 days ago = index 0)
    // -----------------------------------------------------------------------
    const heatmap: HeatmapDay[] = []
    const dayCounts: number[] = [] // parallel array, count per day from oldest to newest

    for (let i = 0; i < HEATMAP_DAYS; i++) {
      const dayTs = todayStart - (HEATMAP_DAYS - 1 - i) * DAY_MS
      const dateStr = toDateString(dayTs)
      const count = nodesByDate.get(dateStr) ?? 0
      heatmap.push({ date: dateStr, count, level: computeLevel(count) })
      dayCounts.push(count)
    }

    // -----------------------------------------------------------------------
    // Streaks
    // -----------------------------------------------------------------------
    let currentStreak = 0
    for (let i = dayCounts.length - 1; i >= 0; i--) {
      if (dayCounts[i]! > 0) {
        currentStreak++
      } else {
        break
      }
    }

    let longestStreak = 0
    let runLength = 0
    for (let i = 0; i < dayCounts.length; i++) {
      if (dayCounts[i]! > 0) {
        runLength++
      } else {
        if (runLength > longestStreak) longestStreak = runLength
        runLength = 0
      }
    }
    if (runLength > longestStreak) longestStreak = runLength

    const totalActiveDays = dayCounts.filter((c) => c > 0).length

    // -----------------------------------------------------------------------
    // SRS Week: next 7 days (today to today+6)
    // -----------------------------------------------------------------------
    const srsWeek: SRSWeekDay[] = []
    const allNodes = Object.values(nodes)

    for (let i = 0; i < SRS_WEEK_DAYS; i++) {
      const dayStart = todayStart + i * DAY_MS
      const dayEnd = dayStart + DAY_MS - 1 // end of this day

      // Grace period: next_review_at <= dayEnd - 4h means due by that day
      const dueThreshold = dayEnd - SRS_GRACE_MS

      const dueNodes = allNodes.filter(
        (n) => n.mastery.next_review_at !== undefined && n.mastery.next_review_at! <= dueThreshold && n.mastery.next_review_at! >= dayStart,
      )

      srsWeek.push({
        date: toDateString(dayStart),
        dueCount: dueNodes.length,
        nodeIds: dueNodes.map((n) => n.id),
      })
    }

    return {
      heatmap,
      currentStreak,
      longestStreak,
      totalActiveDays,
      srsWeek,
    }
  }, [nodes])
}
