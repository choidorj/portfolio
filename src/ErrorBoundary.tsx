import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

// Top-level boundary so a render-time throw degrades to a friendly message
// instead of a blank page. Reuses the existing .notfound styles; the home
// link does a full reload, which clears the error state.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error caught by ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="notfound">
          <span className="notfound-eyebrow">error</span>
          <h1 className="page-title">something went wrong.</h1>
          <p className="notfound-text">
            try reloading the page. if it keeps happening, the issue is on my end.
          </p>
          <p>
            <a href="/">← back home</a>
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
