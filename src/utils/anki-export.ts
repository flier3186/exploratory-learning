/**
 * Anki 导出工具模块
 *
 * 将探索式学习的学习节点（LearningNode）导出为 Anki 可导入的格式（TSV / CSV）。
 * 每个节点对应一张 Anki 卡片：
 *   - 正面：问题 + 所属主题
 *   - 背面：一句话记忆、核心总结、通俗解释、关键机制、例子、易错点、掌握度
 *   - 标签：节点 tags + 主题名 + "探索式学习"
 */

import type { LearningNode, Topic } from '../types'
import { CHECK_STATUS_LABEL } from '../constants'

// ===== 内部辅助函数 =====

/**
 * 转义 HTML 特殊字符，防止内容注入导致 Anki 卡片格式错乱。
 * 将 & < > " ' 替换为对应的 HTML 实体。
 *
 * @param text - 需要转义的原始文本
 * @returns 转义后的 HTML 安全文本
 */
function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 将文本转换为单行 HTML：
 *   - 换行符（\n、\r\n）替换为 `<br>`
 *   - 制表符替换为空格（制表符会破坏 TSV 结构）
 *
 * 必须在 escapeHtml 之后调用，否则 escapeHtml 会将 `<br>` 中的 `<` 转义。
 *
 * @param text - 已经过 HTML 转义的文本
 * @returns 不含实际换行符和制表符的单行文本
 */
function toSingleLineHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>')
    .replace(/\t/g, ' ')
}

/**
 * 处理文本内容：先转义 HTML 特殊字符，再转为单行 HTML。
 * 这是所有卡片字段内容的标准化处理流程。
 *
 * @param text - 原始文本
 * @returns 安全的、单行的 HTML 文本
 */
function processContent(text: string): string {
  return toSingleLineHtml(escapeHtml(text))
}

/**
 * 清理 Anki 标签：去除首尾空白，将内部空白字符替换为下划线。
 * Anki 标签以空格分隔，因此标签内部不能包含空格。
 *
 * @param tag - 原始标签文本
 * @returns 清理后的安全标签
 */
function sanitizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, '_')
}

/**
 * 根据节点查找其所属主题的标题。
 *
 * @param node - 学习节点
 * @param topics - 主题列表
 * @returns 主题标题；若未找到则返回 '未知主题'
 */
function getTopicTitle(node: LearningNode, topics: Topic[]): string {
  const topic = topics.find((t) => t.id === node.topic_id)
  return topic ? topic.title : '未知主题'
}

/**
 * 构建卡片正面内容（HTML 格式）。
 * 包含节点的问题和所属主题。
 *
 * @param node - 学习节点
 * @param topicTitle - 所属主题标题
 * @returns HTML 格式的正面内容
 */
function buildFrontContent(node: LearningNode, topicTitle: string): string {
  const question = processContent(node.question)
  const topic = processContent(topicTitle)
  return `<div class="anki-question"><b>问题：</b>${question}</div><br><div class="anki-topic"><i>主题：${topic}</i></div>`
}

/**
 * 构建卡片背面内容（HTML 格式）。
 * 各部分用 `<br>` 分隔，包含：
 *   - 一句话记忆
 *   - 核心总结
 *   - 通俗解释
 *   - 关键机制
 *   - 例子
 *   - 易错点（每条以 • 前缀）
 *   - 掌握度状态
 *
 * @param node - 学习节点
 * @returns HTML 格式的背面内容
 */
function buildBackContent(node: LearningNode): string {
  const parts: string[] = []

  // 一句话记忆
  if (node.one_line_memory) {
    parts.push(`<b>一句话记忆：</b>${processContent(node.one_line_memory)}`)
  }

  // 核心总结
  if (node.answer.summary) {
    parts.push(`<b>核心总结：</b>${processContent(node.answer.summary)}`)
  }

  // 通俗解释
  if (node.answer.plain) {
    parts.push(`<b>通俗解释：</b>${processContent(node.answer.plain)}`)
  }

  // 关键机制
  if (node.answer.mechanism) {
    parts.push(`<b>关键机制：</b>${processContent(node.answer.mechanism)}`)
  }

  // 例子
  if (node.answer.example) {
    parts.push(`<b>例子：</b>${processContent(node.answer.example)}`)
  }

  // 易错点（每条以 • 前缀）
  if (node.answer.misunderstandings && node.answer.misunderstandings.length > 0) {
    const items = node.answer.misunderstandings
      .filter((m) => m)
      .map((m) => `• ${processContent(m)}`)
      .join('<br>')
    if (items) {
      parts.push(`<b>易错点：</b><br>${items}`)
    }
  }

  // 掌握度状态
  const statusLabel = CHECK_STATUS_LABEL[node.mastery.check_status] || node.mastery.check_status
  const confidenceText = node.mastery.confidence ? `（信心：${node.mastery.confidence}/5）` : ''
  parts.push(`<b>掌握度：</b>${escapeHtml(statusLabel)}${escapeHtml(confidenceText)}`)

  return parts.join('<br><br>')
}

/**
 * 构建标签字符串（空格分隔）。
 * 标签来源：节点自身 tags + 主题名 + "探索式学习"。
 *
 * @param node - 学习节点
 * @param topicTitle - 所属主题标题
 * @returns 空格分隔的标签字符串
 */
function buildTags(node: LearningNode, topicTitle: string): string {
  const tags = [
    ...node.tags.map((t) => sanitizeTag(t)),
    sanitizeTag(topicTitle),
    '探索式学习',
  ].filter((tag) => tag.length > 0)
  // 去重
  return [...new Set(tags)].join(' ')
}

/**
 * 将字段包裹为 CSV 安全格式：用双引号包裹，内部双引号转义为两个双引号。
 *
 * @param field - 原始字段值
 * @returns CSV 安全的字段字符串
 */
function csvQuote(field: string): string {
  return `"${field.replace(/"/g, '""')}"`
}

// ===== 导出函数 =====

/**
 * 生成 Anki 可导入的 TSV（制表符分隔）文本格式。
 *
 * 文件头部包含 Anki 导入所需的声明：
 *   - `#separator:tab` — 字段以制表符分隔
 *   - `#html:true` — 字段内容为 HTML 格式
 *   - `#tags column:3` — 第三列为标签
 *
 * 每行一个卡片，格式为：`正面\t背面\t标签`
 * 所有字段中的换行符已替换为 `<br>`，制表符已替换为空格，
 * 确保不会破坏 TSV 结构。
 *
 * @param nodes - 要导出的学习节点数组
 * @param topics - 主题列表（用于查找节点所属主题）
 * @returns Anki 可导入的 TSV 格式字符串
 */
export function generateAnkiTSV(nodes: LearningNode[], topics: Topic[]): string {
  const header = '#separator:tab\n#html:true\n#tags column:3\n'

  if (!nodes || nodes.length === 0) {
    return header
  }

  const lines = nodes.map((node) => {
    const topicTitle = getTopicTitle(node, topics)
    const front = buildFrontContent(node, topicTitle)
    const back = buildBackContent(node)
    const tags = buildTags(node, topicTitle)
    return `${front}\t${back}\t${tags}`
  })

  return header + lines.join('\n') + '\n'
}

/**
 * 生成 CSV 格式（逗号分隔，字段用双引号包裹），作为 Anki 导入的备选格式。
 *
 * 每行一个卡片，格式为：`"正面","背面","标签"`
 * 字段内的双引号已转义为两个双引号，换行符已替换为 `<br>`。
 *
 * @param nodes - 要导出的学习节点数组
 * @param topics - 主题列表（用于查找节点所属主题）
 * @returns CSV 格式字符串
 */
export function generateAnkiCSV(nodes: LearningNode[], topics: Topic[]): string {
  if (!nodes || nodes.length === 0) {
    return ''
  }

  const lines = nodes.map((node) => {
    const topicTitle = getTopicTitle(node, topics)
    const front = buildFrontContent(node, topicTitle)
    const back = buildBackContent(node)
    const tags = buildTags(node, topicTitle)
    return [front, back, tags].map(csvQuote).join(',')
  })

  return lines.join('\n') + '\n'
}

/**
 * 生成 TSV 文件并触发浏览器下载。
 *
 * 文件名格式：`探索式学习-Anki导入-{YYYY-MM-DD}.txt`
 * 使用 Blob 和 URL.createObjectURL 创建下载链接，
 * 下载完成后自动回收 URL 以释放内存。
 *
 * @param nodes - 要导出的学习节点数组
 * @param topics - 主题列表
 */
export function downloadAnkiExport(nodes: LearningNode[], topics: Topic[]): void {
  const tsvContent = generateAnkiTSV(nodes, topics)

  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const fileName = `探索式学习-Anki导入-${dateStr}.txt`

  const blob = new Blob([tsvContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // 回收 URL 以释放内存
  URL.revokeObjectURL(url)
}

/**
 * 只导出指定主题下的节点为 Anki TSV 文件。
 *
 * 过滤出属于指定 topicId 的节点，然后调用 downloadAnkiExport 触发下载。
 * 如果该主题下没有节点，则不执行任何操作。
 *
 * @param nodes - 全部学习节点数组
 * @param topics - 全部主题列表
 * @param topicId - 要导出的主题 ID
 */
export function exportAnkiForTopic(nodes: LearningNode[], topics: Topic[], topicId: string): void {
  const topicNodes = nodes.filter((n) => n.topic_id === topicId)
  if (topicNodes.length === 0) return
  downloadAnkiExport(topicNodes, topics)
}
