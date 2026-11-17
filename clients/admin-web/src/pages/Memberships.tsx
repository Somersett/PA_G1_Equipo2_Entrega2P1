import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarX, IdCard, Plus, Receipt } from 'lucide-react';
import { useLookups } from '../api/hooks';
import type { Membership, MembershipStatus } from '../api/types';
import { useDrawers } from '../components/DrawerHost';
import { ExpireDialog } from '../components/ExpireDialog';
import { Avatar, EmptyState, ErrorNotice, ErrorState, MembershipBadge, PageHeader, SkeletonRows } from '../components/ui';
import { daysUntil, formatDate, formatMoney, formatRelative } from '../lib/format';

type Filter = 'all' | MembershipStatus;

export function Memberships() {
  const { open } = useDrawers();
  const { memberships, memberById, planById, currentMembership } = useLookups();
  const [filter, setFilter] = useState<Filter>('all');
  const [expiring, setExpiring] = useState<Membership | null>(null);

  const list = memberships.data ?? [];
  const counts = useMemo(
    () => ({
      all: list.length,
      PENDING: list.filter((m) => m.status === 'PENDING').length,
      ACTIVE: list.filter((m) => m.status === 'ACTIVE').length,
      EXPIRED: list.filter((m) => m.status === 'EXPIRED').length,
    }),
    [list],
  );
  const rows = filter === 'all' ? list : list.filter((m) => m.status === filter);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'PENDING', label: 'Pendientes de pago' },
    { id: 'ACTIVE', label: 'Activas' },
    { id: 'EXPIRED', label: 'Vencidas' },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Membresías"
        description="Cada membresía une a un miembro con un plan. Nace pendiente, se activa con el pago y vence al terminar su vigencia."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'membership' })}>
            <Plus aria-hidden="true" />
            Asignar plan
          </button>
        }
      />

      <ol className="lifecycle" aria-label="Ciclo de vida de una membresía">
        <li>
          <MembershipBadge status="PENDING" />
          <span>Se crea al asignar un plan</span>
        </li>
        <li>
          <MembershipBadge status="ACTIVE" />
          <span>Se activa sola al registrar el pago</span>
        </li>
        <li>
          <MembershipBadge status="EXPIRED" />
          <span>Vence al terminar la vigencia</span>
        </li>
      </ol>

      {memberships.error && memberships.data ? (
        <ErrorNotice error={memberships.error} onRetry={() => memberships.refetch()} retrying={memberships.isFetching} stale />
      ) : null}

      <section className="card">
        {memberships.error && !memberships.data ? (
          <ErrorState
            error={memberships.error}
            title="No se pudo cargar la lista de membresías"
            onRetry={() => memberships.refetch()}
            retrying={memberships.isFetching}
          />
        ) : null}
        {list.length > 0 ? (
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Filtrar por estado">
              {filters.map((item) => (
                <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                  {item.label}
                  <span className="count">{counts[item.id]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {memberships.error && !memberships.data ? null : !memberships.isLoading && list.length === 0 ? (
          <EmptyState
            icon={IdCard}
            title="Todavía no hay membresías"
            text="Asigna un plan a un miembro para crear la primera."
            actions={
              <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'membership' })}>
                <Plus aria-hidden="true" />
                Asignar plan
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Miembro</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Vigencia</th>
                  <th scope="col">Creada</th>
                  <th scope="col" className="align-right">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              {memberships.isLoading ? (
                <SkeletonRows columns={6} />
              ) : (
                <tbody>
                  {rows.map((membership) => {
                    const member = memberById.get(membership.memberId);
                    const plan = planById.get(membership.planId);
                    const left = membership.endDate ? daysUntil(membership.endDate) : null;
                    return (
                      <tr key={membership.id}>
                        <td>
                          <div className="person">
                            <Avatar name={member?.name ?? '?'} id={membership.memberId} />
                            <div className="cell-stack">
                              <Link to={`/miembros/${membership.memberId}`} className="cell-primary link-quiet">
                                {member?.name ?? `Miembro #${membership.memberId}`}
                              </Link>
                              <span className="cell-secondary">Membresía #{membership.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="cell-stack">
                            <span className="cell-primary">{plan?.name ?? `Plan #${membership.planId}`}</span>
                            <span className="cell-secondary">{plan ? formatMoney(plan.price) : null}</span>
                          </div>
                        </td>
                        <td>
                          <MembershipBadge status={membership.status} />
                        </td>
                        <td>
                          {membership.startDate && membership.endDate ? (
                            <div className="cell-stack">
                              <span>
                                {formatDate(membership.startDate, false)} – {formatDate(membership.endDate)}
                              </span>
                              <span className="cell-secondary">
                                {membership.status === 'ACTIVE' && left !== null
                                  ? left <= 0
                                    ? 'Último día'
                                    : `Quedan ${left + 1} días`
                                  : membership.status === 'EXPIRED'
                                    ? 'Terminó'
                                    : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="cell-secondary">Empieza al registrar el pago</span>
                          )}
                        </td>
                        <td className="cell-secondary">{formatRelative(membership.createdAt)}</td>
                        <td className="align-right">
                          {membership.status === 'PENDING' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => open({ kind: 'payment', membershipId: membership.id })}
                            >
                              <Receipt aria-hidden="true" />
                              Registrar pago
                            </button>
                          ) : membership.status === 'ACTIVE' ? (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpiring(membership)}>
                              <CalendarX aria-hidden="true" />
                              Forzar vencimiento
                            </button>
                          ) : currentMembership.get(membership.memberId)?.id === membership.id ? (
                            // Solo se ofrece renovar la membresía más reciente del miembro.
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => open({ kind: 'membership', memberId: membership.memberId })}
                            >
                              Renovar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>
                        No hay membresías en este estado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              )}
            </table>
          </div>
        )}
      </section>

      {expiring ? (
        <ExpireDialog
          membership={expiring}
          memberName={memberById.get(expiring.memberId)?.name ?? `Miembro #${expiring.memberId}`}
          onClose={() => setExpiring(null)}
        />
      ) : null}
    </div>
  );
}
