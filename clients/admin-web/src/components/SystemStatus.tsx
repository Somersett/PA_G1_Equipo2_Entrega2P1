import { useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import { useSystemStatus } from '../api/hooks';
import type { SystemComponent, SystemStatus as Status } from '../api/types';
import { describeError } from '../lib/errors';
import { formatTime } from '../lib/format';
import { diagnose, IMPACT } from '../lib/health';

const STATE: Record<SystemComponent['status'], { label: string; color: string }> = {
  UP: { label: 'En línea', color: 'var(--good-ink)' },
  DOWN: { label: 'Caído', color: 'var(--bad-ink)' },
  UNKNOWN: { label: 'Sin datos', color: 'var(--ink-3)' },
};

function summarize(status: Status | undefined, error: unknown) {
  if (error) {
    return { tone: 'down' as const, title: 'Sin conexión', detail: diagnose(status, error)?.title ?? 'Sin respuesta' };
  }
  if (!status) return { tone: 'idle' as const, title: 'Estado del sistema', detail: 'Consultando…' };
  const up = status.components.filter((component) => component.status === 'UP').length;
  const total = status.components.length;
  if (up === total) return { tone: 'up' as const, title: 'Sistema en línea', detail: `${total} de ${total} componentes listos` };
  return { tone: 'down' as const, title: 'Sistema incompleto', detail: `${up} de ${total} componentes listos` };
}

export function ComponentList({ status }: { status: Status }) {
  return (
    <ul className="status-list">
      {status.components.map((component) => {
        const state = STATE[component.status] ?? STATE.UNKNOWN;
        return (
          <li key={component.id} className="status-item">
            {component.status === 'UP' ? (
              <CircleCheck size={16} color="var(--good)" aria-hidden="true" />
            ) : component.status === 'DOWN' ? (
              <CircleX size={16} color="var(--bad)" aria-hidden="true" />
            ) : (
              <CircleHelp size={16} color="var(--idle)" aria-hidden="true" />
            )}
            <span className="cell-stack">
              <span className="name">{component.name}</span>
              <span className="role">
                {component.status === 'DOWN'
                  ? (IMPACT[component.id] ?? component.role)
                  : component.status === 'UNKNOWN'
                    ? 'Lo informa el simulador, que no responde.'
                    : component.role}
              </span>
            </span>
            <span className="state" style={{ color: state.color }}>
              {state.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Indicador del pie de la barra lateral con el detalle de cada componente. */
export function SystemStatusButton() {
  const status = useSystemStatus();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const summary = summarize(status.data, status.error);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // El aviso de conexión puede pedir que se abra el detalle.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('fetgym:show-status', show);
    return () => window.removeEventListener('fetgym:show-status', show);
  }, []);

  const errorInfo = status.error ? describeError(status.error) : null;

  return (
    <div ref={ref}>
      <button
        type="button"
        className="system-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={`live-dot${summary.tone === 'down' ? ' is-down' : summary.tone === 'idle' ? ' is-paused' : ''}`}
          aria-hidden="true"
        />
        <span className="label">
          {summary.title}
          <span className="meta">{summary.detail}</span>
        </span>
      </button>
      {open ? (
        <div className="status-pop card" role="dialog" aria-label="Estado del sistema">
          <div className="card-header">
            <div>
              <p className="card-title">Estado del sistema</p>
              <p className="card-subtitle">
                {status.data && !status.error
                  ? `Informado por el GraphQL Gateway a las ${formatTime(status.data.checkedAt)}`
                  : summary.detail}
              </p>
            </div>
          </div>
          {status.data && !status.error ? (
            <ComponentList status={status.data} />
          ) : (
            <div className="card-body muted">
              {errorInfo ? (
                <>
                  <strong>{errorInfo.title}.</strong> {errorInfo.hint}
                </>
              ) : (
                'Consultando el estado…'
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
