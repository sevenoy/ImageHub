import * as React from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare readonly props: Readonly<ErrorBoundaryProps>;

  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || '未知错误',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] 页面组件出现错误:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
          <h1>页面组件出现错误，但应用没有崩溃。</h1>
          <p>请刷新页面后重试。如果问题持续出现，请保留当前操作步骤用于排查。</p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              padding: 12,
              background: '#f6f6f6',
              borderRadius: 8,
              color: '#b00020',
            }}
          >
            {this.state.errorMessage}
          </pre>
          <button type="button" onClick={this.handleReload}>
            刷新页面
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
