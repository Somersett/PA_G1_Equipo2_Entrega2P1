import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CalendarX, DoorOpen, IdCard, Network, Receipt, RefreshCw, ShieldCheck, UserX } from 'lucide-react';
import { useLookups, useMemberOverview } from '../api/hooks';
import { useDrawers } from '../components/DrawerHost';
import { ExpireDialog } from '../components/ExpireDialog';
import { GraphqlInspector } from '../components/GraphqlInspector';
import { MembershipPeriod } from '../components/MembershipPeriod';
import { AccessBadge, Avatar, EmptyState, ErrorNotice, ErrorState, MembershipBadge, PageHeader, Spinner } from '../components/ui';
import { formatDateTime, formatMoney, formatRelative, formatTime, plural } from '../lib/format';
import { reasonLabel } from '../lib/labels';

/** El contrato GraphQL usa Int (32 bits). */
const MAX_MEMBER_ID = 2_147_483_647;

export function MemberDetail() {
  const params = useParams();
  const memberId = /^\d+$/.test(params.memberId ?? '') ? Number(params.memberId) : Number.NaN;
  const validId = Number.isSafeInteger(memberId) && memberId >= 1 && memberId <= MAX_MEMBER_ID;
  const navigate = useNavigate();
  const { open } = useDrawers();
  const { members, memberById, planById, currentMembership } = useLookups();
  const [expiring, setExpiring] = useState(false);

  const restMember = memberById.get(memberId);
  // La ficha se consulta por GraphQL; mientras el miembro aún no esté proyectado se reintenta más seguido.
  const overview = useMemberOverview(validId ? memberId : null, { poll: 4_000 });
  const consolidated = overview.data?.data.member ?? null;
  const awaitingProjection = overview.isSuccess && !consolidated && Boolean(restMember);
  // Members es la fuente de verdad del miembro: si su lista llegó y no lo tiene, no existe, aunque la vista
  // consolidada no haya respondido.
  const missingInMembers = members.data !== undefined && !members.isFetching && !restMember;
  const notFound = !validId || (missingInMembers && !consolidated && !overview.isLoading);
  // Ninguna de las dos fuentes respondió: no hay nada que mostrar.
  const unreachable =
    validId && !restMember && !consolidated && Boolean(overview.error || members.error) && !overview.isLoading && !members.isLoading;

  const member = consolidated?.member ?? restMember;
  const restMembership = currentMembership.get(memberId);
  const membership = consolidated?.membership ?? null;
  const plan = membership ? planById.get(membership.planId) : restMembership ? planById.get(restMembership.planId) : undefined;
  const syncing =
    restMembership && (!membership || membership.id !== restMembership.id || membership.status !== restMembership.status);

  if (unreachable && !(missingInMembers && !members.error)) {
    return (
      <div className="page">
        <PageHeader title="Ficha del miembro" back={{ to: '/miembros', label: 'Miembros' }} />
        <section className="card">
          <ErrorState
            error={members.error ?? overview.error}
            title={`No se pudo cargar al miembro #${memberId}`}
            onRetry={() => {
              members.refetch();
              overview.refetch();
            }}
            retrying={members.isFetching || overview.isFetching}
          />
        </section>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page">
        <PageHeader title="Miembro no encontrado" back={{ to: '/miembros', label: 'Miembros' }} />
        <section className="card">
          <EmptyState
            icon={UserX}
            title={validId ? `No existe el miembro #${memberId}` : `“${params.memberId}” no es un número de miembro válido`}
            text="Revisa el número o vuelve a la lista de miembros."
            actions={
              <Link to="/miembros" className="btn btn-secondary">
                Ir a Miembros
              </Link>
            }
          />
        </section>
      </div>
    );
  }

  let actions = null;
  if (member) {
    if (!restMembership || restMembership.status === 'EXPIRED') {
      actions = (
        <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'membership', memberId })}>
          <IdCard aria-hidden="true" />
          {restMembership ? 'Renovar: asignar plan' : 'Asignar plan'}
        </button>
      );
    } else if (restMembership.status === 'PENDING') {
      actions = (
        <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'payment', membershipId: restMembership.id })}>
          <Receipt aria-hidden="true" />
          Registrar pago
        </button>
      );
    } else {
      actions = (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setExpiring(true)}>
            <CalendarX aria-hidden="true" />
            Forzar vencimiento
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/acceso?miembro=${memberId}`)}>
            <DoorOpen aria-hidden="true" />
            Validar ingreso
          </button>
        </>
      );
    }
  }

  const accesses = consolidated?.recentAccesses ?? [];

  return (
    <div className="page">
      <PageHeader
        back={{ to: '/miembros', label: 'Miembros' }}
        title={
          member ? (
            <span className="title-with-avatar">
              <Avatar name={member.name} id={member.id} size="lg" />
              {member.name}
            </span>
          ) : (
            <span className="skeleton" style={{ width: 280, height: 32 }} />
          )
        }
        description={member ? `Miembro #${member.id} · Documento ${member.document}` : 'Cargando la ficha…'}
        actions={actions}
      />

      {overview.error ? (
        <ErrorNotice
          error={overview.error}
          title="La ficha consolidada no se pudo actualizar"
          onRetry={() => overview.refetch()}
          retrying={overview.isFetching}
          stale={Boolean(consolidated || restMember)}
        />
      ) : null}

      {awaitingProjection ? (
        <div className="notice" role="status">
          <Spinner />
          <span>
            <strong>La vista consolidada todavía no tiene a este miembro.</strong> Consolidated Queries lo agrega cuando consume{' '}
            <code>MEMBER_REGISTERED</code> de Kafka; suele tardar menos de un segundo. Mientras tanto se muestran los datos de Members.
          </span>
        </div>
      ) : syncing && consolidated ? (
        <div className="notice" role="status">
          <Spinner />
          <span>
            <strong>La vista consolidada se está poniendo al día.</strong> Es consistencia eventual: el cambio ya ocurrió y llegará
            por Kafka en un momento.
          </span>
        </div>
      ) : null}

      <div className="grid-main-aside">
        <div className="stack">
          <section className="card" aria-labelledby="membership-title">
            <div className="card-header">
              <h2 className="card-title" id="membership-title">
                <IdCard aria-hidden="true" />
                Membresía
              </h2>
              {membership ? <span className="id-tag">#{membership.id}</span> : null}
            </div>
            <div className="card-body">
              {overview.isLoading ? (
                <span className="skeleton" style={{ height: 64 }} />
              ) : membership ? (
                <div className="membership-summary">
                  <div className="membership-head">
                    <div className="cell-stack">
                      <span className="membership-plan">Plan {plan?.name ?? `#${membership.planId}`}</span>
                      <span className="cell-secondary">
                        {plan ? `${plural(plan.durationDays, 'día')} · ${formatMoney(plan.price)}` : `Plan #${membership.planId}`}
                      </span>
                    </div>
                    <MembershipBadge status={membership.status} size="lg" />
                  </div>
                  <MembershipPeriod membership={membership} />
                </div>
              ) : (
                <EmptyState
                  icon={IdCard}
                  title="Sin membresía"
                  text="Asígnale un plan para crear su membresía. Quedará pendiente hasta que registres el pago."
                  actions={
                    member ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => open({ kind: 'membership', memberId })}>
                        Asignar plan
                      </button>
                    ) : null
                  }
                />
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="accesses-title">
            <div className="card-header">
              <div>
                <h2 className="card-title" id="accesses-title">
                  <ShieldCheck aria-hidden="true" />
                  Accesos recientes
                </h2>
                <p className="card-subtitle">Los 10 intentos más recientes, del más nuevo al más antiguo</p>
              </div>
            </div>
            {overview.isLoading ? (
              <div className="card-body">
                <span className="skeleton" style={{ height: 48 }} />
              </div>
            ) : accesses.length === 0 ? (
              <EmptyState
                icon={DoorOpen}
                title="Sin intentos de ingreso"
                text="Cuando pase por el torniquete, cada intento quedará registrado aquí, permitido o no."
              />
            ) : (
              <ol className="timeline">
                {accesses.map((attempt) => (
                  <li key={attempt.attemptId} className={`timeline-item is-${attempt.result === 'ACCESS_GRANTED' ? 'good' : 'bad'}`}>
                    <span className="timeline-dot" aria-hidden="true" />
                    <div className="timeline-body">
                      <div className="timeline-row">
                        <AccessBadge result={attempt.result} reason={attempt.reason} />
                        <span className="cell-primary">{reasonLabel(attempt.reason)}</span>
                        <span className="id-tag">Intento #{attempt.attemptId}</span>
                      </div>
                      <span className="cell-secondary">
                        {formatDateTime(attempt.occurredAt)} · {formatRelative(attempt.occurredAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="data-title">
            <div className="card-header">
              <h2 className="card-title" id="data-title">
                Datos del miembro
              </h2>
            </div>
            <div className="card-body">
              {member ? (
                <dl className="dl">
                  <dt>Documento</dt>
                  <dd className="mono">{member.document}</dd>
                  <dt>Teléfono</dt>
                  <dd>{member.phone}</dd>
                  <dt>Correo</dt>
                  <dd>{member.email ?? <span className="muted">Sin correo</span>}</dd>
                  <dt>Registrado</dt>
                  <dd>{formatDateTime(member.createdAt)}</dd>
                </dl>
              ) : (
                <span className="skeleton" style={{ height: 96 }} />
              )}
            </div>
          </section>

          <section className="card source-card" aria-labelledby="source-title">
            <div className="card-header">
              <h2 className="card-title" id="source-title">
                <Network aria-hidden="true" />
                De dónde salen estos datos
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => overview.refetch()}
                aria-label="Volver a consultar"
                title="Volver a consultar"
                disabled={overview.isFetching}
              >
                {overview.isFetching ? <Spinner /> : <RefreshCw aria-hidden="true" />}
              </button>
            </div>
            <div className="card-body">
              <p className="secondary">
                Membresía y accesos vienen de la consulta <code>member(id)</code> del <strong>GraphQL Gateway</strong>. Consolidated Queries
                arma esa vista con los eventos de Kafka; ningún servicio de escritura participa en la consulta.
              </p>
              {overview.dataUpdatedAt ? (
                <p className="muted" style={{ marginTop: 8, fontSize: 'var(--t-sm)' }}>
                  Consultado a las {formatTime(new Date(overview.dataUpdatedAt).toISOString())}
                  {overview.data ? ` · ${overview.data.durationMs} ms` : ''} · se actualiza solo
                </p>
              ) : null}
            </div>
            {overview.data ? <GraphqlInspector memberId={memberId} raw={overview.data.raw} durationMs={overview.data.durationMs} /> : null}
          </section>
        </div>
      </div>

      {expiring && restMembership && member ? (
        <ExpireDialog membership={restMembership} memberName={member.name} onClose={() => setExpiring(false)} />
      ) : null}
    </div>
  );
}
