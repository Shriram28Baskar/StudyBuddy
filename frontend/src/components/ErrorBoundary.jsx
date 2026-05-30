import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0a0a0e',
          color: 'white',
          flexDirection: 'column',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 24 }}>
            {this.state.error?.message || 'Please refresh the page'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#5c35aa',
              border: 'none',
              borderRadius: 8,
              padding: '8px 20px',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}