import { useMemo } from 'react';
import { Layers, Plus } from 'lucide-react';
import { useLookups } from '../api/hooks';
import { useDrawers } from '../components/DrawerHost';
import { EmptyState, ErrorNotice, ErrorState, PageHeader } from '../components/ui';
import { formatMoney, plural } from '../lib/format';

function durationLabel(days: number) {
  if (days % 365 === 0) return plural(days / 365, 'año');
  if (days % 30 === 0) return plural(days / 30, 'mes', 'meses');
  if (days % 7 === 0) return plural(days / 7, 'semana');
  return plural(days, 'día');
}

export function Plans() {
  const { open } = useDrawers();
  const { plans, memberships } = useLookups();
  const list = plans.data ?? [];

  const usage = useMemo(() => {
    const result = new Map<number, { active: number; pending: number }>();
    for (const membership of memberships.data ?? []) {
      const entry = result.get(membership.planId) ?? { active: 0, pending: 0 };
      if (membership.status === 'ACTIVE') entry.active += 1;
      if (membership.status === 'PENDING') entry.pending += 1;
      result.set(membership.planId, entry);
    }
    return result;
  }, [memberships.data]);

  return (
    <div className="page">
      <PageHeader
        title="Planes"
        description="Catálogo de planes. Definen cuántos días de acceso da una membresía y cuánto cuesta."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'plan' })}>
            <Plus aria-hidden="true" />
            Nuevo plan
          </button>
        }
      />

      {plans.error && plans.data ? (
        <ErrorNotice error={plans.error} onRetry={() => plans.refetch()} retrying={plans.isFetching} stale />
      ) : null}

      {plans.error && !plans.data ? (
        <section className="card">
          <ErrorState
            error={plans.error}
            title="No se pudo cargar el catálogo de planes"
            onRetry={() => plans.refetch()}
            retrying={plans.isFetching}
          />
        </section>
      ) : !plans.isLoading && list.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={Layers}
            title="No hay planes"
            text="Crea el primero para poder asignar membresías."
            actions={
              <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'plan' })}>
                <Plus aria-hidden="true" />
                Nuevo plan
              </button>
            }
          />
        </section>
      ) : (
        <div className="plan-grid">
          {list.map((plan) => {
            const stats = usage.get(plan.id) ?? { active: 0, pending: 0 };
            const perDay = plan.durationDays > 0 ? plan.price / plan.durationDays : 0;
            return (
              <article key={plan.id} className="card plan-card">
                <header className="plan-card-head">
                  <span className="plan-name">{plan.name}</span>
                  <span className="id-tag">#{plan.id}</span>
                </header>
                <p className="plan-price num">{formatMoney(plan.price)}</p>
                <p className="plan-duration">
                  {durationLabel(plan.durationDays)} de acceso
                  <span className="muted"> · {plural(plan.durationDays, 'día')}</span>
                </p>
                <hr className="divider" />
                <dl className="plan-stats">
                  <div>
                    <dt>Activas</dt>
                    <dd className="num">{stats.active}</dd>
                  </div>
                  <div>
                    <dt>Por pagar</dt>
                    <dd className="num">{stats.pending}</dd>
                  </div>
                  <div>
                    <dt>Por día</dt>
                    <dd className="num">{formatMoney(Math.round(perDay))}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
          <button type="button" className="plan-card plan-card-new" onClick={() => open({ kind: 'plan' })}>
            <Plus aria-hidden="true" />
            <span>Nuevo plan</span>
          </button>
        </div>
      )}
    </div>
  );
}
