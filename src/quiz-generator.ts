import type { LearningNode, UnderstandingCheck } from './types'
import { uid } from './utils'

// ===== 闪测题目类型 =====
export type QuizType = 'recall' | 'fill_blank' | 'true_false' | 'scenario'

export interface QuizQuestion {
  id: string
  nodeId: string
  type: QuizType
  prompt: string           // 题目本身（不含答案）
  answer: string           // 参考答案
  hint: string             // 卡住时看的提示
  difficulty: 1 | 2 | 3    // 1=简单 2=中等 3=困难
  source: 'checks' | 'auto' | 'ai'  // 来源：原有检测题 / 自动生成 / AI生成
}

// ===== 从现有 UnderstandingCheck 转换为闪测题 =====
function checksToQuizzes(node: LearningNode): QuizQuestion[] {
  return node.checks
    .filter((check) => check.prompt)
    .map((check) => ({
      id: uid('quiz'),
      nodeId: node.id,
      type: 'recall' as QuizType,
      prompt: check.prompt,
      answer: buildAnswerFromCheck(check, node),
      hint: check.hint || '先尝试自己回忆，再回看答案。',
      difficulty: check.intent === 'boundary' ? 3 : check.intent === 'application' ? 2 : 1,
      source: 'checks' as const,
    }))
}

// 根据理解检测题的 intent 构造参考答案
function buildAnswerFromCheck(check: UnderstandingCheck, node: LearningNode): string {
  switch (check.intent) {
    case 'recall':
      // 回忆题：用一句话记忆点 + 核心结论作为参考
      return [
        node.one_line_memory,
        node.answer.summary,
      ].filter(Boolean).join('；') || node.answer.plain.slice(0, 150)

    case 'application':
      // 应用题：用关键机制 + 例子作为参考，而不是只给一个例子
      return [
        node.answer.mechanism ? `关键机制：${node.answer.mechanism}` : '',
        node.answer.example ? `参考例子：${node.answer.example}` : '',
      ].filter(Boolean).join('\n\n') || `根据${node.short_title}的核心机制，先判断适用条件，再选择对应方法。`

    case 'boundary':
      // 边界题：用易错点作为参考
      return node.answer.misunderstandings.length > 0
        ? `注意以下易错点：\n${node.answer.misunderstandings.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
        : `注意"${node.short_title}"的适用边界，不要过度推广。`

    default:
      return [
        node.one_line_memory,
        node.answer.summary,
      ].filter(Boolean).join('；') || node.answer.plain.slice(0, 150)
  }
}

// ===== 自动生成闪测题（基于节点内容） =====
function generateAutoQuizzes(node: LearningNode): QuizQuestion[] {
  const quizzes: QuizQuestion[] = []
  const short = node.short_title

  // 填空题：从一句话记忆或总结中生成
  const memory = node.one_line_memory || node.answer.summary
  if (memory && memory.length > 10) {
    // 生成"XX的核心是____"类型的题
    quizzes.push({
      id: uid('quiz'),
      nodeId: node.id,
      type: 'fill_blank',
      prompt: `关于"${short}"，你能说出它的核心要点吗？`,
      answer: memory,
      hint: '想想这个概念最关键的一个词或一句话。',
      difficulty: 1,
      source: 'auto',
    })

    // 判断题
    if (node.answer.misunderstandings.length > 0) {
      const misconception = node.answer.misunderstandings[0]!
      quizzes.push({
        id: uid('quiz'),
        nodeId: node.id,
        type: 'true_false',
        prompt: `判断："${misconception}"这个说法对吗？`,
        answer: `不对。${misconception} 是一个常见误解。正确理解是：${node.one_line_memory || node.answer.summary}`,
        hint: '想想这个说法是否过于绝对或忽略了某些条件。',
        difficulty: 2,
        source: 'auto',
      })
    }

    // 场景应用题
    if (node.answer.mechanism && node.answer.mechanism.length > 20) {
      quizzes.push({
        id: uid('quiz'),
        nodeId: node.id,
        type: 'scenario',
        prompt: `如果有人问你"${short}"是怎么回事，你会怎么用大白话解释？`,
        answer: node.answer.plain || node.answer.mechanism.slice(0, 200),
        hint: '先说结论，再打个比方。',
        difficulty: 2,
        source: 'auto',
      })
    }
  }

  return quizzes
}

// ===== 为节点生成闪测题集合 =====
export function generateQuizzesForNode(node: LearningNode): QuizQuestion[] {
  // 优先使用原有理解检测题
  const fromChecks = checksToQuizzes(node)
  // 补充自动生成的题
  const fromAuto = generateAutoQuizzes(node)
  // 合并去重，最多 5 题
  const all = [...fromChecks, ...fromAuto]
  return deduplicateQuizzes(all).slice(0, 5)
}

// ===== 闪测会话：为一组节点生成闪测队列 =====
export interface QuizSession {
  quizzes: QuizQuestion[]
  totalQuestions: number
  startedAt: number
}

export function createQuizSession(nodes: LearningNode[], maxPerNode = 2): QuizSession {
  const quizzes: QuizQuestion[] = []
  // 按 SRS 优先级排序：到期 > 即将到期 > 其他
  const sorted = [...nodes].sort((a, b) => {
    const aDue = a.mastery.next_review_at ? (a.mastery.next_review_at <= Date.now() ? 0 : 1) : 2
    const bDue = b.mastery.next_review_at ? (b.mastery.next_review_at <= Date.now() ? 0 : 1) : 2
    return aDue - bDue
  })

  for (const node of sorted) {
    const nodeQuizzes = generateQuizzesForNode(node)
    quizzes.push(...nodeQuizzes.slice(0, maxPerNode))
    if (quizzes.length >= 10) break  // 一次闪测最多 10 题
  }

  return {
    quizzes,
    totalQuestions: quizzes.length,
    startedAt: Date.now(),
  }
}

// ===== 闪测结果 =====
export interface QuizResult {
  quizId: string
  nodeId: string
  selfRating: 0 | 1 | 2 | 3  // 0=完全想不起 1=模糊 2=基本记得 3=完美回忆
  timeSpentMs: number
  answeredAt: number
}

// 根据 selfRating 映射到 SRS quality
export function quizResultToQuality(rating: QuizResult['selfRating']): number {
  switch (rating) {
    case 3: return 5  // 完美回忆
    case 2: return 4  // 基本记得
    case 1: return 3  // 模糊
    case 0: return 1  // 完全想不起
  }
}

// ===== 费曼检验 =====
export interface FeynmanAttempt {
  nodeId: string
  explanation: string       // 用户的解释（文字或语音转文字）
  mode: 'text' | 'voice'    // 输入方式
  submittedAt: number
  aiFeedback?: FeynmanFeedback
}

export interface FeynmanFeedback {
  score: 1 | 2 | 3 | 4 | 5
  strengths: string[]       // 用户说对了什么
  gaps: string[]             // 用户遗漏了什么
  suggestions: string[]      // 改进建议
  overall: string            // 总评
}

// 构建费曼检验的 AI prompt
export function buildFeynmanPrompt(node: LearningNode): string {
  const keyContent = [
    node.one_line_memory ? `一句话记忆：${node.one_line_memory}` : '',
    node.answer.summary ? `核心结论：${node.answer.summary}` : '',
    node.answer.plain ? `通俗解释：${node.answer.plain}` : '',
    node.answer.mechanism ? `关键机制：${node.answer.mechanism}` : '',
    node.answer.misunderstandings.length ? `常见误解：${node.answer.misunderstandings.join('；')}` : '',
  ].filter(Boolean).join('\n')

  return `你是费曼学习法的评估导师。

学生的任务是：用自己的话解释一个概念。你的任务是评估学生的解释是否真正理解了这个概念。

知识点信息：
标题：${node.short_title}
${keyContent}

请严格返回 JSON：
{
  "score": 3,
  "strengths": ["说对了什么1", "说对了什么2"],
  "gaps": ["遗漏了什么1", "遗漏了什么2"],
  "suggestions": ["改进建议1"],
  "overall": "一两句话总评"
}

评分标准：
- 5分：核心概念准确 + 有自己的表述 + 能举例子/做类比
- 4分：核心概念准确，表述较完整
- 3分：理解了大意，但有关键点遗漏或表述不够精确
- 2分：只记得碎片信息，理解不完整
- 1分：基本不理解，解释与概念无关

评分要客观严格，不要因为是学生就放水。3分是一个"还可以"的水平。`
}

// ===== 工具函数 =====
function deduplicateQuizzes(quizzes: QuizQuestion[]): QuizQuestion[] {
  const seen = new Set<string>()
  return quizzes.filter((q) => {
    const key = q.prompt.slice(0, 20)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
