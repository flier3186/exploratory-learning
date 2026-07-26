import { useCallback, useEffect, useRef, useState } from 'react'
import type { FollowupQuestion, LearningRole, ReviewFilter } from './types'
import { useAppState } from './hooks/useAppState'
import { useGeneration } from './hooks/useGeneration'
import { useVoiceInput } from './hooks/useVoiceInput'
import { useWeeklyReport } from './hooks/use-weekly-report'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LearningCard } from './components/LearningCard'
import { SearchModal } from './components/SearchModal'
import { ReviewModal } from './components/ReviewModal'
import { NodeTree } from './components/NodeTree'
import { SettingsModal } from './components/SettingsModal'
import { TemplateMarket, type TemplateMeta } from './components/TemplateMarket'
import { OnboardingModal, useOnboarding } from './components/Onboarding'
import { StatsModal } from './components/StatsModal'
import { QuizModal } from './components/QuizModal'
import { FeynmanModal } from './components/FeynmanModal'
import KnowledgeGraphModal from './components/KnowledgeGraphModal'
import LearningPathModal from './components/LearningPathModal'
import { WeeklyReportModal } from './components/WeeklyReportModal'
import { GrowthTimelineModal } from './components/GrowthTimelineModal'
import { decodeConfigFromHash, clearConfigHash, generateShareLink } from './utils'
import { STORAGE_KEY } from './constants'
import { downloadAnkiExport, exportAnkiForTopic } from './utils/anki-export'
import { profileSummaryForPrompt } from './learning-profile'
import { isReviewDue } from './spaced-repetition'

const GENERATION_STEPS = [
  { title: '正在理解你的问题', detail: '先判断学习场景、事实风险和适合的讲解方式。', width: '28%' },
  { title: '正在生成核心解释', detail: '整理一句话结论、通俗解释、关键机制和例子。', width: '52%' },
  { title: '正在整理追问和检测题', detail: '把下一步推荐、理解检测和标签补齐。', width: '76%' },
  { title: '正在收尾学习卡片', detail: '长问题可能需要更久，完成后会自动加入知识树。', width: '92%' },
]

export default function App() {
  const app = useAppState()
  const [settingsOpen, setSettingsOpen] = useState(() => Boolean(decodeConfigFromHash()))
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<LearningRole | 'all'>('all')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [importing, setImporting] = useState(false)
  const [templateMarketOpen, setTemplateMarketOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [pathOpen, setPathOpen] = useState(false)
  const [weeklyReportOpen, setWeeklyReportOpen] = useState(false)
  const [growthTimelineOpen, setGrowthTimelineOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 760)
  const [topicDraft, setTopicDraft] = useState('')
  const askCardRef = useRef<HTMLElement | null>(null)
  // 移动端：滚动超过一屏后显示"回到顶部"浮动按钮
  const [showBackToTop, setShowBackToTop] = useState(false)
  const workspaceRef = useRef<HTMLElement | null>(null)

  // 渐进式功能展示：根据用户数据量决定哪些功能按钮可见
  const nodeCount = Object.keys(app.state.nodes).length
  const hasNodes = nodeCount > 0
  const hasEnoughNodes = nodeCount >= 3 // 有足够节点才展示图谱/路径/统计

  // 功能解锁提示：首次解锁时发通知，4 秒后移除视觉标记
  const reviewUnlockTime = useRef(0)
  const advancedUnlockTime = useRef(0)
  const [reviewJustUnlocked, setReviewJustUnlocked] = useState(false)
  const [advancedJustUnlocked, setAdvancedJustUnlocked] = useState(false)
  useEffect(() => {
    if (hasNodes && !reviewUnlockTime.current) {
      reviewUnlockTime.current = Date.now()
      setReviewJustUnlocked(true)
      setNotice('新功能解锁：侧边栏新增了「复习」入口，帮你回顾已学知识。')
      setTimeout(() => setReviewJustUnlocked(false), 4000)
    }
    if (hasEnoughNodes && !advancedUnlockTime.current) {
      advancedUnlockTime.current = Date.now()
      setAdvancedJustUnlocked(true)
      setNotice('新功能解锁：侧边栏新增了「路径」「图谱」「统计」，帮你从全局视角掌握学习进度。')
      setTimeout(() => setAdvancedJustUnlocked(false), 4000)
    }
  }, [hasNodes, hasEnoughNodes])

  const setNotice = app.setNotice
  const profileSummary = app.profile ? profileSummaryForPrompt(app.profile, app.selectedTopic?.id ?? null) : undefined
  const gen = useGeneration(app.state, app.selectedTopic, { addNode: app.addNode, openNode: app.openNode }, setNotice, profileSummary)
  const voice = useVoiceInput(gen.setQuestion, setNotice)
  const onboarding = useOnboarding()

  // P3: 周报数据
  const weeklyReport = useWeeklyReport(app.state.nodes, app.state.topics, app.streak.currentStreak)

  // 跳转高亮：从路径/图谱/搜索/复习跳转后，学习卡片闪烁高亮以提供视觉反馈
  const [cardHighlightKey, setCardHighlightKey] = useState(0)

  // 统一的"跳转到节点"处理：关闭来源弹窗 → 打开节点 → 滚动 → 高亮卡片 → 通知
  const jumpToNode = useCallback((nodeId: string, opts?: { closeModal?: () => void; source?: string }) => {
    const { closeModal, source } = opts || {}
    const node = app.state.nodes[nodeId]
    if (closeModal) closeModal()
    app.openNode(nodeId)
    setCardHighlightKey((k) => k + 1)
    if (node) {
      setNotice(`已跳转到「${node.short_title}」${source ? ` · 来自${source}` : ''}`)
    }
    // 延迟滚动等卡片渲染完成
    setTimeout(() => {
      document.querySelector('.learning-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }, [app, setNotice])

  // Auto-import config from shared URL hash
  useEffect(() => {
    const config = decodeConfigFromHash()
    if (config) {
      // 先保存到 localStorage，再刷新页面让完整应用加载
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        const state = saved ? JSON.parse(saved) : {}
        state.apiKey = config.k
        if (config.b) state.apiBase = config.b
        if (config.m) state.model = config.m
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch { /* ignore parse error */ }
      clearConfigHash()
      // 分享链接首次打开，刷新页面确保 SW 注册和新配置加载
      window.location.reload()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (event.key === 'Escape') {
        setSettingsOpen(false)
        setSearchOpen(false)
        setReviewOpen(false)
        setTemplateMarketOpen(false)
        setStatsOpen(false)
        setQuizOpen(false)
        setGraphOpen(false)
        setPathOpen(false)
        setWeeklyReportOpen(false)
        setGrowthTimelineOpen(false)
        app.quiz.closeSession()
        app.feynman.closeFeynman()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Persistence error notice
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      if (event.message?.includes('QuotaExceededError') || event.message?.includes('storage')) {
        setNotice('本地保存失败：浏览器存储空间可能已满。请先导出备份，再清理旧节点。')
      }
    }
    window.addEventListener('error', handler)
    return () => window.removeEventListener('error', handler)
  }, [])

  // SRS 复习提醒（首次加载时显示）
  const hasShownSrsReminder = useRef(false)
  useEffect(() => {
    if (hasShownSrsReminder.current) return
    if (app.srsDueCount <= 0) return
    hasShownSrsReminder.current = true

    const timer = setTimeout(() => {
      setNotice(`你有 ${app.srsDueCount} 个知识点该复习了，打开复习面板看看吧。`)
    }, 1500)

    return () => clearTimeout(timer)
  }, [app.srsDueCount])

  // 移动端：监听页面滚动，控制"回到顶部"按钮显隐
  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > window.innerHeight * 0.8)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleBackToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // 移动端：快速跳转到追问区域
  const handleJumpToFollowups = useCallback(() => {
    document.querySelector('.followup-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleGenerate = useCallback((inputQuestion: string, parentId: string | null, roleHint?: LearningRole) => {
    askCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    void gen.generateNode(inputQuestion, parentId, roleHint)
    onboarding.markFirstQuestionDone()
  }, [gen, onboarding])

  const handleAskFollowup = useCallback((followup: FollowupQuestion) => {
    const node = app.selectedNode
    if (!node) return
    askCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    void gen.generateFollowupBatch(node.id, [followup])
  }, [app.selectedNode, gen])

  const handleAskFollowups = useCallback((followups: FollowupQuestion[]) => {
    const node = app.selectedNode
    if (!node || !followups.length) return
    askCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    void gen.generateFollowupBatch(node.id, followups)
  }, [app.selectedNode, gen])

  const handleQuickShare = useCallback(() => {
    if (!app.state.apiKey.trim()) {
      setNotice('请先在设置中填写 API Key，然后才能分享给朋友。')
      setSettingsOpen(true)
      return
    }
    const link = generateShareLink(app.state.apiKey, app.state.apiBase, app.state.model)
    if (!link) {
      setNotice('生成分享链接失败，请重试。')
      return
    }
    navigator.clipboard.writeText(link).then(
      () => setNotice('分享链接已复制到剪贴板！发给朋友打开即可直接使用，无需配置 API。'),
      () => {
        // Fallback: open settings so user can see the link
        setSettingsOpen(true)
        setNotice('复制失败，请在设置中手动复制分享链接。')
      },
    )
  }, [app.state.apiKey, app.state.apiBase, app.state.model, setNotice])

  const handleExportData = useCallback(() => {
    const data = app.exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `探索式学习备份-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [app])

  const handleExportTemplate = useCallback((topicId: string, event?: React.MouseEvent) => {
    // 防御性检查：确保事件来源于真实的用户点击，而非事件冒泡或程序化触发
    if (event) {
      const target = event.target as HTMLElement
      // 校验点击目标确实是导出按钮本身（或其子元素），排除冒泡误触发
      if (!target.closest('.topic-export-btn')) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
    }
    const template = app.exportTopicAsTemplate(topicId)
    if (!template) {
      setNotice('这个主题下没有节点，无法导出为模板。')
      return
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `模板-${template._template_meta.title}-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice(`「${template._template_meta.title}」已导出为模板（${template._template_meta.node_count} 个节点），可分享给他人导入使用。`)
  }, [app])

  const handleImportData = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      const raw = JSON.parse(text) as Record<string, unknown>
      app.importData(raw)
      setNotice('数据已导入。当前 API Key、API 地址不会被导入文件覆盖。')
    } catch {
      setNotice('导入失败：文件不是有效的学习档案 JSON，当前数据未改变。')
    }
  }, [app])

  const handleImportBuiltIn = useCallback(async (template: TemplateMeta) => {
    if (importing) return
    setImporting(true)
    try {
      const response = await fetch(template.url)
      if (!response.ok) throw new Error('Network error')
      const templateData = await response.json()
      const msg = await app.importBuiltInTemplate(templateData)
      if (msg) setNotice(msg)
      setTemplateMarketOpen(false)
    } catch {
      setNotice('模板加载失败，请检查网络后重试。')
    } finally {
      setImporting(false)
    }
  }, [app, importing])

  const handleImportTemplateFile = useCallback(async (file: File) => {
    if (importing) return
    setImporting(true)
    try {
      const text = await file.text()
      const templateData = JSON.parse(text)
      const msg = app.importTemplateFile(templateData)
      if (msg) setNotice(msg)
    } catch {
      setNotice('导入失败：文件不是有效的模板 JSON，当前数据未改变。')
    } finally {
      setImporting(false)
    }
  }, [app, importing])

  const handleClearAll = useCallback(() => {
    if (!confirm('确定清空所有本地数据吗？此操作不可恢复。')) return
    app.clearAll()
    setNotice('本地数据已清空。')
  }, [app])

  // P3: Anki 导出（全部节点）
  const handleAnkiExport = useCallback(() => {
    const nodeList = Object.values(app.state.nodes)
    if (nodeList.length === 0) {
      setNotice('还没有学习节点，无法导出。')
      return
    }
    downloadAnkiExport(nodeList, app.state.topics)
    setNotice(`已导出 ${nodeList.length} 张 Anki 卡片，在 Anki 中选择「导入」即可使用。`)
  }, [app.state.nodes, app.state.topics, setNotice])

  // P3: Anki 导出（单主题）
  const handleAnkiExportTopic = useCallback((topicId: string) => {
    const nodeList = Object.values(app.state.nodes).filter((n) => n.topic_id === topicId)
    if (nodeList.length === 0) {
      setNotice('这个主题下没有节点，无法导出。')
      return
    }
    exportAnkiForTopic(Object.values(app.state.nodes), app.state.topics, topicId)
    setNotice(`已导出「${app.state.topics.find((t) => t.id === topicId)?.title || '主题'}」的 ${nodeList.length} 张 Anki 卡片。`)
  }, [app.state.nodes, app.state.topics, setNotice])

  // 开始闪测：从待复习节点中选择
  const handleStartQuiz = useCallback(() => {
    const dueNodes = Object.values(app.state.nodes).filter(
      (n) => n.mastery.is_visited && isReviewDue(n.mastery.next_review_at, Date.now()),
    )
    if (dueNodes.length === 0) {
      setNotice('当前没有到期复习的节点，过一会儿再来看看。')
      return
    }
    app.quiz.startSession(dueNodes)
    setQuizOpen(true)
  }, [app])

  // 开始当前节点的闪测
  const handleSingleNodeQuiz = useCallback(() => {
    if (!app.selectedNode) return
    app.quiz.startSingleNodeQuiz(app.selectedNode)
    setQuizOpen(true)
  }, [app])

  // 费曼语音输入
  const handleFeynmanVoice = useCallback(() => {
    voice.toggleVoiceInput(app.feynman.explanation)
  }, [voice, app.feynman.explanation])

  const searchResults = app.searchResults(searchQuery, roleFilter)
  const reviewResults = app.reviewResults(reviewFilter)

  return (
    <ErrorBoundary onExport={handleExportData}>
      <div className="app-shell">
        <aside className={sidebarCollapsed ? 'sidebar collapsed' : 'sidebar'}>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
            {sidebarCollapsed ? '展开分类与知识树' : '收起'}
          </button>

          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="44" height="44" rx="12" fill="#fef9ef" />
                <path d="M12 17 Q7 4 16 13" fill="#fef9ef" stroke="#302719" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M13 16 Q10 7 16 13" fill="#f5d5c8" stroke="none" />
                <path d="M36 17 Q41 4 32 13" fill="#fef9ef" stroke="#302719" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M35 16 Q38 7 32 13" fill="#f5d5c8" stroke="none" />
                <ellipse cx="24" cy="24" rx="13" ry="12" fill="#fef9ef" stroke="#302719" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <ellipse cx="24" cy="27" rx="7.5" ry="5" fill="#fffdf7" />
                <circle cx="18.5" cy="21.5" r="3.2" fill="#fffdf7" stroke="#302719" stroke-width="1.5" stroke-linecap="round" />
                <circle cx="18.5" cy="21.5" r="2.2" fill="#5a8fa8" />
                <ellipse cx="19" cy="21" rx="0.6" ry="1" fill="#2c3e50" />
                <ellipse cx="19.2" cy="20.5" rx="0.5" ry="0.7" fill="#fff" />
                <circle cx="29.5" cy="21.5" r="3.2" fill="#fffdf7" stroke="#302719" stroke-width="1.5" stroke-linecap="round" />
                <circle cx="29.5" cy="21.5" r="2.2" fill="#5a8fa8" />
                <ellipse cx="30" cy="21" rx="0.6" ry="1" fill="#2c3e50" />
                <ellipse cx="30.2" cy="20.5" rx="0.5" ry="0.7" fill="#fff" />
                <path d="M22.5 25.5 L24 23.5 L25.5 25.5 Q24 27.5 22.5 25.5Z" fill="#e8a0a0" stroke="#302719" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M21 27.5 Q24 29.5 27 27.5" fill="none" stroke="#302719" stroke-width="1.2" stroke-linecap="round" />
                <line x1="15" y1="25.5" x2="5" y2="24.5" stroke="#5a4a3a" stroke-width="1" stroke-linecap="round" />
                <line x1="15" y1="27" x2="5" y2="27.5" stroke="#5a4a3a" stroke-width="1" stroke-linecap="round" />
                <line x1="15" y1="28.5" x2="6" y2="30" stroke="#5a4a3a" stroke-width="1" stroke-linecap="round" />
                <line x1="33" y1="25.5" x2="43" y2="24.5" stroke="#5a4a3a" stroke-width="1" stroke-linecap="round" />
                <line x1="33" y1="27" x2="43" y2="27.5" stroke="#5a4a3a" stroke-width="1" stroke-linecap="round" />
                <line x1="33" y1="28.5" x2="42" y2="30" stroke="#5a4a3a" stroke-width="1" stroke-linecap="round" />
                <ellipse cx="15" cy="26" rx="2" ry="1.2" fill="#e8a0a0" opacity="0.4" />
                <ellipse cx="33" cy="26" rx="2" ry="1.2" fill="#e8a0a0" opacity="0.4" />
                <text x="38" y="40" fontSize="9" fontFamily="serif" fill="#df8a28" fontWeight="bold" opacity="0.7">?</text>
              </svg>
            </div>
            <div>
              <h1>探索式学习</h1>
              <p>用追问，把答案变成知识树</p>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={() => setSearchOpen(true)} title="Ctrl+K 搜索">搜索</button>
            {hasNodes && (
              <button className={`review-entry${app.dueReviewCount ? ' active' : ''}${reviewJustUnlocked ? ' feature-new' : ''}`} onClick={() => setReviewOpen(true)}>
                复习 {app.dueReviewCount || ''}
              </button>
            )}
            {hasNodes && app.srsDueCount > 0 && (
              <button className={`quiz-entry active${reviewJustUnlocked ? ' feature-new' : ''}`} onClick={handleStartQuiz}>
                闪测 {app.srsDueCount}
              </button>
            )}
            {hasEnoughNodes && (
              <button className={advancedJustUnlocked ? 'feature-new' : ''} onClick={() => setPathOpen(true)}>
                路径
              </button>
            )}
            {hasEnoughNodes && (
              <button className={advancedJustUnlocked ? 'feature-new' : ''} onClick={() => setGraphOpen(true)}>图谱</button>
            )}
            {hasEnoughNodes && (
              <button className={advancedJustUnlocked ? 'feature-new' : ''} onClick={() => setStatsOpen(true)}>统计</button>
            )}
            {hasNodes && (
              <button onClick={() => setWeeklyReportOpen(true)}>周报</button>
            )}
            {hasNodes && (
              <button onClick={() => setGrowthTimelineOpen(true)}>成长</button>
            )}
            {hasNodes && (
              <button onClick={handleAnkiExport} title="导出为 Anki 可导入的文本文件">Anki</button>
            )}
            <button onClick={() => setSettingsOpen(true)}>设置</button>
            <button className="share-btn" onClick={handleQuickShare}>分享</button>
          </div>

          <div className="template-import-row">
            <button className="template-btn" disabled={importing} onClick={() => setTemplateMarketOpen(true)}>
              {importing ? '导入中...' : '模板市场'}
            </button>
          </div>

          {hasNodes && (
            <form
              className="topic-form"
              onSubmit={(event) => {
                event.preventDefault()
                app.createTopic(topicDraft)
                setTopicDraft('')
              }}
            >
              <input
                value={topicDraft}
                onChange={(event) => setTopicDraft(event.target.value)}
                placeholder="新建分类文件夹，例如：概率论"
              />
              <button type="submit">新建分类</button>
            </form>
          )}

          <div className="topic-list">
            {app.state.topics.map((topic) => (
              <div
                key={topic.id}
                className={topic.id === app.state.selectedTopicId ? 'topic active' : 'topic'}
                onClick={() => app.setState((current) => ({ ...current, selectedTopicId: topic.id, selectedNodeId: null }))}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    app.setState((current) => ({ ...current, selectedTopicId: topic.id, selectedNodeId: null }))
                  }
                }}
              >
                <span>{topic.title}</span>
                <div className="topic-meta">
                  <small>{Object.values(app.state.nodes).filter((n) => n.topic_id === topic.id).length} 节点</small>
                  <button className="topic-export-btn" title="导出为模板分享" onClick={(event) => handleExportTemplate(topic.id, event)}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                      <path d="M8 2v8" />
                      <path d="M4 7l4 4 4-4" />
                      <path d="M2 13h12" />
                    </svg>
                  </button>
                  <button className="topic-anki-btn" title="导出为 Anki 卡片" onClick={(event) => { event.stopPropagation(); handleAnkiExportTopic(topic.id) }}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                      <rect x="2" y="3" width="12" height="10" rx="2" />
                      <path d="M2 7h12" />
                      <path d="M6 10h4" />
                    </svg>
                  </button>
                  <button className="topic-delete-btn" title="删除此分类" onClick={(event) => { event.stopPropagation(); app.deleteTopic(topic.id) }}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="tree-panel">
            <div className="panel-title">
              知识树
              {app.selectedTopic && app.topicNodes.some((n) => n.quality.generation_status === 'pending') && (
                <button className="batch-generate-btn" disabled={gen.isGenerating || importing} onClick={() => gen.batchGenerateTopic(app.selectedTopic!.id)} title="批量生成当前主题下所有 pending 节点">
                  批量生成
                </button>
              )}
            </div>
            {app.selectedTopic ? (
              <NodeTree nodes={app.state.nodes} topicId={app.selectedTopic.id} selectedNodeId={app.state.selectedNodeId} onSelect={app.selectNode} onDeleteNode={app.deleteNode} />
            ) : (
              <p className="empty">提问后会在这里长出知识树</p>
            )}
          </div>
        </aside>
        {!sidebarCollapsed && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarCollapsed(true)}
            onKeyDown={(e) => { if (e.key === 'Escape') setSidebarCollapsed(true) }}
            aria-hidden="true"
          />
        )}

        <main className="workspace" ref={workspaceRef}>
          <header className="topbar">
            <div>
              <p className="eyebrow">探索式学习</p>
              <h2>{app.selectedTopic?.title || '开始一个新的学习主题'}</h2>
            </div>
            <div className="status-pills">
              <button className={app.state.apiKey ? 'status-pill api-live' : 'status-pill demo-live'} onClick={() => setSettingsOpen(true)}>
                {app.state.apiKey ? '真实 API' : '演示模式'}
              </button>
              {!app.state.apiKey && (
                <button className="status-pill api-config-hint" onClick={() => setSettingsOpen(true)}>
                  未配置 API，点击设置
                </button>
              )}
              <span>{app.topicNodes.length} 个节点</span>
            </div>
          </header>

          {app.notice && (
            <div className="notice notice-row">
              <span>{app.notice}</span>
              {gen.lastFailedDraft && (
                <button onClick={gen.retryLastFailedDraft} disabled={gen.isGenerating}>重试生成</button>
              )}
            </div>
          )}

          <section className={`ask-card${onboarding.showPulse && !app.selectedNode ? ' pulse-highlight' : ''}`} ref={askCardRef}>
            <div className="breadcrumb">
              {app.nodePath.length ? app.nodePath.map((node) => node.short_title).join(' › ') : '根问题'}
            </div>
            <textarea
              id="question-input"
              value={gen.question}
              onChange={(event) => gen.setQuestion(event.target.value)}
              placeholder={app.selectedNode ? `继续追问：${app.selectedNode.short_title}` : '输入你真正想学的问题，例如：什么是马尔可夫链？'}
            />
            <div className="ask-actions">
              <button disabled={gen.isGenerating || !gen.question.trim()} onClick={() => handleGenerate(gen.question, app.selectedNode?.id || null)}>
                {gen.isGenerating ? '生成中...' : app.selectedNode ? '作为子节点追问' : '生成学习卡片'}
              </button>
              <button className={voice.isListening ? 'voice-button active' : 'voice-button'} onClick={() => voice.toggleVoiceInput(gen.question)} disabled={gen.isGenerating} type="button">
                <svg className="voice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                {voice.isListening ? '正在聆听…' : voice.voiceSupported ? '语音输入' : '语音不可用'}
              </button>
            </div>
            {gen.isGenerating && (
              <div className="generation-progress">
                <div className="progress-orbit" />
                <div>
                  <strong>{GENERATION_STEPS[gen.generationStep].title}</strong>
                  <p>{gen.batchProgress
                    ? gen.batchProgress.mode === 'parallel'
                      ? `正在并行生成 ${gen.batchProgress.total} 个追问节点... ${GENERATION_STEPS[gen.generationStep].detail}`
                      : `正在生成第 ${gen.batchProgress.current}/${gen.batchProgress.total} 个追问。${GENERATION_STEPS[gen.generationStep].detail}`
                    : GENERATION_STEPS[gen.generationStep].detail}</p>
                  <div className="progress-rail"><span style={{ width: GENERATION_STEPS[gen.generationStep].width }} /></div>
                </div>
              </div>
            )}
          </section>

          {app.selectedNode ? (
            <div ref={gen.answerRef}>
              <LearningCard
                node={app.selectedNode}
                isGenerating={gen.isGenerating}
                highlightKey={cardHighlightKey}
                onNotice={setNotice}
                onToggleStar={() => app.toggleStar(app.selectedNode!.id)}
                onConfidence={(value) => app.setConfidence(app.selectedNode!.id, value)}
                onCheckStatus={(status) => app.setCheckStatus(app.selectedNode!.id, status)}
                onAskFollowup={(followup) => handleAskFollowup(followup)}
                onAskFollowups={(followups) => handleAskFollowups(followups)}
                onFeedback={(followupId, feedback) => app.recordFeedback(app.selectedNode!.id, followupId, feedback)}
                onReplaceFollowups={(angle) => app.replaceFollowups(app.selectedNode!, angle)}
                onGenerate={app.selectedNode.quality.generation_status === 'pending' ? () => void handleGenerate(app.selectedNode!.question, app.selectedNode!.parent_id) : undefined}
                onSingleNodeQuiz={handleSingleNodeQuiz}
                onOpenFeynman={() => app.feynman.openFeynman(app.selectedNode!)}
              />
            </div>
          ) : (
            <EmptyCanvas
              hasApiKey={Boolean(app.state.apiKey)}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenTemplateMarket={() => setTemplateMarketOpen(true)}
            />
          )}
        </main>

        {/* 移动端浮动按钮：回到顶部 + 快速追问 */}
        {showBackToTop && (
          <div className="mobile-fab-group">
            {app.selectedNode && (
              <button
                className="mobile-fab fab-followup"
                onClick={handleJumpToFollowups}
                title="跳转到追问区"
                aria-label="跳转到追问区"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            )}
            <button
              className="mobile-fab fab-top"
              onClick={handleBackToTop}
              title="回到顶部"
              aria-label="回到顶部"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        )}

        {settingsOpen && (
          <SettingsModal
            apiKey={app.state.apiKey}
            apiBase={app.state.apiBase}
            model={app.state.model}
            preference={app.state.preference}
            onClose={() => setSettingsOpen(false)}
            onApiKeyChange={(apiKey) => app.patchState((current) => ({ ...current, apiKey }))}
            onApiBaseChange={(apiBase) => app.patchState((current) => ({ ...current, apiBase }))}
            onModelChange={(model) => app.patchState((current) => ({ ...current, model }))}
            onExport={handleExportData}
            onImport={(file) => void handleImportData(file)}
            onClearAll={handleClearAll}
            onResetOnboarding={onboarding.reset}
          />
        )}

        {templateMarketOpen && (
          <TemplateMarket
            open={templateMarketOpen}
            importing={importing}
            onClose={() => setTemplateMarketOpen(false)}
            onImportBuiltIn={handleImportBuiltIn}
            onImportFile={(file) => void handleImportTemplateFile(file)}
          />
        )}

        {searchOpen && (
          <SearchModal
            searchQuery={searchQuery}
            roleFilter={roleFilter}
            tagCloud={app.tagCloud}
            searchResults={searchResults}
            onClose={() => setSearchOpen(false)}
            onSearchQueryChange={setSearchQuery}
            onRoleFilterChange={setRoleFilter}
            onOpenNode={(nodeId: string) => jumpToNode(nodeId, { closeModal: () => setSearchOpen(false), source: '搜索' })}
          />
        )}

        {reviewOpen && (
          <ReviewModal
            reviewFilter={reviewFilter}
            reviewResults={reviewResults}
            dueReviewCount={app.dueReviewCount}
            currentTopicReviewCount={app.currentTopicReviewCount}
            starredReviewCount={app.starredReviewCount}
            onClose={() => setReviewOpen(false)}
            onReviewFilterChange={setReviewFilter}
            onOpenNode={(nodeId: string) => jumpToNode(nodeId, { closeModal: () => setReviewOpen(false), source: '复习' })}
            onStartQuiz={handleStartQuiz}
          />
        )}

        {quizOpen && (
          <QuizModal
            currentQuiz={app.quiz.currentQuiz}
            currentNodeTitle={app.quiz.currentNode?.short_title || null}
            progress={app.quiz.progress}
            showAnswer={app.quiz.showAnswer}
            isComplete={app.quiz.isComplete}
            sessionStats={app.quiz.sessionStats}
            onRevealAnswer={app.quiz.revealAnswer}
            onRate={app.quiz.rateAndNext}
            onSkip={app.quiz.skipCurrent}
            onClose={() => { app.quiz.closeSession(); setQuizOpen(false) }}
          />
        )}

        <FeynmanModal
          isOpen={app.feynman.isOpen}
          activeNode={app.feynman.activeNode}
          explanation={app.feynman.explanation}
          mode={app.feynman.mode}
          isSubmitting={app.feynman.isSubmitting}
          feedback={app.feynman.feedback}
          isVoiceListening={voice.isListening}
          onClose={app.feynman.closeFeynman}
          onReset={app.feynman.resetFeynman}
          onExplanationChange={app.feynman.setExplanation}
          onVoiceInput={handleFeynmanVoice}
          onSubmit={() => void app.feynman.submitExplanation()}
        />

        <OnboardingModal open={onboarding.open} onFinish={onboarding.finish} hasApiKey={Boolean(app.state.apiKey)} onOpenSettings={() => setSettingsOpen(true)} />

        {statsOpen && (
          <StatsModal
            nodes={app.state.nodes}
            topics={app.state.topics}
            dueReviewCount={app.dueReviewCount}
            profile={app.profile}
            heatmap={app.streak.heatmap}
            currentStreak={app.streak.currentStreak}
            longestStreak={app.streak.longestStreak}
            totalActiveDays={app.streak.totalActiveDays}
            srsWeek={app.streak.srsWeek}
            onClose={() => setStatsOpen(false)}
          />
        )}

        {graphOpen && (
          <KnowledgeGraphModal
            isOpen={graphOpen}
            graphData={app.knowledgeGraph.graphData}
            visibleEdgeTypes={app.knowledgeGraph.visibleEdgeTypes}
            onToggleEdgeType={app.knowledgeGraph.toggleEdgeType}
            highlightMastery={app.knowledgeGraph.highlightMastery}
            onSetHighlightMastery={app.knowledgeGraph.setHighlightMastery}
            selectedNodeId={app.state.selectedNodeId}
            onClose={() => setGraphOpen(false)}
            onOpenNode={(nodeId: string) => jumpToNode(nodeId, { closeModal: () => setGraphOpen(false), source: '图谱' })}
            editMode={app.knowledgeGraph.editMode}
            onSetEditMode={app.knowledgeGraph.setEditMode}
            linkSourceId={app.knowledgeGraph.linkSourceId}
            onEditNodeClick={app.knowledgeGraph.handleEditNodeClick}
            onToggleLink={app.toggleLink}
            onSetNodePosition={app.knowledgeGraph.setNodePosition}
            onResetLayout={app.knowledgeGraph.resetLayout}
          />
        )}

        {pathOpen && (
          <LearningPathModal
            isOpen={pathOpen}
            pathSteps={app.learningPath.pathSteps}
            categoryFilter={app.learningPath.categoryFilter}
            onSetCategoryFilter={app.learningPath.setCategoryFilter}
            categoryCounts={app.learningPath.categoryCounts}
            onClose={() => setPathOpen(false)}
            onOpenNode={(nodeId: string) => jumpToNode(nodeId, { closeModal: () => setPathOpen(false), source: '路径' })}
          />
        )}

        {weeklyReportOpen && (
          <WeeklyReportModal
            report={weeklyReport}
            onClose={() => setWeeklyReportOpen(false)}
          />
        )}

        {growthTimelineOpen && (
          <GrowthTimelineModal
            nodes={app.state.nodes}
            topics={app.state.topics}
            onClose={() => setGrowthTimelineOpen(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  )
}

function EmptyCanvas({ hasApiKey, onOpenSettings, onOpenTemplateMarket }: { hasApiKey: boolean; onOpenSettings: () => void; onOpenTemplateMarket: () => void }) {
  return (
    <section className="empty-canvas">
      {!hasApiKey ? (
        <div className="api-setup-guide">
          <div className="api-setup-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="24" cy="24" r="18" />
              <path d="M18 24h12M24 18v12" />
            </svg>
          </div>
          <h2>先配置 API Key，然后开始学习</h2>
          <p className="api-setup-desc">Key 只保存在本地浏览器，不会上传</p>
          <button className="api-setup-btn" onClick={onOpenSettings}>开始配置</button>
          <button className="api-setup-skip" onClick={onOpenTemplateMarket}>
            或先试用内置模板 →
          </button>
        </div>
      ) : (
        <>
          <div className="orbital"><span /><span /><span /></div>
          <h2>在上方输入框写下你想学的问题</h2>
          <p>例如：什么是马尔可夫链？为什么 React 用虚拟 DOM？</p>
        </>
      )}
    </section>
  )
}
