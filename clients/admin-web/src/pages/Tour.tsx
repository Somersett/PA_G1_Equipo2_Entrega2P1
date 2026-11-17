import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Flag,
  Info,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from 'lucide-react';
import { fetchMembership } from '../api/graphql';
import { keys, useAccessAttempt, useExpireMembership, useKafkaFeed, useLookups, useMemberOverview } from '../api/hooks';
import type { AccessAttempt, KafkaEntry, Membership } from '../api/types';
import { useDrawers } from '../components/DrawerHost';
import { GraphqlInspector } from '../components/GraphqlInspector';
import { MembershipPeriod } from '../components/MembershipPeriod';
import { AccessBadge, Avatar, ErrorNotice, ErrorState, MembershipBadge, PageHeader, Spinner, Topic } from '../components/ui';
import { MemberForm } from '../forms/MemberForm';
import { MembershipForm } from '../forms/MembershipForm';
import { PaymentForm } from '../forms/PaymentForm';
import { describeError, errorCode } from '../lib/errors';
import { formatMoney, formatTime } from '../lib/format';
import { describeEvent, EVENT_FLOW, reasonLabel } from '../lib/labels';

// Recorrido guiado: el flujo principal del PDF (§4, figura 2) paso a paso, mostrando qué servicio actúa y qué
// evento viaja por Kafka. El progreso se guarda en sessionStorage para no perderlo al navegar.
//
// Tolerancia a fallos: ningún paso se queda esperando en silencio. Si algo tarda más de lo normal, el paso
// explica la causa probable y cómo seguir; si los datos cambiaron por fuera del recorrido (otra pestaña, datos
// reiniciados), ofrece continuar desde donde corresponde en vez de bloquearse.

const STORAGE_KEY = 'fetgym.tour';
/** Tras este tiempo sin novedades, el paso avisa que algo tarda más de lo normal y por qué. */
const SLOW_MS = 15_000;
/** Si MEMBERSHIP_EXPIRED no aparece en el visor (Kafka lento o visor caído), se intenta el ingreso igual. */
const EXPIRED_WAIT_MS = 8_000;

interface TourState {
  step: number;
  startedAt: string;
  memberId?: number;
  membershipId?: number;
  paymentId?: number;
  attemptId?: number;
  deniedAttempt?: AccessAttempt;
}

const STEPS = [
  { title: 'Registrar miembro', service: 'Members Service', channel: 'POST /members' },
  { title: 'Asignar plan', service: 'Memberships Service', channel: 'POST /memberships' },
  { title: 'Registrar pago', service: 'Payments → Memberships', channel: 'POST /payments + Kafka' },
  { title: 'Validar ingreso', service: 'Access Control', channel: 'POST /access-attempts' },
  { title: 'Ver ficha consolidada', service: 'GraphQL Gateway', channel: 'query member(id)' },
];

const fresh = (): TourState => ({ step: 0, startedAt: new Date().toISOString() });

const optionalId = (value: unknown) => value === undefined || (Number.isSafeInteger(value) && (value as number) > 0);

/** Un estado guardado por otra versión del panel o editado a mano se descarta en vez de romper la pantalla. */
function isTourState(value: unknown): value is TourState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return (
    Number.isInteger(state.step) &&
    (state.step as number) >= 0 &&
    (state.step as number) <= STEPS.length &&
    typeof state.startedAt === 'string' &&
    !Number.isNaN(Date.parse(state.startedAt)) &&
    optionalId(state.memberId) &&
    optionalId(state.membershipId) &&
    optionalId(state.paymentId) &&
    optionalId(state.attemptId)
  );
}

function loadState(): TourState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed: unknown = JSON.parse(raw);
    return isTourState(parsed) ? parsed : fresh();
  } catch {
    return fresh();
  }
}

function persist(state: TourState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Almacenamiento bloqueado: el recorrido sigue funcionando, solo no sobrevive a una recarga.
  }
}

/** true cuando pasaron `ms` con `active` encendido; vuelve a false si `active` se apaga o cambia `resetKey`. */
function useAfter(ms: number, active: boolean, resetKey?: unknown) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    setElapsed(false);
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms, active, resetKey]);
  return elapsed;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function relatedTo(entry: KafkaEntry, state: TourState) {
  const payload = entry.payload;
  if (!payload || entry.timestamp < state.startedAt) return false;
  return (
    (state.memberId !== undefined && Number(payload.memberId) === state.memberId) ||
    (state.membershipId !== undefined && Number(payload.membershipId) === state.membershipId)
  );
}

export function Tour() {
  const [state, setState] = useState<TourState>(loadState);
  const { memberById, members } = useLookups();
  const { open } = useDrawers();
  const feed = useKafkaFeed({ interval: 900 });

  const update = useCallback((patch: Partial<TourState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const restart = useCallback(() => {
    const next = fresh();
    persist(next);
    setState(next);
  }, []);

  const backToPlan = useCallback(
    () => update({ step: 1, membershipId: undefined, paymentId: undefined, attemptId: undefined, deniedAttempt: undefined }),
    [update],
  );

  // Si los datos se reiniciaron, el recorrido guardado apunta a un miembro que ya no existe: se avisa y se
  // empieza de nuevo en vez de quedar atascado en un paso imposible.
  useEffect(() => {
    if (state.memberId && members.isSuccess && !members.isFetching && !memberById.has(state.memberId)) {
      toast.info('El recorrido empezó de nuevo', {
        description: `El miembro #${state.memberId} ya no existe: los datos del sistema se reiniciaron.`,
      });
      restart();
    }
  }, [members.isSuccess, members.isFetching, memberById, state.memberId, restart]);

  // Al avanzar de paso se vuelve arriba para que el paso nuevo se lea desde su inicio.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state.step]);

  const events = useMemo(() => feed.events.filter((entry) => relatedTo(entry, state)).reverse(), [feed.events, state]);
  const member = state.memberId ? memberById.get(state.memberId) : undefined;
  const done = state.step >= STEPS.length;
  // Un paso sin los datos que necesita (estado guardado incompleto): se ofrece reiniciar en vez de una pantalla vacía.
  const broken = (state.step >= 1 && !state.memberId) || (state.step >= 2 && !state.membershipId);

  return (
    <div className="page page-wide">
      <PageHeader
        title="Recorrido guiado"
        description="El flujo principal de la plataforma de punta a punta: de un miembro nuevo a su ingreso al gimnasio. Cada paso muestra qué servicio actúa y qué evento viaja por Kafka."
        actions={
          state.step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={restart}>
              <RotateCcw aria-hidden="true" />
              Empezar de nuevo
            </button>
          ) : null
        }
      />

      <div className="tour">
        <nav className="card tour-steps" aria-label="Pasos del recorrido">
          <ol>
            {STEPS.map((step, index) => {
              const status = index < state.step ? 'done' : index === state.step ? 'current' : 'todo';
              return (
                <li key={step.title} className={`tour-step is-${status}`} aria-current={status === 'current' ? 'step' : undefined}>
                  <span className="tour-step-mark" aria-hidden="true">
                    {status === 'done' ? <Check /> : index + 1}
                  </span>
                  <span className="tour-step-text">
                    <span className="tour-step-title">{step.title}</span>
                    <span className="tour-step-service">{step.service}</span>
                  </span>
                  {status === 'done' ? <span className="sr-only">(completado)</span> : null}
                </li>
              );
            })}
          </ol>
          {member ? (
            <div className="tour-subject">
              <Avatar name={member.name} id={member.id} />
              <span className="cell-stack">
                <span className="cell-primary">{member.name}</span>
                <span className="cell-secondary">Miembro #{member.id}</span>
              </span>
            </div>
          ) : null}
        </nav>

        <section className="card tour-panel" aria-live="polite">
          {broken ? <BrokenStep onRestart={restart} /> : null}

          {!broken && state.step === 0 ? (
            <StepShell
              index={0}
              lead={
                <>
                  <strong>Members Service</strong> guarda al miembro en <code>members_db</code> y publica <code>MEMBER_REGISTERED</code>. Consolidated
                  Queries lo consume para armar la vista consolidada.
                </>
              }
            >
              <MemberForm
                variant="inline"
                submitLabel="Registrar y continuar"
                onSuccess={(created) => update({ step: 1, memberId: created.id, startedAt: state.startedAt })}
              />
            </StepShell>
          ) : null}

          {!broken && state.step === 1 && state.memberId ? (
            <StepShell
              index={1}
              lead={
                <>
                  <strong>Memberships Service</strong> crea la membresía <strong>pendiente de pago</strong> y publica <code>MEMBERSHIP_CREATED</code>.
                  Todavía no permite entrar.
                </>
              }
            >
              <MembershipForm
                variant="inline"
                memberId={state.memberId}
                lockMember
                onPayPending={(membership) => update({ step: 2, membershipId: membership.id, paymentId: undefined })}
                onUseActive={(membership) => update({ step: 3, membershipId: membership.id, paymentId: undefined })}
                onCreatePlan={() => open({ kind: 'plan' })}
                onSuccess={(membership) => update({ step: 2, membershipId: membership.id, paymentId: undefined })}
              />
            </StepShell>
          ) : null}

          {!broken && state.step === 2 && state.membershipId ? (
            <PaymentStep
              state={state}
              events={feed.events}
              onPaid={(paymentId) => update({ paymentId })}
              onNext={() => update({ step: 3 })}
              onBackToPlan={backToPlan}
              onRestart={restart}
            />
          ) : null}

          {!broken && state.step === 3 && state.memberId ? (
            <AccessStep
              memberId={state.memberId}
              onGranted={(attempt) => update({ step: 4, attemptId: attempt.attemptId })}
              onBackToPlan={backToPlan}
            />
          ) : null}

          {!broken && state.step === 4 && state.memberId ? (
            <OverviewStep memberId={state.memberId} attemptId={state.attemptId} onNext={() => update({ step: 5 })} />
          ) : null}

          {!broken && done && state.memberId ? (
            <DoneStep
              state={state}
              events={feed.events}
              feedError={feed.error}
              onDenied={(attempt) => update({ deniedAttempt: attempt })}
              onRestart={restart}
            />
          ) : null}
        </section>

        <aside className="card tour-feed" aria-labelledby="tour-feed-title">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="tour-feed-title">
                <span className={`live-dot${feed.error ? ' is-down' : ''}`} aria-hidden="true" />
                Eventos de este recorrido
              </h2>
              <p className="card-subtitle">Leídos de Kafka en tiempo real</p>
            </div>
          </div>
          {feed.error ? (
            <div className="tour-feed-error">
              <ErrorNotice error={feed.error} title="No se pueden leer los eventos ahora" stale={events.length > 0} />
              <p className="muted">El recorrido sigue funcionando: cada paso comprueba su resultado por su cuenta.</p>
            </div>
          ) : null}
          {events.length === 0 ? (
            feed.error ? null : (
              <p className="tour-feed-empty">
                {state.memberId
                  ? 'Esperando eventos…'
                  : 'Cuando registres al miembro, aquí verás cada evento que publican los servicios.'}
              </p>
            )
          ) : (
            <ol className="feed-list">
              {events.map((entry) => {
                const flow = entry.eventType ? EVENT_FLOW[entry.eventType] : undefined;
                return (
                  <li key={entry.seq} className="feed-item">
                    <div className="feed-item-head">
                      <span className="event-type">{entry.eventType}</span>
                      <span className="muted num feed-time">{formatTime(entry.timestamp)}</span>
                    </div>
                    <p className="feed-text">{describeEvent(entry.eventType, entry.payload, (id) => memberById.get(id)?.name)}</p>
                    <div className="feed-meta">
                      <Topic name={entry.topic} />
                      {flow ? (
                        <span className="feed-flow">
                          {flow.producer} <ArrowRight aria-hidden="true" /> {flow.consumers.join(', ')}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}

function StepShell({ index, lead, children }: { index: number; lead: ReactNode; children: ReactNode }) {
  const step = STEPS[index];
  return (
    <div className="tour-step-panel">
      <header className="tour-panel-head">
        <span className="tour-panel-kicker">
          Paso {index + 1} de {STEPS.length} · <code>{step.channel}</code>
        </span>
        <h2 className="tour-panel-title">{step.title}</h2>
        <p className="tour-panel-lead">{lead}</p>
      </header>
      {children}
    </div>
  );
}

function BrokenStep({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="tour-step-panel">
      <div className="form-body">
        <div className="notice notice-warn" role="alert">
          <TriangleAlert aria-hidden="true" />
          <div className="notice-body">
            <span>
              <strong>El recorrido guardado quedó incompleto.</strong> Le faltan datos de un paso anterior, así que no se
              puede continuar desde aquí.
            </span>
            <span className="notice-hint">Empieza de nuevo: los datos ya registrados no se pierden.</span>
          </div>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={onRestart}>
          <RotateCcw aria-hidden="true" />
          Empezar de nuevo
        </button>
      </div>
    </div>
  );
}

function Check2({ ok, pending, children }: { ok: boolean; pending?: boolean; children: ReactNode }) {
  return (
    <li className={`checklist-item${ok ? ' is-ok' : ''}`}>
      <span className="checklist-mark" aria-hidden="true">
        {ok ? <Check /> : pending ? <LoaderCircle className="spinner" /> : null}
      </span>
      <span>{children}</span>
      <span className="sr-only">{ok ? '(listo)' : '(en curso)'}</span>
    </li>
  );
}

/** Aviso de "esto está tardando más de lo normal", con la causa probable y qué hacer. */
function SlowNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="notice notice-warn" role="status">
      <TriangleAlert aria-hidden="true" />
      <div className="notice-body">
        <span>
          <strong>{title}</strong>
        </span>
        <span className="notice-hint">{children}</span>
      </div>
    </div>
  );
}

function PaymentStep({
  state,
  events,
  onPaid,
  onNext,
  onBackToPlan,
  onRestart,
}: {
  state: TourState;
  events: KafkaEntry[];
  onPaid: (paymentId: number) => void;
  onNext: () => void;
  onBackToPlan: () => void;
  onRestart: () => void;
}) {
  const queryClient = useQueryClient();
  const { memberships, membershipById } = useLookups();
  const membershipId = state.membershipId as number;
  const current: Membership | undefined = membershipById.get(membershipId);
  const membership = useQuery({
    queryKey: ['tour-membership', membershipId],
    queryFn: () => fetchMembership(membershipId),
    enabled: Boolean(state.paymentId),
    refetchInterval: (query) => (query.state.data?.status === 'ACTIVE' ? false : 600),
  });
  const active = membership.data?.status === 'ACTIVE';
  const slow = useAfter(SLOW_MS, Boolean(state.paymentId) && !active, state.paymentId);

  useEffect(() => {
    if (active) queryClient.invalidateQueries({ queryKey: keys.memberships });
  }, [active, queryClient]);

  const paymentEvent = events.find(
    (entry) => entry.eventType === 'PAYMENT_REGISTERED' && Number(entry.payload?.paymentId) === state.paymentId,
  );
  const activatedEvent = events.find(
    (entry) => entry.eventType === 'MEMBERSHIP_ACTIVATED' && Number(entry.payload?.membershipId) === membershipId,
  );

  const lead = (
    <>
      <strong>Payments</strong> guarda el pago y publica <code>PAYMENT_REGISTERED</code>. <strong>Memberships</strong> lo consume, activa la
      membresía y publica <code>MEMBERSHIP_ACTIVATED</code>, que <strong>Access Control</strong> usa para actualizar su estado local.
    </>
  );

  // Antes de pagar se comprueba que la membresía siga esperando pago: pudo pagarse o vencerse por fuera.
  if (!state.paymentId) {
    const listLoaded = memberships.data !== undefined && !memberships.isFetching;
    let blocker: ReactNode = null;
    if (memberships.error && memberships.data === undefined) {
      blocker = (
        <ErrorState
          error={memberships.error}
          title="No se pudo comprobar la membresía"
          onRetry={() => memberships.refetch()}
          retrying={memberships.isFetching}
        />
      );
    } else if (listLoaded && !current) {
      blocker = (
        <>
          <div className="notice notice-warn" role="alert">
            <TriangleAlert aria-hidden="true" />
            <div className="notice-body">
              <span>
                <strong>No se encontró la membresía #{membershipId}.</strong> Puede que los datos se hayan reiniciado.
              </span>
              <span className="notice-hint">Vuelve a asignarle un plan al miembro o empieza el recorrido de nuevo.</span>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onRestart}>
              <RotateCcw aria-hidden="true" />
              Empezar de nuevo
            </button>
            <button type="button" className="btn btn-primary" onClick={onBackToPlan}>
              <ArrowLeft aria-hidden="true" />
              Volver a asignar plan
            </button>
          </div>
        </>
      );
    } else if (current?.status === 'ACTIVE') {
      blocker = (
        <>
          <div className="tour-result is-good" role="status">
            <CircleCheck aria-hidden="true" />
            <div>
              <strong>La membresía #{membershipId} ya está activa.</strong> Su pago se registró por fuera del recorrido.{' '}
              <MembershipPeriod membership={current} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={onNext}>
              Continuar al torniquete
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </>
      );
    } else if (current?.status === 'EXPIRED') {
      blocker = (
        <>
          <div className="notice notice-warn" role="alert">
            <TriangleAlert aria-hidden="true" />
            <div className="notice-body">
              <span>
                <strong>La membresía #{membershipId} ya venció</strong> y no admite pagos.
              </span>
              <span className="notice-hint">Asígnale un plan nuevo al miembro para seguir con el recorrido.</span>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={onBackToPlan}>
              <ArrowLeft aria-hidden="true" />
              Asignar un plan nuevo
            </button>
          </div>
        </>
      );
    }
    return (
      <StepShell index={2} lead={lead}>
        {blocker ? (
          <div className="form-body">{blocker}</div>
        ) : (
          <PaymentForm variant="inline" membershipId={membershipId} lockMembership onSuccess={(payment) => onPaid(payment.id)} />
        )}
      </StepShell>
    );
  }

  const vanished = membership.isSuccess && membership.data === null;

  return (
    <StepShell index={2} lead={lead}>
      <div className="form-body">
        <ol className="checklist" aria-label="Activación de la membresía">
          <Check2 ok>
            Pago <strong>#{state.paymentId}</strong> guardado en <code>payments_db</code>
          </Check2>
          <Check2 ok={Boolean(paymentEvent)} pending>
            Payments publicó <code>PAYMENT_REGISTERED</code> en <Topic name="payments.events" />
          </Check2>
          <Check2 ok={active} pending>
            Memberships consumió el pago y activó la membresía <strong>#{membershipId}</strong>
          </Check2>
          <Check2 ok={Boolean(activatedEvent)} pending>
            Memberships publicó <code>MEMBERSHIP_ACTIVATED</code> en <Topic name="memberships.events" />
          </Check2>
        </ol>
        {active && membership.data ? (
          <div className="tour-result is-good">
            <CircleCheck aria-hidden="true" />
            <div>
              <strong>Membresía activa.</strong> <MembershipPeriod membership={membership.data} />
            </div>
          </div>
        ) : null}
        {membership.error ? (
          <ErrorNotice error={membership.error} title="No se pudo consultar la membresía" stale={Boolean(membership.data)} />
        ) : null}
        {vanished ? (
          <div className="notice notice-warn" role="alert">
            <TriangleAlert aria-hidden="true" />
            <div className="notice-body">
              <span>
                <strong>La membresía #{membershipId} ya no existe.</strong> Los datos se reiniciaron mientras esperábamos.
              </span>
              <button type="button" className="btn btn-sm btn-secondary" style={{ width: 'fit-content' }} onClick={onRestart}>
                Empezar de nuevo
              </button>
            </div>
          </div>
        ) : null}
        {slow && !active && !vanished ? (
          <SlowNotice title="La activación está tardando más de lo normal.">
            El pago #{state.paymentId} ya quedó guardado y no hay que registrarlo de nuevo. Suele deberse a que Kafka o el
            simulador están caídos o lentos (revisa el estado del sistema, abajo a la izquierda, y la pantalla{' '}
            <Link to="/eventos">Eventos Kafka</Link>). Cuando se recuperen, la membresía se activará sola y este paso
            continuará.
          </SlowNotice>
        ) : null}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-primary" disabled={!active} onClick={onNext}>
          Continuar al torniquete
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </StepShell>
  );
}

/** Explicación de un ingreso denegado durante el recorrido, según el motivo y cuántas veces pasó. */
function denialHelp(reason: string, denials: number) {
  if (reason === 'MEMBERSHIP_EXPIRED') {
    return 'Access Control tiene la membresía como vencida. Asígnale un plan nuevo para continuar.';
  }
  if (denials < 3) {
    return 'Access Control decide con su estado local, que se actualiza al consumir MEMBERSHIP_ACTIVATED de Kafka (consistencia eventual). Espera un segundo y vuelve a intentar.';
  }
  return `Ya van ${denials} intentos. Revisa en Eventos Kafka que MEMBERSHIP_ACTIVATED se haya publicado y que Kafka esté en línea en el estado del sistema. Cuando Access Control reciba el evento, el torniquete abrirá.`;
}

function AccessStep({
  memberId,
  onGranted,
  onBackToPlan,
}: {
  memberId: number;
  onGranted: (attempt: AccessAttempt) => void;
  onBackToPlan: () => void;
}) {
  const mutation = useAccessAttempt();
  const { memberById } = useLookups();
  const [result, setResult] = useState<AccessAttempt | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [denials, setDenials] = useState(0);
  const member = memberById.get(memberId);
  const granted = result?.result === 'ACCESS_GRANTED';

  const validate = async () => {
    setError(null);
    try {
      const attempt = await mutation.mutateAsync(memberId);
      setResult(attempt);
      if (attempt.result !== 'ACCESS_GRANTED') setDenials((count) => count + 1);
    } catch (cause) {
      setError(cause);
    }
  };

  return (
    <StepShell
      index={3}
      lead={
        <>
          El torniquete llama a <strong>Access Control</strong>, que decide solo con su estado local en <code>access_db</code>: no consulta a
          Members, Memberships, Payments ni a la vista consolidada. Luego publica <code>ACCESS_GRANTED</code> o <code>ACCESS_DENIED</code>.
        </>
      }
    >
      <div className="form-body">
        <div className="selected-member">
          {member ? <Avatar name={member.name} id={member.id} /> : null}
          <span className="cell-stack">
            <span className="cell-primary">{member?.name ?? `Miembro #${memberId}`}</span>
            <span className="cell-secondary">Se presenta en la entrada principal</span>
          </span>
        </div>
        {result ? (
          <div className={`tour-result ${granted ? 'is-good' : 'is-bad'}`} role="status">
            {granted ? <ShieldCheck aria-hidden="true" /> : <ShieldX aria-hidden="true" />}
            <div>
              <strong>{granted ? 'Acceso permitido.' : 'Acceso denegado.'}</strong> {reasonLabel(result.reason)} · intento #{result.attemptId}
              {!granted ? (
                <p className="muted" style={{ marginTop: 4 }}>
                  {denialHelp(result.reason, denials)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        {error ? <ErrorNotice error={error} title="No se pudo validar el ingreso" /> : null}
      </div>
      <div className="form-actions">
        {!granted && result?.reason === 'MEMBERSHIP_EXPIRED' ? (
          <button type="button" className="btn btn-ghost" onClick={onBackToPlan}>
            <ArrowLeft aria-hidden="true" />
            Asignar un plan nuevo
          </button>
        ) : null}
        {granted && result ? (
          <button type="button" className="btn btn-primary" onClick={() => onGranted(result)}>
            Continuar a la ficha consolidada
            <ArrowRight aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={validate} disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner label="Validando" /> : <ShieldCheck aria-hidden="true" />}
            {result || error ? 'Intentar de nuevo' : 'Validar ingreso'}
          </button>
        )}
      </div>
    </StepShell>
  );
}

function OverviewStep({ memberId, attemptId, onNext }: { memberId: number; attemptId?: number; onNext: () => void }) {
  const overview = useMemberOverview(memberId, { poll: 1_500 });
  const { planById } = useLookups();
  const data = overview.data?.data.member;
  const projected = Boolean(data?.recentAccesses.some((attempt) => attempt.attemptId === attemptId));
  const slow = useAfter(SLOW_MS, !projected, memberId);
  // El flujo principal ya terminó en el paso anterior: si la vista consolidada falla o tarda, se puede cerrar.
  const canFinish = projected || slow || Boolean(overview.error);
  const plan = data?.membership ? planById.get(data.membership.planId) : undefined;

  return (
    <StepShell
      index={4}
      lead={
        <>
          El <strong>GraphQL Gateway</strong> responde la consulta <code>member(id)</code> pidiéndole los datos a <strong>Consolidated Queries</strong>,
          que los armó con los eventos de Kafka. Es una vista de solo lectura con consistencia eventual.
        </>
      }
    >
      <div className="form-body">
        {overview.error ? (
          <ErrorNotice
            error={overview.error}
            title="La ficha consolidada no responde"
            onRetry={() => overview.refetch()}
            retrying={overview.isFetching}
            stale={Boolean(data)}
          />
        ) : null}
        {!data ? (
          overview.error ? null : overview.isSuccess ? (
            <div className="notice" role="status">
              <Spinner />
              <span>
                <strong>Consolidated Queries todavía no tiene a este miembro.</strong> Lo agrega al consumir <code>MEMBER_REGISTERED</code> de Kafka.
              </span>
            </div>
          ) : (
            <div className="notice" role="status">
              <Spinner />
              <span>Consultando la vista consolidada…</span>
            </div>
          )
        ) : (
          <div className="overview-card">
            <div className="overview-head">
              <Avatar name={data.member.name} id={data.member.id} size="lg" />
              <div className="cell-stack grow">
                <span className="overview-name">{data.member.name}</span>
                <span className="cell-secondary">
                  Doc. {data.member.document} · {data.member.phone}
                  {data.member.email ? ` · ${data.member.email}` : ''}
                </span>
              </div>
              {data.membership ? <MembershipBadge status={data.membership.status} size="lg" /> : null}
            </div>
            {data.membership ? (
              <div className="overview-section">
                <span className="overview-label">
                  Membresía #{data.membership.id} · Plan {plan?.name ?? data.membership.planId}
                  {plan ? ` · ${formatMoney(plan.price)}` : ''}
                </span>
                <MembershipPeriod membership={data.membership} />
              </div>
            ) : null}
            <div className="overview-section">
              <span className="overview-label">Accesos recientes</span>
              {data.recentAccesses.length === 0 ? (
                <span className="muted">Ninguno todavía.</span>
              ) : (
                <ul className="mini-accesses">
                  {data.recentAccesses.slice(0, 3).map((attempt) => (
                    <li key={attempt.attemptId}>
                      <AccessBadge result={attempt.result} reason={attempt.reason} />
                      <span>{reasonLabel(attempt.reason)}</span>
                      <span className="muted num">{formatTime(attempt.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!projected && !overview.error ? (
                <span className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Spinner /> Esperando que Consolidated Queries proyecte el intento #{attemptId}…
                </span>
              ) : null}
            </div>
          </div>
        )}
        {slow && !projected && !overview.error ? (
          <SlowNotice title="La vista consolidada está tardando más de lo normal.">
            Consolidated Queries se pone al día leyendo los eventos de Kafka. Si Kafka o ese servicio están caídos (revisa el
            estado del sistema), la ficha se actualizará sola cuando vuelvan, sin perder eventos. El flujo principal ya
            terminó: puedes cerrar el recorrido.
          </SlowNotice>
        ) : null}
      </div>
      {overview.data ? <GraphqlInspector memberId={memberId} raw={overview.data.raw} durationMs={overview.data.durationMs} defaultOpen /> : null}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={onNext} disabled={!canFinish}>
          <Flag aria-hidden="true" />
          {projected ? 'Terminar recorrido' : 'Terminar de todos modos'}
        </button>
      </div>
    </StepShell>
  );
}

const FLOW_CHECKLIST = [
  'Registrar miembro por REST',
  'Publicar MEMBER_REGISTERED y actualizar la vista consolidada',
  'Registrar pago por REST',
  'Publicar PAYMENT_REGISTERED',
  'Activar membresía y publicar MEMBERSHIP_ACTIVATED',
  'Actualizar el estado local en access_db',
  'Solicitar POST /access-attempts',
  'Decidir localmente y publicar ACCESS_GRANTED',
  'Actualizar queries_db y consultar por GraphQL',
];

function DoneStep({
  state,
  events,
  feedError,
  onDenied,
  onRestart,
}: {
  state: TourState;
  events: KafkaEntry[];
  feedError: Error | null;
  onDenied: (attempt: AccessAttempt) => void;
  onRestart: () => void;
}) {
  const expire = useExpireMembership();
  const attempt = useAccessAttempt();
  const [phase, setPhase] = useState<'idle' | 'expiring' | 'waiting' | 'trying'>('idle');
  const [error, setError] = useState<unknown>(null);
  const [skippedWait, setSkippedWait] = useState(false);
  const denied = state.deniedAttempt;
  const memberId = state.memberId as number;

  const expiredSeen = events.some(
    (entry) => entry.eventType === 'MEMBERSHIP_EXPIRED' && Number(entry.payload?.membershipId) === state.membershipId,
  );

  // Referencias estables: el visor de eventos vuelve a dibujar el paso cada segundo y eso no debe reiniciar
  // el plazo de espera de abajo.
  const latest = useRef({ onDenied, enter: attempt.mutateAsync });
  latest.current = { onDenied, enter: attempt.mutateAsync };

  const attemptEntry = useCallback(async () => {
    setPhase('trying');
    setError(null);
    try {
      let result = await latest.current.enter(memberId);
      if (result.result === 'ACCESS_GRANTED') {
        // Access Control puede no haber consumido aún MEMBERSHIP_EXPIRED: se le da un momento más.
        await sleep(1_200);
        result = await latest.current.enter(memberId);
      }
      latest.current.onDenied(result);
    } catch (cause) {
      setError(cause);
    } finally {
      setPhase('idle');
    }
  }, [memberId]);

  // Cuando el vencimiento ya está en Kafka, se da un momento a Access Control para consumirlo y se intenta
  // entrar. Si el evento no aparece en el visor (Kafka lento o visor caído), se intenta igual tras un plazo.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const timer = setTimeout(
      () => {
        if (!expiredSeen) setSkippedWait(true);
        void attemptEntry();
      },
      expiredSeen ? 700 : EXPIRED_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [phase, expiredSeen, attemptEntry]);

  const tryDenied = async () => {
    if (!state.membershipId) return;
    setError(null);
    setSkippedWait(false);
    setPhase('expiring');
    try {
      await expire.mutateAsync(state.membershipId);
      setPhase('waiting');
    } catch (cause) {
      // Ya no estaba activa (se venció por fuera o la tarea programada se adelantó): se prueba el ingreso igual.
      if (errorCode(cause) === 'MEMBERSHIP_NOT_ACTIVE') {
        setPhase('waiting');
        return;
      }
      setError(cause);
      setPhase('idle');
    }
  };

  const stillGranted = denied?.result === 'ACCESS_GRANTED';

  return (
    <div className="tour-step-panel">
      <header className="tour-panel-head">
        <span className="tour-panel-kicker">Recorrido completo</span>
        <h2 className="tour-panel-title">Así funciona la plataforma de punta a punta</h2>
        <p className="tour-panel-lead">Estos son los nueve pasos del flujo principal del documento, y los acabas de ver ocurrir uno por uno.</p>
      </header>
      <div className="form-body">
        <ol className="flow-done">
          {FLOW_CHECKLIST.map((item) => (
            <li key={item}>
              <Check aria-hidden="true" />
              {item}
            </li>
          ))}
        </ol>

        <div className="contrast-card">
          <div>
            <p className="contrast-title">Prueba el caso contrario</p>
            <p className="muted">
              Vence la membresía: Memberships publica <code>MEMBERSHIP_EXPIRED</code>, Access Control actualiza su estado y el torniquete deja de
              abrir.
            </p>
          </div>
          {denied ? (
            <div className={`tour-result ${stillGranted ? 'is-good' : 'is-bad'}`} role="status">
              {stillGranted ? <ShieldCheck aria-hidden="true" /> : <ShieldX aria-hidden="true" />}
              <div>
                <strong>{stillGranted ? 'Acceso permitido todavía.' : 'Acceso denegado.'}</strong> {reasonLabel(denied.reason)} · intento #
                {denied.attemptId}
                {stillGranted ? (
                  <p className="muted" style={{ marginTop: 4 }}>
                    Access Control aún no consume <code>MEMBERSHIP_EXPIRED</code> de Kafka (consistencia eventual). Vuelve a intentar en unos
                    segundos; si sigue igual, revisa que Kafka esté en línea.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {!denied || stillGranted ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={stillGranted ? () => void attemptEntry() : tryDenied}
              disabled={phase !== 'idle'}
            >
              {phase === 'idle' ? <ShieldX aria-hidden="true" /> : <Spinner />}
              {phase === 'expiring'
                ? 'Venciendo la membresía…'
                : phase === 'waiting'
                  ? 'Esperando MEMBERSHIP_EXPIRED…'
                  : phase === 'trying'
                    ? 'Intentando entrar…'
                    : stillGranted
                      ? 'Intentar entrar de nuevo'
                      : 'Vencer la membresía e intentar entrar'}
            </button>
          ) : null}
          {phase === 'waiting' && feedError ? (
            <p className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Info size={14} aria-hidden="true" />
              El visor de eventos no responde; se intentará el ingreso en unos segundos de todos modos.
            </p>
          ) : null}
          {skippedWait && denied ? (
            <p className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Info size={14} aria-hidden="true" />
              No se vio <code>MEMBERSHIP_EXPIRED</code> en el visor a tiempo; se intentó el ingreso igual.
            </p>
          ) : null}
          {error ? <ErrorNotice error={error} title={describeError(error).code === 'MEMBERSHIP_NOT_FOUND' ? 'La membresía ya no existe' : 'No se pudo completar la prueba'} /> : null}
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          <RotateCcw aria-hidden="true" />
          Hacer otro recorrido
        </button>
        <Link to={`/miembros/${state.memberId}`} className="btn btn-primary">
          Ver la ficha del miembro
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

