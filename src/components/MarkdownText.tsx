import { type ReactNode } from 'react'

/** 渲染行内格式：**加粗**、`代码`、[链接](url) */
function renderInline(text: string, baseKey: string): ReactNode[] {
  const parts: ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    const codeMatch = remaining.match(/`(.+?)`/)
    const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/)

    const boldIdx = boldMatch?.index ?? -1
    const codeIdx = codeMatch?.index ?? -1
    const linkIdx = linkMatch?.index ?? -1

    // 选取最先出现的匹配
    let first = boldIdx
    if (first === -1 || (codeIdx !== -1 && codeIdx < first)) first = codeIdx
    if (first === -1 || (linkIdx !== -1 && linkIdx < first)) first = linkIdx

    if (first === boldIdx && boldMatch) {
      if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx))
      parts.push(<strong key={`${baseKey}-b${key++}`}>{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldIdx + boldMatch[0].length)
    } else if (first === codeIdx && codeMatch) {
      if (codeIdx > 0) parts.push(remaining.slice(0, codeIdx))
      parts.push(<code key={`${baseKey}-c${key++}`}>{codeMatch[1]}</code>)
      remaining = remaining.slice(codeIdx + codeMatch[0].length)
    } else if (first === linkIdx && linkMatch) {
      if (linkIdx > 0) parts.push(remaining.slice(0, linkIdx))
      parts.push(
        <a key={`${baseKey}-a${key++}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer">
          {linkMatch[1]}
        </a>
      )
      remaining = remaining.slice(linkIdx + linkMatch[0].length)
    } else {
      parts.push(remaining)
      break
    }
  }

  return parts.length ? parts : [text]
}

/** 轻量 Markdown 渲染：加粗、行内代码、链接、列表、引用、标题、代码块、分隔线、表格 */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let key = 0

  function flushList() {
    if (!listItems.length) return
    const items = listItems.map((item, i) => <li key={i}>{renderInline(item, `li${key}`)}</li>)
    if (listType === 'ol') {
      blocks.push(<ol key={`ol${key++}`}>{items}</ol>)
    } else {
      blocks.push(<ul key={`ul${key++}`}>{items}</ul>)
    }
    listItems = []
    listType = null
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/)
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/)

    if (bulletMatch) {
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(bulletMatch[1])
      continue
    }

    if (numberedMatch) {
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(numberedMatch[1])
      continue
    }

    flushList()

    // 代码块：收集 ``` ... ``` 之间的所有行
    const codeBlockStart = trimmed.match(/^```(\w*)$/)
    if (codeBlockStart) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push(
        <pre key={`pre${key++}`} style={{ background: '#f5f5f5', padding: '8px 12px', borderRadius: 4, overflow: 'auto' }}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // 分隔线：--- 或 ***
    if (/^[-*]{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr${key++}`} />)
      continue
    }

    // GFM 表格：检测以 | 开头的行序列
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const headerCells = trimmed.split('|').slice(1, -1).map((c) => c.trim())
      i++ // 跳过分隔行
      const bodyRows: string[][] = []
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].trim().endsWith('|')) {
        i++
        bodyRows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()))
      }
      blocks.push(
        <table key={`tbl${key++}`}>
          <thead><tr>{headerCells.map((c, ci) => <th key={ci}>{renderInline(c, `th${key}-${ci}`)}</th>)}</tr></thead>
          {bodyRows.length > 0 && (
            <tbody>{bodyRows.map((row, ri) => <tr key={ri}>{row.map((c, ci) => <td key={ci}>{renderInline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          )}
        </table>
      )
      continue
    }

    if (trimmed.startsWith('> ')) {
      blocks.push(<blockquote key={`bq${key++}`}>{renderInline(trimmed.slice(2), `bq${key}`)}</blockquote>)
      continue
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(<h3 key={`h1-${key++}`}>{renderInline(trimmed.slice(2), `h1${key}`)}</h3>)
      continue
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(<h5 key={`h${key++}`}>{renderInline(trimmed.slice(4), `h${key}`)}</h5>)
      continue
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(<h4 key={`h${key++}`}>{renderInline(trimmed.slice(3), `h${key}`)}</h4>)
      continue
    }

    if (!trimmed) continue

    blocks.push(<p key={`p${key++}`}>{renderInline(trimmed, `p${key}`)}</p>)
  }

  flushList()

  return <div className={`markdown-body${className ? ` ${className}` : ''}`}>{blocks}</div>
}
