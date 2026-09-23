import { Component, type ErrorInfo, type ReactNode } from 'react';

// Catches render errors so the user never ends up on a blank (black) screen:
// shows what went wrong and offers a way back. The last error is kept in localStorage
// so it can still be read after a reload.

const LAST_ERROR_KEY = 'mapforge.lastError';

export function rememberError(area: string, error: unknown) {
  try {
    const e = error instanceof Error ? error : new Error(String(error));
    localStorage.setItem(
      LAST_ERROR_KEY,
      JSON.stringify({ area, message: e.message, stack: (e.stack ?? '').split('\n').slice(0, 6).join('\n'), at: new Date().toISOString(), ua: navigator.userAgent }),
    );
  } catch {
    // storage unavailable – nothing to remember
  }
}

/** Last stored error (and removes it). */
export function takeLastError(): { area: string; message: string; stack: string; at: string } | null {
  try {
    const raw = localStorage.getItem(LAST_ERROR_KEY);
    if (!raw) return null;
    localStorage.removeItem(LAST_ERROR_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface Props {
  /** short name of the area, shown in the message */
  area: string;
  children: ReactNode;
  /** extra action, e.g. closing the setup wizard */
  onClose?: () => void;
  closeLabel?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`MapForge: Fehler in ${this.props.area}`, error, info.componentStack);
    rememberError(this.props.area, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-screen" role="alert">
        <div className="error-card">
          <strong>Da ist etwas schiefgelaufen ({this.props.area})</strong>
          <p>Deine gespeicherten Projekte sind nicht betroffen.</p>
          <pre>{`${error.message || String(error)}\n${(error.stack ?? '').split('\n').slice(1, 4).join('\n')}`}</pre>
          <div className="error-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void navigator.clipboard?.writeText(`${this.props.area}: ${error.message}\n${error.stack ?? ''}\n${navigator.userAgent}`).catch(() => {})}
            >
              Fehler kopieren
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
              Erneut versuchen
            </button>
            {this.props.onClose && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onClose!();
                }}
              >
                {this.props.closeLabel ?? 'Schließen'}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
              Neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }
}
