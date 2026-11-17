import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Info, Plus } from 'lucide-react';
import { keys, useCreateMembership, useLookups } from '../api/hooks';
import type { Member, Membership } from '../api/types';
import { MemberPicker } from '../components/MemberPicker';
import { Avatar, ErrorNotice, MembershipBadge, NoMembershipBadge, Spinner } from '../components/ui';
import { errorCode } from '../lib/errors';
import { formatMoney, plural } from '../lib/format';
import { FormFooter, type FormVariant } from './FormFooter';

interface MembershipFormProps {
  variant: FormVariant;
  memberId?: number;
  /** Bloquea el miembro (p. ej. en el recorrido guiado). */
  lockMember?: boolean;
  onSuccess: (membership: Membership) => void;
  onCancel?: () => void;
  onPayPending?: (membership: Membership) => void;
  /** Si el miembro ya tiene una membresía activa, permite seguir con ella (recorrido guiado). */
  onUseActive?: (membership: Membership) => void;
  /** Abre la creación de un plan cuando el catálogo está vacío. */
  onCreatePlan?: () => void;
}

export function MembershipForm({
  variant,
  memberId,
  lockMember,
  onSuccess,
  onCancel,
  onPayPending,
  onUseActive,
  onCreatePlan,
}: MembershipFormProps) {
  const queryClient = useQueryClient();
  const { members, plans, memberById, currentMembership } = useLookups();
  const [selectedMember, setSelectedMember] = useState<number | null>(memberId ?? null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [missingChoice, setMissingChoice] = useState<string | null>(null);
  const mutation = useCreateMembership();

  // Se preselecciona el primer plan; si el elegido desaparece del catálogo, se vuelve a elegir.
  useEffect(() => {
    const list = plans.data ?? [];
    if (list.length > 0 && (planId === null || !list.some((plan) => plan.id === planId))) setPlanId(list[0].id);
  }, [plans.data, planId]);

  const member: Member | undefined = selectedMember ? memberById.get(selectedMember) : undefined;
  const current = selectedMember ? currentMembership.get(selectedMember) : undefined;
  const blocked = current && (current.status === 'PENDING' || current.status === 'ACTIVE') ? current : null;
  // La lista ya llegó y el miembro no está: no se queda cargando para siempre.
  const memberMissing = Boolean(selectedMember) && !member && members.data !== undefined && !members.isFetching;
  const plansFailed = Boolean(plans.error) && plans.data === undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMissingChoice(null);
    if (!selectedMember) {
      setMissingChoice('Elige un miembro.');
      return;
    }
    if (!planId) {
      setMissingChoice('Elige un plan.');
      return;
    }
    try {
      onSuccess(await mutation.mutateAsync({ memberId: selectedMember, planId }));
    } catch (cause) {
      setError(cause);
      // Si el rechazo se debe a datos desactualizados en pantalla, se refrescan para que el aviso sea exacto.
      const code = errorCode(cause);
      if (code === 'MEMBERSHIP_ALREADY_OPEN') queryClient.invalidateQueries({ queryKey: keys.memberships });
      if (code === 'MEMBER_NOT_FOUND') queryClient.invalidateQueries({ queryKey: keys.members });
      if (code === 'PLAN_NOT_FOUND') queryClient.invalidateQueries({ queryKey: keys.plans });
    }
  };

  return (
    <form className={`form form-${variant}`} onSubmit={submit} noValidate>
      <div className={variant === 'drawer' ? 'drawer-body' : 'form-body'}>
        <div className="form-grid">
          <fieldset className="fieldset">
            <legend className="field-label">Miembro</legend>
            {member ? (
              <div className="selected-member">
                <Avatar name={member.name} id={member.id} />
                <div className="cell-stack">
                  <span className="cell-primary">{member.name}</span>
                  <span className="cell-secondary">
                    #{member.id} · Doc. {member.document}
                  </span>
                </div>
                <span className="selected-member-aside">
                  {current ? <MembershipBadge status={current.status} /> : <NoMembershipBadge />}
                </span>
                {!lockMember ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedMember(null)}>
                    Cambiar
                  </button>
                ) : null}
              </div>
            ) : selectedMember && members.error && members.data === undefined ? (
              <ErrorNotice error={members.error} title="No se pudo cargar el miembro" onRetry={() => members.refetch()} />
            ) : memberMissing ? (
              <div className="notice notice-warn" role="alert">
                <CircleAlert aria-hidden="true" />
                <div className="notice-body">
                  <span>
                    <strong>No se encontró al miembro #{selectedMember}.</strong> Puede que los datos se hayan reiniciado.
                  </span>
                  {!lockMember ? (
                    <button type="button" className="btn btn-sm btn-secondary" style={{ width: 'fit-content' }} onClick={() => setSelectedMember(null)}>
                      Elegir otro miembro
                    </button>
                  ) : null}
                </div>
              </div>
            ) : selectedMember ? (
              // Recién registrado, el miembro puede no estar aún en la lista.
              <span className="skeleton" style={{ height: 58 }} aria-label="Cargando miembro" />
            ) : members.error && members.data === undefined ? (
              <ErrorNotice error={members.error} title="No se pudo cargar la lista de miembros" onRetry={() => members.refetch()} />
            ) : (
              <MemberPicker
                label="Buscar miembro"
                members={members.data ?? []}
                onSelect={(picked) => setSelectedMember(picked.id)}
                aside={(option) => {
                  const membership = currentMembership.get(option.id);
                  return membership ? <MembershipBadge status={membership.status} /> : <NoMembershipBadge />;
                }}
                autoFocus
              />
            )}
          </fieldset>

          {blocked ? (
            <div className="notice notice-warn" role="status">
              <Info aria-hidden="true" />
              <div className="stack" style={{ gap: 8 }}>
                <span>
                  <strong>
                    {blocked.status === 'PENDING'
                      ? `Ya tiene la membresía #${blocked.id} pendiente de pago.`
                      : `Ya tiene la membresía #${blocked.id} activa.`}
                  </strong>{' '}
                  Un miembro solo puede tener una membresía abierta a la vez.
                </span>
                {blocked.status === 'PENDING' && onPayPending ? (
                  <button type="button" className="btn btn-sm btn-secondary" style={{ width: 'fit-content' }} onClick={() => onPayPending(blocked)}>
                    Registrar el pago de esa membresía
                  </button>
                ) : null}
                {blocked.status === 'ACTIVE' && onUseActive ? (
                  <button type="button" className="btn btn-sm btn-secondary" style={{ width: 'fit-content' }} onClick={() => onUseActive(blocked)}>
                    Seguir con esa membresía
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <fieldset className="fieldset" disabled={Boolean(blocked)}>
            <legend className="field-label">Plan</legend>
            {plans.isLoading ? (
              <span className="skeleton" style={{ height: 56 }} />
            ) : plansFailed ? (
              <ErrorNotice error={plans.error} title="No se pudieron cargar los planes" onRetry={() => plans.refetch()} retrying={plans.isFetching} />
            ) : (plans.data ?? []).length === 0 ? (
              <div className="notice" role="status">
                <Info aria-hidden="true" />
                <div className="notice-body">
                  <span>
                    <strong>No hay planes en el catálogo.</strong> Crea al menos uno para poder asignarlo.
                  </span>
                  {onCreatePlan ? (
                    <button type="button" className="btn btn-sm btn-secondary" style={{ width: 'fit-content' }} onClick={onCreatePlan}>
                      <Plus aria-hidden="true" />
                      Crear un plan
                    </button>
                  ) : (
                    <span className="notice-hint">Hazlo en la sección Planes.</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="choice-grid">
                {(plans.data ?? []).map((plan) => (
                  <label key={plan.id} className="choice">
                    <input
                      type="radio"
                      name="plan"
                      value={plan.id}
                      checked={planId === plan.id}
                      onChange={() => setPlanId(plan.id)}
                    />
                    <span className="choice-mark" aria-hidden="true" />
                    <span className="cell-stack">
                      <span className="choice-title">{plan.name}</span>
                      <span className="choice-meta">{plural(plan.durationDays, 'día')} de acceso</span>
                    </span>
                    <span className="choice-aside">{formatMoney(plan.price)}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <p className="field-hint">
            La membresía se crea <strong>pendiente de pago</strong>. Se activa sola cuando registres el pago.
          </p>

          {missingChoice ? (
            <div className="notice notice-warn" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{missingChoice}</span>
            </div>
          ) : null}
          {error ? <ErrorNotice error={error} title="No se pudo crear la membresía" /> : null}
        </div>
      </div>
      <FormFooter variant={variant} onCancel={onCancel}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={mutation.isPending || Boolean(blocked) || !selectedMember || memberMissing || !planId}
        >
          {mutation.isPending ? <Spinner label="Creando" /> : null}
          Crear membresía
        </button>
      </FormFooter>
    </form>
  );
}
