import type { Membership } from '../api/types';
import { daysUntil, formatDate, parseLocalDate, plural } from '../lib/format';

/**
 * Vigencia como medidor: el relleno lleva la severidad (activa -> por vencer -> vencida) y la pista es un
 * tono claro de la misma escala. El texto siempre dice el estado; el color nunca va solo.
 */
export function MembershipPeriod({ membership }: { membership: Membership }) {
  if (!membership.startDate || !membership.endDate) {
    return <p className="muted">La vigencia empieza el día en que se registre el pago.</p>;
  }
  const start = parseLocalDate(membership.startDate).getTime();
  const end = parseLocalDate(membership.endDate).getTime() + 86_400_000;
  const total = Math.max(end - start, 1);
  const elapsed = Math.min(Math.max(Date.now() - start, 0), total);
  const remaining = daysUntil(membership.endDate) + 1;
  const expired = membership.status === 'EXPIRED' || remaining <= 0;
  const tone = expired ? 'idle' : remaining <= 7 ? 'warn' : 'good';
  const percent = expired ? 100 : Math.round((elapsed / total) * 100);

  return (
    <div className="period">
      <div className="period-dates">
        <span>
          <span className="period-label">Inicio</span>
          {formatDate(membership.startDate)}
        </span>
        <span className="period-remaining">
          {expired ? 'Vigencia terminada' : remaining === 1 ? 'Último día' : `Quedan ${plural(remaining, 'día')}`}
        </span>
        <span style={{ textAlign: 'right' }}>
          <span className="period-label">Fin</span>
          {formatDate(membership.endDate)}
        </span>
      </div>
      <div
        className={`meter meter-${tone}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Vigencia consumida"
      >
        <span style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
    </div>
  );
}
