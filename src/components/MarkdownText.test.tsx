import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownText } from './MarkdownText'

describe('MarkdownText', () => {
  it('应渲染普通文本为 <p>', () => {
    render(<MarkdownText text="Hello World" />)
    const el = screen.getByText('Hello World')
    expect(el.tagName).toBe('P')
  })

  it('应渲染 **加粗** 文本为 <strong>', () => {
    render(<MarkdownText text="这是**加粗**文本" />)
    const bold = screen.getByText('加粗')
    expect(bold.tagName).toBe('STRONG')
  })

  it('应渲染 `行内代码` 为 <code>', () => {
    render(<MarkdownText text="使用`console.log`打印" />)
    const code = screen.getByText('console.log')
    expect(code.tagName).toBe('CODE')
  })

  it('应渲染代码块为 <pre><code>', () => {
    const md = '```js\nconst x = 1;\n```'
    render(<MarkdownText text={md} />)
    const pre = document.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('const x = 1;')
  })

  it('应渲染 [链接](url) 为 <a>', () => {
    render(<MarkdownText text="查看[文档](https://example.com)" />)
    const link = screen.getByText('文档')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('应渲染分隔线 --- 为 <hr>', () => {
    const md = '上面\n---\n下面'
    render(<MarkdownText text={md} />)
    const hr = document.querySelector('hr')
    expect(hr).not.toBeNull()
  })

  it('应渲染 *** 分隔线', () => {
    const md = '上面\n***\n下面'
    render(<MarkdownText text={md} />)
    const hr = document.querySelector('hr')
    expect(hr).not.toBeNull()
  })

  it('应渲染表格', () => {
    const md = `| 名称 | 值 |
|---|---|
| A | 1 |
| B | 2 |`
    render(<MarkdownText text={md} />)
    const table = document.querySelector('table')
    expect(table).not.toBeNull()
    expect(screen.getByText('名称')).toBeDefined()
    expect(screen.getByText('值')).toBeDefined()
    expect(screen.getByText('A')).toBeDefined()
    expect(screen.getByText('B')).toBeDefined()
  })

  it('应渲染无序列表 -', () => {
    const md = '- 第一项\n- 第二项\n- 第三项'
    render(<MarkdownText text={md} />)
    const list = document.querySelector('ul')
    expect(list).not.toBeNull()
    expect(list!.children).toHaveLength(3)
    expect(screen.getByText('第一项')).toBeDefined()
    expect(screen.getByText('第二项')).toBeDefined()
    expect(screen.getByText('第三项')).toBeDefined()
  })

  it('应渲染无序列表 *', () => {
    const md = '* 项目A\n* 项目B'
    render(<MarkdownText text={md} />)
    const list = document.querySelector('ul')
    expect(list).not.toBeNull()
    expect(list!.children).toHaveLength(2)
  })

  it('应渲染有序列表', () => {
    const md = '1. 步骤一\n2. 步骤二'
    render(<MarkdownText text={md} />)
    const list = document.querySelector('ol')
    expect(list).not.toBeNull()
    expect(list!.children).toHaveLength(2)
    expect(screen.getByText('步骤一')).toBeDefined()
    expect(screen.getByText('步骤二')).toBeDefined()
  })

  it('应渲染引用 > 为 <blockquote>', () => {
    render(<MarkdownText text="> 这是一段引用" />)
    const bq = document.querySelector('blockquote')
    expect(bq).not.toBeNull()
    expect(bq!.textContent).toContain('这是一段引用')
  })

  it('应渲染 h1 (# )', () => {
    render(<MarkdownText text="# 标题" />)
    const h = document.querySelector('h3')
    expect(h).not.toBeNull()
    expect(h!.textContent).toBe('标题')
  })

  it('应渲染 h2 (## )', () => {
    render(<MarkdownText text="## 二级标题" />)
    const h = document.querySelector('h4')
    expect(h).not.toBeNull()
    expect(h!.textContent).toBe('二级标题')
  })

  it('应渲染 h3 (### )', () => {
    render(<MarkdownText text="### 三级标题" />)
    const h = document.querySelector('h5')
    expect(h).not.toBeNull()
    expect(h!.textContent).toBe('三级标题')
  })

  it('外层容器应有 markdown-body class', () => {
    const { container } = render(<MarkdownText text="测试" />)
    expect(container.firstChild).toHaveClass('markdown-body')
  })

  it('应传递自定义 className', () => {
    const { container } = render(<MarkdownText text="测试" className="custom" />)
    expect(container.firstChild).toHaveClass('markdown-body')
    expect(container.firstChild).toHaveClass('custom')
  })

  it('空行不应生成额外 DOM', () => {
    const md = '第一段\n\n第二段'
    const { container } = render(<MarkdownText text={md} />)
    const ps = container.querySelectorAll('p')
    expect(ps).toHaveLength(2)
  })

  it('表格内的行内格式应正确渲染', () => {
    const md = '| 名称 | 说明 |\n|---|---|\n| **A** | `代码` |'
    render(<MarkdownText text={md} />)
    const bold = screen.getByText('A')
    expect(bold.tagName).toBe('STRONG')
    const code = screen.getByText('代码')
    expect(code.tagName).toBe('CODE')
  })

  it('列表项内行内格式应正确渲染', () => {
    const md = '- 这是**加粗**项'
    render(<MarkdownText text={md} />)
    const bold = screen.getByText('加粗')
    expect(bold.tagName).toBe('STRONG')
  })

  it('引用内行内格式应正确渲染', () => {
    render(<MarkdownText text="> 引用中`有代码`" />)
    const code = screen.getByText('有代码')
    expect(code.tagName).toBe('CODE')
  })
})
