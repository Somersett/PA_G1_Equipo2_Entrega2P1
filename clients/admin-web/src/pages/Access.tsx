import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DoorOpen, RotateCcw, ScanLine, ShieldCheck, ShieldX } from 'lucide-react';
import { useAccessAttempt, useAccessAttempts, useLookups } from '../api/hooks';
import type { AccessAttempt, Member } from '../api/types';
import { useDrawers } from '../components/DrawerHost';
import { MemberPicker } from '../components/MemberPicker';
import {
  AccessBadge,
  Avatar,
  EmptyState,
  ErrorNotice,
  ErrorState,
  MembershipBadge,
  NoMembershipBadge,
  PageHeader,
  Spinner,
} from '../components/ui';
import { formatTime } from '../lib/format';
import { REASON_DETAIL, reasonLabel } from '../lib/labels';

type Filter = 'all' | 'ACCESS_GRANTED' | 'ACCESS_DENIED';

/** El contrato GraphQL usa Int (32 bits): un número mayor no es un miembro posible. */
const MAX_MEMBER_ID = 2_147_483_647;
const isMemberId = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= MAX_MEMBER_ID;

export function Access() {
  const [params, setParams] = useSearchParams();
  const { open } = useDrawers();
  const { members, memberById, currentMembership } = useLookups();
  const attempts = useAccessAttempts(40);
  const mutation = useAccessAttempt();
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const fromUrl = Number(params.get('miembro'));
    return isMemberId(fromUrl) ? fromUrl : null;
  });
  const [result, setResult] = useState<AccessAttempt | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [invalidId, setInvalidId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const validateButton = useRef<HTMLButtonElement>(null);

  const selected: Member | undefined = selectedId ? memberById.get(selectedId) : undefined;
  const membership = selectedId ? currentMembership.get(selectedId) : undefined;

  useEffect(() => {
    if (selectedId) validateButton.current?.focus();
  }, [selectedId]);

  const choose = (id: number) => {
    setResult(null);
    setError(null);
    if (!isMemberId(id)) {
      setInvalidId(`“${id}” no es un número de miembro válido. Usa un número entre 1 y ${MAX_MEMBER_ID.toLocaleString('es-CO')}.`);
      return;
    }
    setInvalidId(null);
    setSelectedId(id);
    setParams({ miembro: String(id) }, { replace: true });
  };

  const validate = async () => {
    if (!selectedId) return;
    setError(null);
    setResult(null);
    try {
      setResult(await mutation.mutateAsync(selectedId));
    } catch (cause) {
      setError(cause);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setInvalidId(null);
    setSelectedId(null);
    setParams({}, { replace: true });
  };

  const membersFailed = Boolean(members.error) && members.data === undefined;

  const resultMember = result ? memberById.get(result.memberId) : undefined;
  const granted = result?.result === 'ACCESS_GRANTED';
  const list = (attempts.data ?? []).filter((attempt) => filter === 'all' || attempt.result === filter);

  let followUp = null;
  if (result && !granted) {
    if (membership?.status === 'PENDING') {
      followUp = (
        <button type="button" className="btn btn-sm kiosk-action" onClick={() => open({ kind: 'payment', membershipId: membership.id })}>
          Registrar el pago pendiente
        </button>
      );
    } else if (resultMember) {
      followUp = (
        <button type="button" className="btn btn-sm kiosk-action" onClick={() => open({ kind: 'membership', memberId: resultMember.id })}>
          {membership?.status === 'EXPIRED' ? 'Renovar membresía' : 'Asignar un plan'}
        </button>
      );
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Control de acceso"
        description="Simula el torniquete de la entrada. Access Control decide con su propio estado local, sin consultar a otros servicios."
      />

      <div className="grid-main-aside">
        <section className="card kiosk" aria-labelledby="kiosk-title">
          <div
            className={`kiosk-display${result ? (granted ? ' is-granted' : ' is-denied') : ''}${mutation.isPending ? ' is-pending' : ''}`}
            role="status"
            aria-live="assertive"
          >
            <div className="kiosk-topline">
              <span id="kiosk-title" className="kiosk-place">
                <DoorOpen aria-hidden="true" />
                Torniquete · Entrada principal
              </span>
              <span className="kiosk-endpoint">POST /access-attempts</span>
            </div>

            {mutation.isPending ? (
              <div className="kiosk-state">
                <span className="kiosk-icon">
                  <Spinner />
                </span>
                <p className="kiosk-headline">Validando…</p>
              </div>
            ) : result ? (
              <div className="kiosk-state">
                <span className="kiosk-icon">{granted ? <ShieldCheck aria-hidden="true" /> : <ShieldX aria-hidden="true" />}</span>
                <p className="kiosk-headline">{granted ? 'Acceso permitido' : 'Acceso denegado'}</p>
                <p className="kiosk-name">{resultMember?.name ?? `Miembro #${result.memberId}`}</p>
                <p className="kiosk-reason">
                  {reasonLabel(result.reason)}
                  {REASON_DETAIL[result.reason] && !granted ? ` · ${REASON_DETAIL[result.reason]}` : ''}
                </p>
                <p className="kiosk-meta">
                  Intento #{result.attemptId} · {formatTime(result.occurredAt)} · publicado como <code>{result.result}</code>
                </p>
                {followUp}
              </div>
            ) : (
              <div className="kiosk-state">
                <span className="kiosk-icon kiosk-icon-idle">
                  <ScanLine aria-hidden="true" />
                </span>
                <p className="kiosk-headline">Listo para validar</p>
                <p className="kiosk-reason">Elige quién quiere entrar y presiona “Validar ingreso”.</p>
              </div>
            )}
          </div>

          <div className="kiosk-controls">
            {selected ? (
              <div className="selected-member">
                <Avatar name={selected.name} id={selected.id} />
                <div className="cell-stack">
                  <span className="cell-primary">{selected.name}</span>
                  <span className="cell-secondary">
                    #{selected.id} · Doc. {selected.document}
                  </span>
                </div>
                <span className="selected-member-aside">
                  {membership ? <MembershipBadge status={membership.status} /> : <NoMembershipBadge />}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                  Cambiar
                </button>
              </div>
            ) : (
              <MemberPicker
                label="Buscar miembro para validar su ingreso"
                members={members.data ?? []}
                onSelect={(member) => choose(member.id)}
                onSubmitId={choose}
                aside={(option) => {
                  const current = currentMembership.get(option.id);
                  return current ? <MembershipBadge status={current.status} /> : <NoMembershipBadge />;
                }}
                autoFocus
                size="lg"
              />
            )}
            {!selected && membersFailed ? (
              <p className="field-hint">
                No se pudo cargar la lista de miembros, pero el torniquete no la necesita: escribe el número del miembro y
                presiona Enter.
              </p>
            ) : null}
            {selectedId && !selected && members.isSuccess ? (
              <p className="field-hint">El miembro #{selectedId} no está en la lista de Members. Igual puedes intentar el ingreso.</p>
            ) : null}
            {invalidId ? (
              <p className="field-error" role="alert">
                {invalidId}
              </p>
            ) : null}
            {error ? <ErrorNotice error={error} title="No se pudo validar el ingreso" onRetry={validate} retrying={mutation.isPending} /> : null}
            <div className="kiosk-buttons">
              {result ? (
                <button type="button" className="btn btn-secondary btn-lg" onClick={reset}>
                  <RotateCcw aria-hidden="true" />
                  Otra persona
                </button>
              ) : null}
              <button
                ref={validateButton}
                type="button"
                className="btn btn-primary btn-lg kiosk-validate"
                disabled={!selectedId || mutation.isPending}
                onClick={validate}
              >
                <ShieldCheck aria-hidden="true" />
                {result ? 'Validar de nuevo' : 'Validar ingreso'}
              </button>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="attempts-title">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="attempts-title">
                Intentos recientes
              </h2>
              <p className="card-subtitle">Todos quedan registrados, permitidos o no</p>
            </div>
          </div>
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Filtrar intentos">
              {(
                [
                  ['all', 'Todos'],
                  ['ACCESS_GRANTED', 'Permitidos'],
                  ['ACCESS_DENIED', 'Denegados'],
                ] as [Filter, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {attempts.error && attempts.data === undefined ? (
            <ErrorState
              error={attempts.error}
              title="No se pudieron cargar los intentos"
              onRetry={() => attempts.refetch()}
              retrying={attempts.isFetching}
            />
          ) : attempts.data === undefined ? (
            <div className="card-body">
              <span className="skeleton" style={{ height: 120 }} aria-label="Cargando intentos" />
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={DoorOpen} title="Sin intentos" text="Valida un ingreso y aparecerá aquí al instante." />
          ) : (
            <ul className="row-list attempts-list">
              {list.map((attempt) => {
                const member = memberById.get(attempt.memberId);
                return (
                  <li key={attempt.attemptId} className={`row-item${result?.attemptId === attempt.attemptId ? ' is-highlighted' : ''}`}>
                    <Avatar name={member?.name ?? '?'} id={attempt.memberId} />
                    <span className="cell-stack grow">
                      <Link to={`/miembros/${attempt.memberId}`} className="cell-primary link-quiet">
                        {member?.name ?? `Miembro #${attempt.memberId}`}
                      </Link>
                      <span className="cell-secondary">{reasonLabel(attempt.reason)}</span>
                    </span>
                    <span className="row-aside">
                      <AccessBadge result={attempt.result} reason={attempt.reason} />
                      <span className="cell-secondary" title={new Date(attempt.occurredAt).toLocaleString('es-CO')}>
                        {formatTime(attempt.occurredAt)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
