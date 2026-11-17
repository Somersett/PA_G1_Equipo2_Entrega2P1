import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, CircleAlert, CloudOff, LoaderCircle, RotateCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AccessResult, MembershipStatus } from '../api/types';
import { describeError } from '../lib/errors';
import { ACCESS_RESULT, MEMBERSHIP_STATUS, reasonLabel } from '../lib/labels';
import { avatarTint, initials } from '../lib/format';

export function Spinner({ label }: { label?: string }) {
  return (
    <>
      <LoaderCircle className="spinner" aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

export function MembershipBadge({ status, size }: { status: MembershipStatus; size?: 'lg' }) {
  const meta = MEMBERSHIP_STATUS[status];
  const Icon = meta.icon;
  return (
    <span className={`badge badge-${meta.tone}${size ? ` badge-${size}` : ''}`} title={meta.help}>
      <Icon aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function NoMembershipBadge() {
  return <span className="badge badge-neutral">Sin membresía</span>;
}

export function AccessBadge({ result, reason }: { result: AccessResult; reason?: string }) {
  const meta = ACCESS_RESULT[result];
  const Icon = meta.icon;
  return (
    <span className={`badge badge-${meta.tone}`} title={reason ? reasonLabel(reason) : meta.help}>
      <Icon aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function Topic({ name }: { name: string }) {
  return (
    <span className="topic" data-topic={name}>
      {name}
    </span>
  );
}

export function Avatar({ name, id, size }: { name: string; id: number; size?: 'lg' | 'xl' }) {
  return (
    <span
      className={`avatar${size ? ` avatar-${size}` : ''}`}
      style={{ ['--avatar-bg' as string]: avatarTint(id) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-heading">
        {back ? (
          <Link to={back.to} className="page-back">
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Etiqueta, ayuda y error conectados al control por id y aria-describedby. */
export function Field({ label, hint, error, optional, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })
    : children;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {optional ? <span className="field-optional">Opcional</span> : null}
      </label>
      {control}
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          <CircleAlert size={13} aria-hidden="true" />
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  text?: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ icon: Icon, title, text, actions }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon aria-hidden="true" />
      </div>
      <p className="empty-title">{title}</p>
      {text ? <p className="empty-text">{text}</p> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 4, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              <span className="skeleton" style={{ width: `${column === 0 ? 70 : 40 + ((row + column) % 3) * 15}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

interface ErrorNoticeProps {
  error: unknown;
  onRetry?: () => void;
  /** Reemplaza el título del catálogo (p. ej. "No se pudo registrar el pago"). */
  title?: string;
  /** Hay datos anteriores en pantalla: se aclara que pueden estar desactualizados. */
  stale?: boolean;
  retrying?: boolean;
  /**
   * Solo qué pasó, sin detalle ni solución: para cuando la causa ya se explica en otro lugar de la misma
   * pantalla (el aviso de conexión de arriba), y así no repetir lo mismo varias veces.
   */
  brief?: boolean;
}

/**
 * Aviso en línea de un error: qué pasó, el detalle y la posible solución, en un solo bloque compacto. Los
 * textos salen del catálogo (lib/errors.ts), así que el mismo problema se explica igual en todo el panel.
 */
export function ErrorNotice({ error, onRetry, title, stale, retrying, brief }: ErrorNoticeProps) {
  const info = describeError(error);
  const Icon = info.tone === 'warn' ? TriangleAlert : CircleAlert;
  return (
    <div className={`notice notice-${info.tone}`} role="alert">
      <Icon aria-hidden="true" />
      <div className="notice-body">
        <span>
          <strong>{title ?? info.title}.</strong>
          {title && title !== info.title ? ` ${info.title}.` : ''}
          {info.message && !brief ? ` ${info.message}` : ''}
          {stale ? ' Se muestran los últimos datos que llegaron.' : ''}
        </span>
        {info.hint && !brief ? <span className="notice-hint">{info.hint}</span> : null}
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-sm btn-secondary notice-action" onClick={onRetry} disabled={retrying}>
          {retrying ? <Spinner label="Reintentando" /> : <RotateCw aria-hidden="true" />}
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

/**
 * Error en lugar del contenido, cuando no hay nada que mostrar. Evita decir "no hay miembros" cuando en
 * realidad no se pudieron consultar.
 */
export function ErrorState({ error, onRetry, title, retrying, brief }: Omit<ErrorNoticeProps, 'stale'>) {
  const info = describeError(error);
  return (
    <div className={`empty error-state${brief ? ' is-brief' : ''}`} role="alert">
      <div className={`empty-icon is-${info.tone}`}>
        <CloudOff aria-hidden="true" />
      </div>
      <p className="empty-title">{title ?? info.title}</p>
      {brief ? (
        <p className="empty-text">{info.retryable ? 'Se vuelve a intentar solo.' : info.title}</p>
      ) : (
        <>
          {info.message || title ? (
            <p className="empty-text">
              {title && title !== info.title ? `${info.title}. ` : ''}
              {info.message}
            </p>
          ) : null}
          {info.hint ? <p className="empty-text error-state-hint">{info.hint}</p> : null}
        </>
      )}
      {onRetry ? (
        <div className="empty-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={retrying}>
            {retrying ? <Spinner label="Reintentando" /> : <RotateCw aria-hidden="true" />}
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ───────────── Código con resaltado mínimo ─────────────

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightJson(value: unknown) {
  const json = escapeHtml(JSON.stringify(value, null, 2) ?? 'null');
  return json.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      if (match.startsWith('"')) {
        return match.endsWith(':') ? `<span class="tok-key">${match}</span>` : `<span class="tok-str">${match}</span>`;
      }
      if (/true|false|null/.test(match)) return `<span class="tok-lit">${match}</span>`;
      return `<span class="tok-num">${match}</span>`;
    },
  );
}

function highlightGraphql(query: string) {
  return escapeHtml(query)
    .replace(/\b(query|mutation|fragment|on)\b/g, '<span class="tok-kw">$1</span>')
    .replace(/(\$\w+)/g, '<span class="tok-num">$1</span>')
    .replace(/\b(Int|String|Boolean|ID)\b(!?)/g, '<span class="tok-lit">$1$2</span>');
}

export function CodeBlock({ value, language, label }: { value: unknown; language: 'json' | 'graphql'; label: string }) {
  const html = language === 'json' ? highlightJson(value) : highlightGraphql(String(value));
  return (
    <pre className="code" aria-label={label} tabIndex={0}>
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
