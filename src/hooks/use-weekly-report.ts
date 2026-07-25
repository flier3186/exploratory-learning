import { useMemo } from 'react'
import type { LearningNode, Topic, CheckStatus } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export interface WeeklyReportData {
  periodStart: number
  periodEnd: number
  totalNodes: number
  newNodesCount: number
  newNodes: LearningNode[]
  reviewedNodesCount: number
  masteredNodesCount: number
  topicsStudied: string[]
  topTags: { tag: string; count: number }[]
  masteryChange: {
    before: Record<CheckStatus, number>
    after: Record<CheckStatus, number>
  }
  keyLearnings: { title: string; memory: string; topic: string }[]
  dueForReview: number
  streakDays: number
  averageDepth: number
}

export function useWeeklyReport(
  nodes: Record<string, LearningNode>,
  topics: Topic[],
  currentStreak: number,
): WeeklyReportData {
  return useMemo(() => {
    const now = Date.now()
    const periodEnd = now
    const periodStart = now - WEEK_MS
    const allNodes = Object.values(nodes)

    // New nodes created in the last 7 days
    const newNodes = allNodes
      .filter((n) => n.created_at >= periodStart)
      .sort((a, b) => b.created_at - a.created_at)

    // Nodes that were checked/reviewed in the last 7 days
    const reviewedNodesCount = allNodes.filter(
      (n) => n.mastery.checked_at !== undefined && n.mastery.checked_at >= periodStart,
    ).length

    // Nodes marked as understood
    const masteredNodesCount = allNodes.filter(
      (n) => n.mastery.check_status === 'understood',
    ).length

    // Topics studied in the last 7 days
    const recentTopicIds = new Set(newNodes.map((n) => n.topic_id))
    const topicsStudied = topics
      .filter((t) => recentTopicIds.has(t.id))
      .map((t) => t.title)

    // Top tags from new nodes
    const tagCount: Record<string, number> = {}
    for (const n of newNodes) {
      for (const tag of n.tags) {
        tagCount[tag] = (tagCount[tag] || 0) + 1
      }
    }
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }))

    // Mastery distribution
    const masteryAfter: Record<CheckStatus, number> = {
      understood: 0,
      uncertain: 0,
      needs_review: 0,
      untested: 0,
    }
    for (const n of allNodes) {
      masteryAfter[n.mastery.check_status]++
    }

    // Estimate "before" mastery: nodes that existed before this week
    // For nodes created this week, they started as "untested"
    // For nodes that existed before, assume current status (we don't have history)
    const masteryBefore: Record<CheckStatus, number> = {
      understood: 0,
      uncertain: 0,
      needs_review: 0,
      untested: 0,
    }
    for (const n of allNodes) {
      if (n.created_at < periodStart) {
        masteryBefore[n.mastery.check_status]++
      } else {
        // New nodes started as untested
        masteryBefore.untested++
      }
    }

    // Key learnings: top 5 new nodes by quality
    const keyLearnings = newNodes
      .filter((n) => n.one_line_memory || n.answer.summary)
      .slice(0, 5)
      .map((n) => {
        const topic = topics.find((t) => t.id === n.topic_id)
        return {
          title: n.short_title,
          memory: n.one_line_memory || n.answer.summary,
          topic: topic?.title || '未分类',
        }
      })

    // Due for review
    const dueForReview = allNodes.filter(
      (n) => n.mastery.next_review_at !== undefined && n.mastery.next_review_at! <= now,
    ).length

    // Average depth
    const depthCache = new Map<string, number>()
    const computeDepth = (nodeId: string): number => {
      if (depthCache.has(nodeId)) return depthCache.get(nodeId)!
      const node = nodes[nodeId]
      if (!node || !node.parent_id) {
        depthCache.set(nodeId, 0)
        return 0
      }
      const d = computeDepth(node.parent_id) + 1
      depthCache.set(nodeId, d)
      return d
    }
    let depthSum = 0
    for (const n of allNodes) depthSum += computeDepth(n.id)
    const averageDepth = allNodes.length ? depthSum / allNodes.length : 0

    return {
      periodStart,
      periodEnd,
      totalNodes: allNodes.length,
      newNodesCount: newNodes.length,
      newNodes,
      reviewedNodesCount,
      masteredNodesCount,
      topicsStudied,
      topTags,
      masteryChange: { before: masteryBefore, after: masteryAfter },
      keyLearnings,
      dueForReview,
      streakDays: currentStreak,
      averageDepth,
    }
  }, [nodes, topics, currentStreak])
}

/**
 * Generate a shareable text summary of the weekly report
 */
export function generateReportText(report: WeeklyReportData): string {
  const startDate = new Date(report.periodStart)
  const endDate = new Date(report.periodEnd)
  const dateRange = `${startDate.getMonth() + 1}月${startDate.getDate()}日 - ${endDate.getMonth() + 1}月${endDate.getDate()}日`

  const lines: string[] = []
  lines.push(`📚 探索式学习周报`)
  lines.push(`📅 ${dateRange}`)
  lines.push('')

  lines.push(`本周新增 ${report.newNodesCount} 个知识节点，累计 ${report.totalNodes} 个。`)
  lines.push(`已掌握 ${report.masteredNodesCount} 个，待复习 ${report.dueForReview} 个。`)
  if (report.streakDays > 0) {
    lines.push(`连续学习 ${report.streakDays} 天！`)
  }
  lines.push('')

  if (report.topicsStudied.length > 0) {
    lines.push(`🗂 学习主题：${report.topicsStudied.join('、')}`)
    lines.push('')
  }

  if (report.keyLearnings.length > 0) {
    lines.push(`💡 本周关键收获：`)
    for (const k of report.keyLearnings) {
      lines.push(`• ${k.title}：${k.memory}`)
    }
    lines.push('')
  }

  if (report.topTags.length > 0) {
    lines.push(`🏷 热门标签：${report.topTags.map((t) => `#${t.tag}`).join(' ')}`)
  }

  lines.push('')
  lines.push(`用追问把答案变成知识树 → exploratory-learning.pages.dev`)

  return lines.join('\n')
}
