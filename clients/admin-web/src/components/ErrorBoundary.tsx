import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Bug, House, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Al cambiar (p. ej. la ruta) se descarta el error y se vuelve a intentar mostrar el contenido. */
  resetKey?: string;
  /** 'page': dentro del panel, el resto de la interfaz sigue disponible. 'app': toda la aplicación. */
  scope?: 'page' | 'app';
}

interface State {
  error: Error | null;
}

/**
 * Si una pantalla falla al dibujarse, en vez de dejar la página en blanco se muestra qué pasó y cómo
 * seguir. Los datos del sistema no se ven afectados: el error es solo de la interfaz.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Panel] Error al mostrar la pantalla', error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const app = this.props.scope === 'app';
    return (
      <div className={app ? 'crash crash-app' : 'page'}>
        <section className="card crash-card" role="alert">
          <div className="empty-icon is-bad">
            <Bug aria-hidden="true" />
          </div>
          <h1 className="crash-title">{app ? 'El panel tuvo un problema' : 'Esta pantalla tuvo un problema'}</h1>
          <p className="crash-text">
            Ocurrió un error inesperado al mostrarla. Los datos del sistema no se afectaron: el problema es solo de la
            interfaz. {app ? 'Recarga la página para continuar.' : 'Vuelve a intentarlo o sigue en otra sección.'}
          </p>
          <div className="crash-actions">
            {app ? (
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                <RotateCw aria-hidden="true" />
                Recargar la página
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={this.retry}>
                  <RotateCw aria-hidden="true" />
                  Reintentar
                </button>
                <a href="/" className="btn btn-secondary">
                  <House aria-hidden="true" />
                  Ir al inicio
                </a>
              </>
            )}
          </div>
          <details className="crash-detail">
            <summary>Detalle técnico</summary>
            <code>{error.message || String(error)}</code>
          </details>
        </section>
      </div>
    );
  }
}
