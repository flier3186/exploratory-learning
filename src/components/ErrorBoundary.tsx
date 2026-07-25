import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onExport?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__box">
            <h2>遇到了一点小问题</h2>
            <p>学习工具暂时遇到了错误，你的本地数据是安全的。</p>
            {this.state.error && (
              <pre className="error-boundary__trace">{this.state.error.message}</pre>
            )}
            <div className="error-boundary__actions">
              {this.props.onExport && (
                <button className="error-boundary__btn error-boundary__btn--secondary" onClick={this.props.onExport}>
                  导出数据备份
                </button>
              )}
              <button className="error-boundary__btn" onClick={this.handleReload}>
                刷新页面重试
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
