import { useRef, useState, useCallback, useMemo } from 'react'
import { preferenceSummary } from '../ai'
import type { UserPreference } from '../types'
import { generateShareLink, decodeConfigFromHash, clearConfigHash, copyToClipboard } from '../utils'
import { Modal } from './Modal'

/* ------------------------------------------------------------------ */
/*  API 渠道预设                                                        */
/* ------------------------------------------------------------------ */

interface ApiPreset {
  id: string
  name: string
  apiBase: string
  model: string
  keyGuide: string
  keyUrl: string
  color: string
}

const API_PRESETS: ApiPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiBase: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-v4-flash',
    keyGuide:
      '前往 platform.deepseek.com 注册，在「API Keys」页面创建 Key，复制到这里。',
    keyUrl: 'https://platform.deepseek.com',
    color: '#4d6bfe',
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    apiBase: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash',
    keyGuide:
      '前往 open.bigmodel.cn 注册，在「API Keys」页面创建 Key，复制到这里。',
    keyUrl: 'https://open.bigmodel.cn',
    color: '#2563eb',
  },
  {
    id: 'qwen',
    name: '通义千问',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-turbo',
    keyGuide:
      '前往 dashscope.console.aliyun.com 注册，在「API-KEY管理」创建 Key，复制到这里。',
    keyUrl: 'https://dashscope.console.aliyun.com',
    color: '#ff6a00',
  },
  {
    id: 'groq',
    name: 'Groq',
    apiBase: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    keyGuide:
      '前往 console.groq.com 注册，在「API Keys」创建 Key，复制到这里。免费使用，速度快。',
    keyUrl: 'https://console.groq.com',
    color: '#f55036',
  },
  {
    id: 'custom',
    name: '其他 / 自定义',
    apiBase: '',
    model: '',
    keyGuide: '选择此项后，可以手动填写 API 地址和模型。',
    keyUrl: '',
    color: '#6b7280',
  },
]

/** 根据当前 apiBase 自动匹配最可能的预设 id */
function matchPreset(apiBase: string): string {
  if (!apiBase) return ''
  const base = apiBase.trim().toLowerCase()
  for (const p of API_PRESETS) {
    if (p.id === 'custom' || !p.apiBase) continue
    if (base === p.apiBase.toLowerCase() || base.startsWith(p.apiBase.toLowerCase().replace('/chat/completions', ''))) {
      return p.id
    }
  }
  return 'custom'
}

/* ------------------------------------------------------------------ */
/*  keyGuide 渲染辅助：把 URL 变成可点击链接                              */
/* ------------------------------------------------------------------ */

function renderKeyGuide(guide: string, url: string) {
  if (!guide) return null
  if (!url) return <span className="api-key-guide">{guide}</span>
  // 把 guide 中出现 url 的部分替换为 <a>
  const idx = guide.indexOf(url)
  if (idx === -1) return <span className="api-key-guide">{guide}</span>
  return (
    <span className="api-key-guide">
      {guide.slice(0, idx)}
      <a href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
      {guide.slice(idx + url.length)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  SettingsModal                                                       */
/* ------------------------------------------------------------------ */

export function SettingsModal(props: {
  apiKey: string
  apiBase: string
  model: string
  preference: UserPreference
  onClose: () => void
  onApiKeyChange: (value: string) => void
  onApiBaseChange: (value: string) => void
  onModelChange: (value: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onClearAll: () => void
  onResetOnboarding?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null)
  const [shareLink, setShareLink] = useState('')
  const [shareMsg, setShareMsg] = useState('')
  const [configImported, setConfigImported] = useState(() => Boolean(decodeConfigFromHash()))

  /* 当前选中的预设 id，初始化时根据已有 apiBase 自动匹配 */
  const [selectedPresetId, setSelectedPresetId] = useState(() => matchPreset(props.apiBase))

  /* 选中的预设对象 */
  const selectedPreset = useMemo(
    () => API_PRESETS.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId],
  )

  const isCustom = selectedPresetId === 'custom'

  /* ---- 切换预设 ---- */
  const handleSelectPreset = useCallback(
    (preset: ApiPreset) => {
      setSelectedPresetId(preset.id)
      if (preset.id !== 'custom' && preset.apiBase) {
        props.onApiBaseChange(preset.apiBase)
        props.onModelChange(preset.model)
      }
      // 切换预设后自动聚焦到 API Key 输入框
      setTimeout(() => apiKeyInputRef.current?.focus(), 50)
    },
    [props],
  )

  /* ---- 用户手动修改了 apiBase / model 时，自动切到"自定义" ---- */
  const handleApiBaseChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      props.onApiBaseChange(e.target.value)
      if (selectedPresetId !== 'custom' && selectedPreset) {
        if (e.target.value !== selectedPreset.apiBase) {
          setSelectedPresetId('custom')
        }
      }
    },
    [props, selectedPresetId, selectedPreset],
  )

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      props.onModelChange(e.target.value)
      if (selectedPresetId !== 'custom' && selectedPreset) {
        if (e.target.value !== selectedPreset.model) {
          setSelectedPresetId('custom')
        }
      }
    },
    [props, selectedPresetId, selectedPreset],
  )

  const handleGenerateShareLink = useCallback(() => {
    if (!props.apiKey.trim()) {
      setShareMsg('请先填写 API Key 再生成分享链接。')
      setShareLink('')
      return
    }
    const link = generateShareLink(props.apiKey, props.apiBase, props.model)
    if (link) {
      setShareLink(link)
      setShareMsg('链接已生成，复制后发给需要配置的人即可。')
    } else {
      setShareMsg('生成失败，请检查配置。')
      setShareLink('')
    }
  }, [props.apiKey, props.apiBase, props.model])

  /** 三级复制降级：clipboard API → execCommand → Web Share API */
  const handleCopyLink = useCallback(async () => {
    if (!shareLink) return

    const ok = await copyToClipboard(shareLink, '探索式学习 API 配置')
    if (ok) {
      setShareMsg('已复制到剪贴板！发给需要配置的人即可。')
    } else {
      // 全部失败：选中文本方便手动操作
      const input = document.querySelector('.share-link-input') as HTMLInputElement | null
      if (input) {
        input.focus()
        input.select()
      }
      setShareMsg('复制不可用，已选中链接请手动复制。')
    }
  }, [shareLink])

  const handleImportFromLink = useCallback(() => {
    const config = decodeConfigFromHash()
    if (!config) {
      setShareMsg('当前链接不包含配置信息。')
      return
    }
    props.onApiKeyChange(config.k)
    if (config.b) props.onApiBaseChange(config.b)
    if (config.m) props.onModelChange(config.m)
    clearConfigHash()
    setConfigImported(true)
    setShareMsg('配置已从链接导入！API Key 不保存到导出文件中。')
    // 导入后尝试匹配预设
    if (config.b) {
      setSelectedPresetId(matchPreset(config.b))
    }
  }, [props])

  return (
    <Modal title="设置与数据" onClose={props.onClose} className="settings-modal">
      <div className="settings-note">
        <strong>本地安全说明</strong>
        <p>API Key 只保存在当前浏览器本地；导出备份不包含 API Key；导入备份不会覆盖当前 API 地址、模型和 Key。</p>
      </div>

      {configImported && (
        <div className="config-import-banner">
          <strong>检测到分享配置链接</strong>
          <p>有人分享了 API 配置给你，点击下方按钮即可一键导入。</p>
          <button className="config-import-btn" onClick={handleImportFromLink}>
            一键导入分享的配置
          </button>
        </div>
      )}

      {/* ============ API 渠道预设区 ============ */}
      <div className="api-preset-section">
        <p className="api-preset-label">选择你的 AI 服务商</p>
        <div className="api-preset-row">
          {API_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={`api-preset-btn${selectedPresetId === preset.id ? ' active' : ''}`}
              style={{
                '--preset-color': preset.color,
              } as React.CSSProperties}
              onClick={() => handleSelectPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* ============ API Key ============ */}
      <label>
        API Key
        <input
          ref={apiKeyInputRef}
          value={props.apiKey}
          onChange={(event) => props.onApiKeyChange(event.target.value)}
          placeholder="粘贴你的 sk-xxx Key"
          type="password"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {selectedPreset && renderKeyGuide(selectedPreset.keyGuide, selectedPreset.keyUrl)}
      </label>

      {/* ============ API 地址（预设时只读） ============ */}
      <label>
        API 地址
        {isCustom ? (
          <input value={props.apiBase} onChange={handleApiBaseChange} />
        ) : (
          <div className="readonly-input-wrap">
            <input
              readOnly
              value={props.apiBase}
              className="readonly-input"
              title="预设值，切换服务商时自动填充"
            />
            <span className="readonly-lock" title="预设值">&#128274;</span>
          </div>
        )}
      </label>

      {/* ============ 模型（预设时只读） ============ */}
      <label>
        模型
        {isCustom ? (
          <input value={props.model} onChange={handleModelChange} />
        ) : (
          <div className="readonly-input-wrap">
            <input
              readOnly
              value={props.model}
              className="readonly-input"
              title="预设值，切换服务商时自动填充"
            />
            <span className="readonly-lock" title="预设值">&#128274;</span>
          </div>
        )}
      </label>

      <div className="share-config-section">
        <h3>分享配置给其他人</h3>
        <p className="share-hint">生成一个链接发给需要测试的人，他们点开就能自动配置 API，无需手动填写。</p>
        {!shareLink ? (
          <button className="share-link-btn" onClick={handleGenerateShareLink}>
            生成分享链接
          </button>
        ) : (
          <div className="share-link-result">
            <input className="share-link-input" readOnly value={shareLink} onClick={(event) => (event.target as HTMLInputElement).select()} />
            <button className="share-link-btn" onClick={handleCopyLink}>复制链接</button>
            <button className="share-link-btn ghost" onClick={() => { setShareLink(''); setShareMsg('') }}>取消</button>
          </div>
        )}
        {shareMsg && <p className="share-msg">{shareMsg}</p>}
      </div>

      <div className="settings-grid">
        <button onClick={props.onExport}>导出 JSON</button>
        <button onClick={() => fileInputRef.current?.click()}>导入 JSON</button>
        <button className="danger" onClick={props.onClearAll}>
          清空数据
        </button>
        {props.onResetOnboarding && (
          <button onClick={props.onResetOnboarding}>重新显示引导</button>
        )}
      </div>
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="application/json"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) props.onImport(file)
          event.currentTarget.value = ''
        }}
      />
      <div className="preference-box">
        <h3>本地偏好摘要</h3>
        <pre>{preferenceSummary(props.preference) || '暂无偏好，使用一段时间后会自动形成。'}</pre>
      </div>
    </Modal>
  )
}
