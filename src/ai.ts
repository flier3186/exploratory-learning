import { ROLE_META } from './constants'
import type { FactCheckBlock, GeneratedPayload, LearningRole, QuestionType, UserPreference } from './types'

export interface PayloadValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  normalized: GeneratedPayload
  factualRisk: boolean
}

export class ModelCallError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'ModelCallError'
    this.code = code
  }
}

import { clampText } from './utils'

function safeStringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function isQuestionType(value: unknown): value is QuestionType {
  return ['concept', 'mechanism', 'comparison', 'fact', 'application', 'challenge'].includes(String(value))
}

function isLearningRole(value: unknown): value is LearningRole {
  return Object.keys(ROLE_META).includes(String(value))
}

// Re-export for storage.ts to import instead of redefining
export { safeStringList, isQuestionType, isLearningRole }

export function normalizeFactCheck(value: unknown, question: string, factualRisk = false): FactCheckBlock {
  const raw = (value || {}) as Partial<FactCheckBlock>
  const short = clampText(question.replace(/[？?。！!]/g, ''), 18) || '这个问题'
  if (!factualRisk && !safeStringList(raw.to_verify).length && !safeStringList(raw.suggested_sources).length) {
    return {
      explainable: [],
      to_verify: [],
      suggested_sources: [],
      avoid_conclusions: [],
    }
  }

  return {
    explainable: safeStringList(raw.explainable).slice(0, 4),
    to_verify: safeStringList(raw.to_verify).length
      ? safeStringList(raw.to_verify).slice(0, 5)
      : [`“${short}”中涉及的实时事实、具体数据或专业判断`],
    suggested_sources: safeStringList(raw.suggested_sources).length
      ? safeStringList(raw.suggested_sources).slice(0, 5)
      : ['官方文档或公告', '权威机构资料', '专业数据库或论文检索平台'],
    avoid_conclusions: safeStringList(raw.avoid_conclusions).length
      ? safeStringList(raw.avoid_conclusions).slice(0, 4)
      : ['不要把未核验信息当成确定结论', '不要把通识解释替代专业建议'],
  }
}

export function cleanJsonText(text: string) {
  const stripped = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  const first = stripped.indexOf('{')
  const last = stripped.lastIndexOf('}')
  if (first >= 0 && last > first) {
    return stripped.slice(first, last + 1)
  }
  return stripped
}

export function safeParsePayload(text: string): { payload: GeneratedPayload | null; repaired: boolean } {
  const cleaned = cleanJsonText(text)
  try {
    return { payload: JSON.parse(cleaned) as GeneratedPayload, repaired: cleaned !== text.trim() }
  } catch {
    try {
      const repaired = cleaned.replace(/,\s*([}\]])/g, '$1')
      return { payload: JSON.parse(repaired) as GeneratedPayload, repaired: true }
    } catch {
      return { payload: null, repaired: false }
    }
  }
}

export function detectFactRisk(question: string) {
  const keywords = [
    '最新',
    '现在',
    '今天',
    '今年',
    '价格',
    '排名',
    '政策',
    '法规',
    '法律',
    '医学',
    '诊断',
    '治疗',
    '金融',
    '股票',
    '汇率',
    '论文',
    '研究',
    '数据',
    '引用',
    '来源',
    '官网',
    'doi',
    '药',
    '疾病',
  ]
  return keywords.some((keyword) => question.toLowerCase().includes(keyword))
}

function hasUnsupportedAuthorityClaim(text: string) {
  return ['研究表明', '数据显示', '权威数据显示', '官方确认', '官方指出', '论文证明'].some((phrase) => text.includes(phrase))
}

export function validateGeneratedPayload(payload: GeneratedPayload, question: string): PayloadValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const factualRisk = detectFactRisk(question)
  const normalized: GeneratedPayload = {
    ...payload,
    answer: { ...(payload.answer || {}) },
  }

  if (!isQuestionType(normalized.question_type)) {
    warnings.push('问题类型异常，已按问题内容重新归类。')
    normalized.question_type = factualRisk ? 'fact' : 'concept'
  }

  if (factualRisk && normalized.question_type !== 'fact') {
    warnings.push('问题含事实风险，已按 fact 模式处理。')
    normalized.question_type = 'fact'
  }

  if (!isLearningRole(normalized.learning_role)) {
    warnings.push('学习角色异常，已回退为基础理解。')
    normalized.learning_role = 'foundation'
  }

  if (!normalized.answer?.summary || !normalized.answer?.plain) {
    errors.push('模型回答缺少核心结论或通俗解释。')
  }

  if (!normalized.answer?.mechanism) warnings.push('模型回答缺少关键机制，已用本地结构补齐。')
  if (!Array.isArray(normalized.answer?.misunderstandings)) normalized.answer!.misunderstandings = []
  if (!Array.isArray(normalized.followups) || normalized.followups.length < 3) warnings.push('追问数量不足，已用本地追问补齐。')
  if (!Array.isArray(normalized.checks) || normalized.checks.length < 3) warnings.push('理解检测不足，已用本地检测题补齐。')

  const combinedText = [
    normalized.answer?.summary,
    normalized.answer?.plain,
    normalized.answer?.mechanism,
    normalized.answer?.example,
  ]
    .filter(Boolean)
    .join('\n')

  if (hasUnsupportedAuthorityClaim(combinedText) && !(normalized.source_note || normalized.answer?.source_note)) {
    warnings.push('回答出现无来源权威表述，已标记为需核验。')
    normalized.source_note = '当前回答包含可能需要来源支持的表述，请结合可靠来源自行核验。'
  }

  if (factualRisk && !(normalized.source_note || normalized.answer?.source_note)) {
    warnings.push('问题涉及事实、时效或专业判断，已标记为需核验。')
    normalized.source_note = '这个问题涉及事实、时效或专业判断。当前工具没有联网检索能力，请结合可靠来源确认。'
  }

  if (factualRisk || normalized.question_type === 'fact') {
    normalized.fact_check = normalizeFactCheck(normalized.fact_check, question, true)
    if (!safeStringList(normalized.fact_check.to_verify).length) {
      warnings.push('事实核验字段不足，已用本地核验框架补齐。')
    }
  } else {
    normalized.fact_check = normalizeFactCheck(normalized.fact_check, question, false)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
    factualRisk,
  }
}

export function preferenceSummary(preference: UserPreference) {
  const topPreferred = Object.entries(preference.preferred_followup_types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key)
  const topDisliked = Object.entries(preference.disliked_followup_types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key)

  return [
    topPreferred.length ? `用户最近更偏好这些追问类型：${topPreferred.join('、')}。` : '',
    topDisliked.length ? `用户最近较少喜欢这些追问类型：${topDisliked.join('、')}。` : '',
    preference.difficulty_preference !== 'balanced' ? `用户当前难度偏好：${preference.difficulty_preference}。` : '',
    preference.recent_negative_examples.length
      ? `避免重复这些不感兴趣方向：${preference.recent_negative_examples.slice(-3).join('；')}。`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildMainPrompt(question: string, context: string, preference: UserPreference, roleHint?: LearningRole, profileSummary?: string) {
  const factRisk = detectFactRisk(question)
  return `你是一个中文深度学习导师。

你的任务不是直接给长答案，而是帮助用户真正弄懂一个问题。

产品定位：
- 尽量覆盖多种学习场景：技术/编程/AI、商业/产品/管理、考试/课程、语言学习、科普/通识、投资/金融研究、医学/健康科普等。
- 你要自动识别用户当前更像哪种学习场景，并调整例子、追问和检测题。
- 对技术/课程/通识问题，可以更偏讲解和练习。
- 对商业/产品/管理问题，要多给框架、边界、落地场景。
- 对语言学习，要给可模仿表达、常见错误和练习。
- 对医学、法律、金融、政策、实时事实，要更谨慎，只做通识学习和查证框架，不替代专业建议。

输出风格：
- 教练式：不要只灌输答案，要用追问和理解检测帮助用户自己建立理解。
- 教材式：结构完整，先结论，再解释机制，再给例子，再指出易错点。
- 研究员式：明确假设、边界和不确定性；需要来源时要提示核验，不把推测写成事实。
- 目标是“真的弄懂”，不是显得知识很多。避免堆术语，优先把概念讲清楚。

上下文：
${context || '这是当前主题下的新问题。'}

用户偏好摘要：
${preferenceSummary(preference) || '暂无明显偏好。'}
${profileSummary ? `\n用户学习画像：\n${profileSummary}` : ''}

角色提示：
${roleHint ? `这个节点倾向于 ${roleHint} 类型。` : '请根据问题自行判断学习角色。'}

请先判断用户问题属于哪一类：
- concept：概念理解
- mechanism：机制原理
- comparison：对比辨析
- fact：事实查询
- application：应用实践
- challenge：反例质疑

准确性规则：
- 当前系统不能联网检索。你不能假装看过外部来源。
- 不要编造论文、链接、作者、机构、年份、统计数据、政策条文、标准编号或“官方指出”。
- 如果问题涉及最新事实、真实数据、政策法规、医学、法律、金融、论文结论、具体人物事件、版本价格或需要引用，请把 question_type 设为 fact，并填写 source_note。
- 如果无法确认事实，只能给出学习性解释和查证建议，不要给确定结论。
- 不要使用“权威数据显示”“研究表明”“官方确认”等无来源表达。
- 对医疗、法律、金融问题，只能提供通识学习解释，不能替代专业建议。

${factRisk ? `事实类回答模式：
- 这个问题已被本地判断为可能涉及事实、时效、引用或专业判断。
- answer.summary 不要写未经核验的确定事实结论。
- answer.plain 应解释“如何理解这个问题”和“应查证哪些信息”。
- answer.mechanism 应说明判断这类问题需要哪些条件、来源或证据。
- answer.example 可以给查证路径示例，但不要虚构具体来源。
- source_note 必须明确写出：当前回答未经过联网来源核验，需要结合可靠来源确认。
- fact_check.explainable 写“无需实时来源也能解释的通用概念”。
- fact_check.to_verify 写“必须查证后才能相信的事实点”。
- fact_check.suggested_sources 写“建议查证的来源类型”，不要写虚构的具体链接。
- fact_check.avoid_conclusions 写“在未核验前不能直接下的结论”。` : ''}

请同时生成：
1. 学习卡片
2. 5-8 个追问候选
3. 3 个理解检测题：主动回忆、应用迁移、边界辨析各 1 个
4. 不超过 12 个中文字符的 short_title
5. 一句话 one_line_memory，不超过 40 字
6. 3-5 个 tags，优先使用名词或概念词

内容质量要求（非常重要）：
- one_line_memory 是最精炼的记忆口诀，必须是高度浓缩的关键词或公式化表达，不能和 plain 的通俗解释内容重复。
- summary 是核心结论（1-2句话），只写结论本身，不要包含解释性内容，不要和 plain 重复。
- plain 是通俗解释，用比喻或日常例子帮助理解，面向初学者。
- misunderstandings 必须给出 3-5 条，针对当前学习内容的具体易错点，不要写泛泛的通用误解。
- example 必须给出 3-5 个不同场景的具体例子，用编号列出（如"1. ...\\n2. ...\\n3. ..."），帮助初学者从多个角度理解概念。
- 所有答案内容必须准确无误，不能编造、不能含糊。

请严格返回 JSON，不要添加其他文字：
{
  "question_type": "concept",
  "learning_role": "foundation",
  "short_title": "节点短标题",
  "one_line_memory": "高度浓缩的记忆口诀，与plain不重复",
  "tags": ["标签1", "标签2", "标签3"],
  "source_note": "",
  "answer": {
    "summary": "核心结论，1-2句话，只写结论不写解释",
    "plain": "通俗解释，100-200字，用比喻或日常例子",
    "mechanism": "关键机制，100-200字，说明它为什么成立或如何运作",
    "misunderstandings": ["针对当前内容的具体易错点1", "针对当前内容的具体易错点2", "针对当前内容的具体易错点3"],
    "example": "1. 场景一的具体例子\\n2. 场景二的具体例子\\n3. 场景三的具体例子"
  },
  "fact_check": {
    "explainable": ["不依赖实时来源也能解释的部分"],
    "to_verify": ["需要查证的事实点"],
    "suggested_sources": ["建议查证的来源类型"],
    "avoid_conclusions": ["未核验前不能直接下的结论"]
  },
  "followups": [
    {
      "question": "值得继续问的问题",
      "type": "foundation",
      "reason": "为什么这个问题值得问",
      "difficulty": 1,
      "expected_gain": "问完会获得什么"
    }
  ],
  "checks": [
    {
      "prompt": "不用看答案也能回答的检测题",
      "intent": "recall",
      "hint": "回答卡住时给用户看的提示"
    }
  ],
  "keywords": ["关键词1", "关键词2", "关键词3"]
}

用户问题：${question}`
}

export async function callModel(apiBase: string, apiKey: string, model: string, prompt: string, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 30_000)

    try {
      const response = await fetch(apiBase, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你只返回合法 JSON object。不要输出 markdown。不要输出解释。所有字段必须符合用户提供的 JSON 结构。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1800,
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      let detail = ''
      try {
        const errorBody = (await response.json()) as { error?: { message?: string }; message?: string }
        detail = errorBody.error?.message || errorBody.message || ''
      } catch {
        detail = ''
      }
      const suffix = detail ? `：${detail}` : ''
      if (response.status === 401) throw new ModelCallError(`API Key 无效或已过期，请到设置里检查一下。${suffix}`, 'auth')
      if (response.status === 403) throw new ModelCallError(`API 没有调用权限，请检查 Key 和模型是否匹配。${suffix}`, 'forbidden')
      if (response.status === 429) throw new ModelCallError(`请求太频繁或额度用完了，等 30 秒再试。${suffix}`, 'rate_limit')
      if (response.status >= 500) throw new ModelCallError(`模型服务暂时出问题了，等一会儿再试。${suffix}`, 'server')
      throw new ModelCallError(`API 请求出了问题（${response.status}），请检查设置里的地址和 Key。${suffix}`, 'api')
    }

    const data = (await response.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> }
    const choice = data.choices?.[0]
    const finishReason = choice?.finish_reason
    const content = choice?.message?.content

    if (finishReason === 'length') throw new ModelCallError('回答太长被截断了，试试问得更具体一些。', 'length')
    if (finishReason === 'content_filter') throw new ModelCallError('这个问题触发了安全限制，换个问法试试。', 'content_filter')
    if (finishReason === 'insufficient_system_resource') throw new ModelCallError('模型服务暂时忙不过来，等 30 秒再试。', 'resource')
    if (!content) throw new ModelCallError('模型没有返回任何内容，再试一次。', 'empty')

    return content
    } catch (error) {
      window.clearTimeout(timer)
      if (error instanceof ModelCallError) {
        if ((error.code === 'rate_limit' || error.code === 'timeout' || error.code === 'server') && attempt < retries) {
          const wait = (attempt + 1) * 5000
          await new Promise((resolve) => setTimeout(resolve, wait))
          continue
        }
        throw error
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 5000))
          continue
        }
        throw new ModelCallError('等了 30 秒没收到回复，检查一下网络。', 'timeout')
      }
      throw new ModelCallError(error instanceof Error ? error.message : '模型请求失败', 'network')
    }
  }
  throw new ModelCallError('模型请求失败', 'network')
}
