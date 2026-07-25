import { useRef } from 'react'

export interface TemplateMeta {
  id: string
  title: string
  author: string
  description: string
  version: string
  nodeCount: number
  tags: string[]
  url: string
}

export const BUILT_IN_TEMPLATES: TemplateMeta[] = [
  {
    id: 'prompt-thinking',
    title: 'AI 提示词思维',
    author: '探索式学习',
    description: '从零开始理解 AI 提示词工程的核心思维，涵盖 AI 原理、提示词技巧、幻觉问题、上下文管理、CoT、角色设定等专家路径。',
    version: '1.0.0',
    nodeCount: 20,
    tags: ['AI', '提示词', '提示工程', 'AI思维'],
    url: '/templates/prompt-thinking.json',
  },
  {
    id: 'critical-thinking',
    title: '批判性思维入门',
    author: '探索式学习',
    description: '从区分事实与观点开始，掌握论证结构识别、认知偏差规避、证据评估和反思维度，建立日常可用的批判性思维框架。',
    version: '1.0.0',
    nodeCount: 6,
    tags: ['思维', '批判性思维', '逻辑', '认知偏差'],
    url: '/templates/critical-thinking.json',
  },
  {
    id: 'learning-methods',
    title: '高效学习方法论',
    author: '探索式学习',
    description: '从费曼技巧、间隔重复、主动回忆到元认知监控，建立一套可落地的高效学习系统，让知识真正留存并能迁移。',
    version: '1.0.0',
    nodeCount: 5,
    tags: ['学习方法', '认知科学', '效率', '记忆'],
    url: '/templates/learning-methods.json',
  },
]

export function TemplateMarket(props: {
  open: boolean
  importing: boolean
  onClose: () => void
  onImportBuiltIn: (template: TemplateMeta) => void
  onImportFile: (file: File) => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!props.open) return null

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal template-market" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>模板市场</h2>
          <button onClick={props.onClose}>关闭</button>
        </div>

        <div className="template-market-intro">
          <p>活模板是领域专家的提问思维路径。导入后，你可以沿着推荐路线追问，也可以自由岔出探索。</p>
        </div>

        <div className="template-list">
          {BUILT_IN_TEMPLATES.map((template) => (
            <article key={template.id} className="template-card">
              <div className="template-card-head">
                <h3>{template.title}</h3>
                <span className="template-version">v{template.version}</span>
              </div>
              <p className="template-desc">{template.description}</p>
              <div className="template-meta-row">
                <span className="template-author">@{template.author}</span>
                <span className="template-node-count">{template.nodeCount} 个节点</span>
              </div>
              <div className="tag-row">
                {template.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <button
                className="template-import-btn"
                disabled={props.importing}
                onClick={() => props.onImportBuiltIn(template)}
              >
                {props.importing ? '导入中...' : '导入此模板'}
              </button>
            </article>
          ))}
        </div>

        <div className="template-file-section">
          <p>有本地模板文件？</p>
          <button className="ghost" onClick={() => fileInputRef.current?.click()} disabled={props.importing}>
            从文件导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) props.onImportFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}
