import { useEffect, useRef, useCallback, type ReactNode } from 'react'

/**
 * 通用模态框组件 — 统一处理无障碍语义、焦点陷阱和键盘交互
 *
 * 解决的问题：
 * 1. role="dialog" + aria-modal 让屏幕阅读器正确识别
 * 2. 焦点陷阱：Tab/Shift+Tab 不会跳出模态框
 * 3. Escape 键关闭
 * 4. 打开时焦点移入模态框，关闭时恢复到触发元素
 *
 * 用法：
 * <Modal title="标题" onClose={handleClose} className="search-modal">
 *   ...内容...
 * </Modal>
 */
export function Modal(props: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  /** 是否在打开时自动聚焦模态框内容（默认 true） */
  autoFocus?: boolean
}) {
  const { title, onClose, children, className, autoFocus = true } = props
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // 打开时记录当前焦点，关闭时恢复
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    return () => {
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus()
        } catch {
          // 某些元素 focus 可能失败，静默忽略
        }
      }
    }
  }, [])

  // 打开时将焦点移入模态框
  useEffect(() => {
    if (!autoFocus) return
    const dialog = dialogRef.current
    if (!dialog) return
    // 优先聚焦到第一个可聚焦元素，否则聚焦到 dialog 容器本身
    const focusable = dialog.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable) {
      focusable.focus()
    } else {
      dialog.focus()
    }
  }, [autoFocus])

  // 焦点陷阱 + Escape 关闭
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusableElements = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusableElements.length === 0) return

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (event.shiftKey) {
        // Shift+Tab：从第一个跳到最后一个
        if (document.activeElement === first || document.activeElement === dialog) {
          event.preventDefault()
          last.focus()
        }
      } else {
        // Tab：从最后一个跳到第一个
        if (document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    },
    [onClose],
  )

  const dialogClassName = ['modal', className].filter(Boolean).join(' ')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="关闭弹窗">
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
