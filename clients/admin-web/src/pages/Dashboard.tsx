import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Activity, ArrowRight, CalendarClock, DoorOpen, IdCard, Receipt, Route, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAccessAttempts, useKafkaFeed, useLookups, usePayments, useSystemStatus } from '../api/hooks';
import { useDrawers } from '../components/DrawerHost';
import { ComponentList } from '../components/SystemStatus';
import { AccessBadge, Avatar, EmptyState, ErrorNotice, ErrorState, MembershipBadge, PageHeader, Topic } from '../components/ui';
import { describeError } from '../lib/errors';
import {
  daysUntil,
  formatDate,
  formatInteger,
  formatLongDate,
  formatMoney,
  formatRelative,
  formatTime,
  plural,
  todayISO,
} from '../lib/format';
import { describeEvent, eventLabel, reasonLabel } from '../lib/labels';

const sameLocalDay = (iso: string, day: string) => todayISO(new Date(iso)) === day;

/** Subtítulo de un indicador cuyos datos no se pudieron consultar (en vez de un "0" que confunde). */
const NO_DATA = 'Sin datos por ahora';

/** Mientras llegan los datos no se dice "no hay": se muestra que se están cargando. */
function CardLoading() {
  return (
    <div className="card-body" aria-label="Cargando">
      <span className="skeleton" style={{ height: 96 }} />
    </div>
  );
}

export function Dashboard() {
  const { open } = useDrawers();
  const navigate = useNavigate();
  const { members, memberships, memberById, planById } = useLookups();
  const payments = usePayments();
  const attempts = useAccessAttempts(200);
  const status = useSystemStatus();
  const feed = useKafkaFeed({ interval: 3_000 });

  const today = todayISO();
  const stats = useMemo(() => {
    const allMemberships = memberships.data ?? [];
    const todayAttempts = (attempts.data ?? []).filter((attempt) => sameLocalDay(attempt.occurredAt, today));
    const month = today.slice(0, 7);
    const monthPayments = (payments.data ?? []).filter((payment) => todayISO(new Date(payment.paidAt)).startsWith(month));
    return {
      members: members.data?.length ?? 0,
      newToday: (members.data ?? []).filter((member) => sameLocalDay(member.createdAt, today)).length,
      active: allMemberships.filter((m) => m.status === 'ACTIVE').length,
      pending: allMemberships.filter((m) => m.status === 'PENDING'),
      expired: allMemberships.filter((m) => m.status === 'EXPIRED').length,
      expiring: allMemberships
        .filter((m) => m.status === 'ACTIVE' && m.endDate && daysUntil(m.endDate) <= 7)
        .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? '')),
      granted: todayAttempts.filter((attempt) => attempt.result === 'ACCESS_GRANTED').length,
      denied: todayAttempts.filter((attempt) => attempt.result === 'ACCESS_DENIED').length,
      revenue: monthPayments.reduce((sum, payment) => sum + payment.amount, 0),
      monthPayments: monthPayments.length,
    };
  }, [members.data, memberships.data, attempts.data, payments.data, today]);

  const loading = members.isLoading || memberships.isLoading;
  // "No hay miembros" solo si la lista llegó vacía, no si no se pudo consultar.
  const isEmpty = members.data !== undefined && stats.members === 0;
  const totalToday = stats.granted + stats.denied;
  const recentAttempts = (attempts.data ?? []).slice(0, 6);
  const recentEvents = feed.events.slice(-5).reverse();
  const nameOf = (id: number) => memberById.get(id)?.name;

  // Un solo aviso para todo el tablero, con el primer error y un reintento de todo lo que falló.
  const sources = [members, memberships, payments, attempts];
  const failure = sources.find((source) => source.error)?.error ?? null;
  const missingData = sources.some((source) => source.error && source.data === undefined);
  const retryAll = () => sources.filter((source) => source.error).forEach((source) => source.refetch());
  const value = (ready: boolean, text: string) => (ready ? text : '—');

  return (
    <div className="page">
      <PageHeader
        title="Inicio"
        description={`${formatLongDate()} · Resumen de la operación del gimnasio`}
        actions={
          <>
            <Link to="/acceso" className="btn btn-secondary">
              <DoorOpen aria-hidden="true" />
              Validar ingreso
            </Link>
            <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'member' })}>
              <UserPlus aria-hidden="true" />
              Registrar miembro
            </button>
          </>
        }
      />

      {/* Breve: la causa y qué hacer ya los explica el aviso de conexión de arriba. */}
      {failure ? (
        <ErrorNotice
          error={failure}
          title="Parte del resumen no está al día"
          onRetry={retryAll}
          retrying={sources.some((source) => source.isFetching)}
          stale={!missingData}
          brief
        />
      ) : null}

      {isEmpty ? (
        <section className="hero-card" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-kicker">Primer paso</p>
            <h2 id="hero-title">Haz el recorrido guiado de la plataforma</h2>
            <p>
              En cinco pasos registras un miembro, le asignas un plan, recibes su pago, lo dejas entrar por el torniquete y
              consultas su ficha consolidada. En cada paso ves qué servicio actúa y qué evento viaja por Kafka.
            </p>
            <div className="hero-actions">
              <Link to="/recorrido" className="btn btn-accent btn-lg">
                <Route aria-hidden="true" />
                Iniciar recorrido
              </Link>
              <button type="button" className="btn btn-lg hero-secondary" onClick={() => open({ kind: 'member' })}>
                Prefiero registrar un miembro
              </button>
            </div>
          </div>
          <ol className="hero-steps">
            {['Registrar miembro', 'Asignar plan', 'Registrar pago', 'Validar ingreso', 'Ver ficha consolidada'].map((step, index) => (
              <li key={step}>
                <span className="hero-step-n">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="stat-grid" aria-label="Indicadores">
        <article className="card stat">
          <span className="stat-label">
            <Users aria-hidden="true" />
            Miembros registrados
          </span>
          <span className="stat-value">{value(!loading && members.data !== undefined, formatInteger(stats.members))}</span>
          <span className="stat-meta">
            {members.data === undefined
              ? NO_DATA
              : stats.newToday > 0
                ? `${plural(stats.newToday, 'nuevo')} hoy`
                : 'Ninguno nuevo hoy'}
          </span>
        </article>
        <article className="card stat">
          <span className="stat-label">
            <IdCard aria-hidden="true" />
            Membresías activas
          </span>
          <span className="stat-value">{value(!loading && memberships.data !== undefined, formatInteger(stats.active))}</span>
          <span className="stat-meta">
            {memberships.data === undefined
              ? NO_DATA
              : `${plural(stats.pending.length, 'pendiente')} de pago · ${plural(stats.expired, 'vencida')}`}
          </span>
        </article>
        <article className="card stat">
          <span className="stat-label">
            <ShieldCheck aria-hidden="true" />
            Intentos de ingreso hoy
          </span>
          <span className="stat-value">{value(attempts.data !== undefined, formatInteger(totalToday))}</span>
          <div
            className="segbar"
            role="img"
            aria-label={`${stats.granted} permitidos y ${stats.denied} denegados`}
            title={`${stats.granted} permitidos · ${stats.denied} denegados`}
          >
            {stats.granted > 0 ? <span style={{ flex: stats.granted, background: 'var(--good)' }} /> : null}
            {stats.denied > 0 ? <span style={{ flex: stats.denied, background: 'var(--bad)' }} /> : null}
          </div>
          {attempts.data === undefined ? (
            <span className="stat-meta">{NO_DATA}</span>
          ) : (
            <span className="legend">
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: 'var(--good)' }} />
                {formatInteger(stats.granted)} permitidos
              </span>
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: 'var(--bad)' }} />
                {formatInteger(stats.denied)} denegados
              </span>
            </span>
          )}
        </article>
        <article className="card stat">
          <span className="stat-label">
            <Receipt aria-hidden="true" />
            Recaudo del mes
          </span>
          <span className="stat-value">{value(payments.data !== undefined, formatMoney(stats.revenue))}</span>
          <span className="stat-meta">
            {payments.data === undefined
              ? NO_DATA
              : `${plural(stats.monthPayments, 'pago registrado', 'pagos registrados')} este mes`}
          </span>
        </article>
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="attention-title">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="attention-title">
                <CalendarClock aria-hidden="true" />
                Requieren atención
              </h2>
              <p className="card-subtitle">Pagos pendientes y membresías que vencen esta semana</p>
            </div>
          </div>
          {memberships.error && memberships.data === undefined ? (
            <ErrorState error={memberships.error} title="No se pudieron consultar las membresías" brief />
          ) : memberships.data === undefined ? (
            <CardLoading />
          ) : stats.pending.length === 0 && stats.expiring.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Todo al día" text="No hay pagos pendientes ni membresías por vencer en los próximos 7 días." />
          ) : (
            <ul className="row-list">
              {stats.pending.slice(0, 5).map((membership) => {
                const member = memberById.get(membership.memberId);
                const plan = planById.get(membership.planId);
                return (
                  <li key={`p-${membership.id}`} className="row-item">
                    <Avatar name={member?.name ?? '?'} id={membership.memberId} />
                    <span className="cell-stack grow">
                      <Link to={`/miembros/${membership.memberId}`} className="cell-primary link-quiet">
                        {member?.name ?? `Miembro #${membership.memberId}`}
                      </Link>
                      <span className="cell-secondary">
                        Membresía #{membership.id} · {plan?.name ?? 'Plan'} {plan ? `· ${formatMoney(plan.price)}` : ''}
                      </span>
                    </span>
                    <MembershipBadge status="PENDING" />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => open({ kind: 'payment', membershipId: membership.id })}
                    >
                      Registrar pago
                    </button>
                  </li>
                );
              })}
              {stats.expiring.slice(0, 4).map((membership) => {
                const member = memberById.get(membership.memberId);
                const days = daysUntil(membership.endDate ?? today);
                return (
                  <li key={`e-${membership.id}`} className="row-item">
                    <Avatar name={member?.name ?? '?'} id={membership.memberId} />
                    <span className="cell-stack grow">
                      <Link to={`/miembros/${membership.memberId}`} className="cell-primary link-quiet">
                        {member?.name ?? `Miembro #${membership.memberId}`}
                      </Link>
                      <span className="cell-secondary">
                        Vence el {formatDate(membership.endDate)} ·{' '}
                        {days <= 0 ? 'hoy es su último día' : `en ${plural(days, 'día')}`}
                      </span>
                    </span>
                    <MembershipBadge status="ACTIVE" />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="recent-access-title">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="recent-access-title">
                <DoorOpen aria-hidden="true" />
                Últimos intentos de ingreso
              </h2>
              <p className="card-subtitle">Decididos por Access Control con su estado local</p>
            </div>
            <Link to="/acceso" className="btn btn-ghost btn-sm">
              Ver todos
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          {attempts.error && attempts.data === undefined ? (
            <ErrorState error={attempts.error} title="No se pudieron consultar los ingresos" brief />
          ) : attempts.data === undefined ? (
            <CardLoading />
          ) : recentAttempts.length === 0 ? (
            <EmptyState
              icon={DoorOpen}
              title="Aún no hay intentos de ingreso"
              text="Cuando alguien pase por el torniquete simulado, aparecerá aquí."
              actions={
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/acceso')}>
                  Abrir control de acceso
                </button>
              }
            />
          ) : (
            <ul className="row-list">
              {recentAttempts.map((attempt) => {
                const member = memberById.get(attempt.memberId);
                return (
                  <li key={attempt.attemptId} className="row-item">
                    <Avatar name={member?.name ?? '?'} id={attempt.memberId} />
                    <span className="cell-stack grow">
                      <span className="cell-primary">{member?.name ?? `Miembro #${attempt.memberId}`}</span>
                      <span className="cell-secondary">
                        {reasonLabel(attempt.reason)} · {formatRelative(attempt.occurredAt)}
                      </span>
                    </span>
                    <AccessBadge result={attempt.result} reason={attempt.reason} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="system-title">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="system-title">
                <ShieldCheck aria-hidden="true" />
                Estado del sistema
              </h2>
              <p className="card-subtitle">Componentes que corren en Docker Compose</p>
            </div>
          </div>
          {status.data && !status.error ? (
            <ComponentList status={status.data} />
          ) : status.error ? (
            <ErrorState error={status.error} title="No se pudo consultar el estado" brief />
          ) : (
            <div className="card-body muted">Consultando…</div>
          )}
        </section>

        <section className="card" aria-labelledby="kafka-title">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="kafka-title">
                <Activity aria-hidden="true" />
                Actividad en Kafka
              </h2>
              <p className="card-subtitle">Últimos eventos entre los servicios</p>
            </div>
            <Link to="/eventos" className="btn btn-ghost btn-sm">
              Ver todos
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          {feed.error && recentEvents.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No se pudieron leer los eventos de Kafka"
              text={`${describeError(feed.error).title}. Se vuelve a intentar solo.`}
            />
          ) : !feed.loaded ? (
            <CardLoading />
          ) : recentEvents.length === 0 ? (
            <EmptyState icon={Activity} title="Sin eventos todavía" text="Cada registro, pago o ingreso publica un evento que verás aquí." />
          ) : (
            <ul className="row-list">
              {recentEvents.map((entry) => (
                <li key={entry.seq} className="row-item row-item-event">
                  <span className="event-time num">{formatTime(entry.timestamp)}</span>
                  <span className="cell-stack grow">
                    <span className="event-type">{eventLabel(entry.eventType, entry.payload)}</span>
                    <span className="cell-secondary">{describeEvent(entry.eventType, entry.payload, nameOf)}</span>
                  </span>
                  <Topic name={entry.topic} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
