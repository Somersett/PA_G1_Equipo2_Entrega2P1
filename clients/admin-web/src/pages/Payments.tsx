import { Link } from 'react-router';
import { Plus, Receipt } from 'lucide-react';
import { useLookups, usePayments } from '../api/hooks';
import { useDrawers } from '../components/DrawerHost';
import { Avatar, EmptyState, ErrorNotice, ErrorState, MembershipBadge, PageHeader, SkeletonRows } from '../components/ui';
import { formatDateTime, formatMoney, plural } from '../lib/format';

export function Payments() {
  const { open } = useDrawers();
  const payments = usePayments();
  const { membershipById, memberById, planById } = useLookups();
  const list = payments.data ?? [];
  const total = list.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="page">
      <PageHeader
        title="Pagos"
        description="Pagos administrativos registrados en Payments. Cada pago activa automáticamente su membresía a través de Kafka."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'payment' })}>
            <Plus aria-hidden="true" />
            Registrar pago
          </button>
        }
      />

      {payments.error && payments.data ? (
        <ErrorNotice error={payments.error} onRetry={() => payments.refetch()} retrying={payments.isFetching} stale />
      ) : null}

      <section className="card">
        {payments.error && !payments.data ? (
          <ErrorState
            error={payments.error}
            title="No se pudo cargar la lista de pagos"
            onRetry={() => payments.refetch()}
            retrying={payments.isFetching}
          />
        ) : !payments.isLoading && list.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Todavía no hay pagos"
            text="Registra el pago de una membresía pendiente para activarla."
            actions={
              <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'payment' })}>
                <Plus aria-hidden="true" />
                Registrar pago
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Pago</th>
                  <th scope="col">Miembro</th>
                  <th scope="col">Membresía</th>
                  <th scope="col">Fecha del pago</th>
                  <th scope="col" className="align-right">
                    Monto
                  </th>
                </tr>
              </thead>
              {payments.isLoading ? (
                <SkeletonRows columns={5} />
              ) : (
                <tbody>
                  {list.map((payment) => {
                    const membership = membershipById.get(payment.membershipId);
                    const member = membership ? memberById.get(membership.memberId) : undefined;
                    const plan = membership ? planById.get(membership.planId) : undefined;
                    return (
                      <tr key={payment.id}>
                        <td className="id-tag">#{payment.id}</td>
                        <td>
                          {member ? (
                            <div className="person">
                              <Avatar name={member.name} id={member.id} />
                              <Link to={`/miembros/${member.id}`} className="cell-primary link-quiet">
                                {member.name}
                              </Link>
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="cell-stack" style={{ justifyItems: 'start', gap: 4 }}>
                            <span>
                              #{payment.membershipId}
                              {plan ? ` · Plan ${plan.name}` : ''}
                            </span>
                            {membership ? <MembershipBadge status={membership.status} /> : null}
                          </div>
                        </td>
                        <td>{formatDateTime(payment.paidAt)}</td>
                        <td className="align-right cell-primary">{formatMoney(payment.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        )}
        {list.length > 0 ? (
          <div className="card-footer table-total">
            <span className="muted">{plural(list.length, 'pago')}</span>
            <span>
              Total recibido <strong className="num">{formatMoney(total)}</strong>
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
