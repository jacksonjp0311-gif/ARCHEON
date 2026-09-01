import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './styles/theme.css';

class BootError extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('ARCHEON UI crash', err, info.componentStack);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <pre style={{ color: '#e85b6a', padding: 24, whiteSpace: 'pre-wrap' }}>
        ARCHEON UI failed to render.{'\n'}
        {this.state.err.message}
      </pre>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BootError>
      <App />
    </BootError>
  </StrictMode>
);
