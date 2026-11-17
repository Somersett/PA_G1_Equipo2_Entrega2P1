import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Info, Receipt } from 'lucide-react';
import { keys, useCreatePayment, useLookups } from '../api/hooks';
import type { Membership, Payment } from '../api/types';
import { EmptyState, ErrorNotice, ErrorState, Field, Spinner } from '../components/ui';
import { describeError, errorCode } from '../lib/errors';
import { formatDateTime, formatInteger, formatMoney, plural } from '../lib/format';
import { FormFooter, type FormVariant } from './FormFooter';

interface PaymentFormProps {
  variant: FormVariant;
  membershipId?: number;
  lockMembership?: boolean;
  onSuccess: (payment: Payment, membership: Membership) => void;
  onCancel?: () => void;
}

/** Tope de cordura para el monto: evita un cero de más por error de digitación. */
const MAX_AMOUNT = 100_000_000;

/** Códigos que indican que la lista de membresías en pantalla ya no es la real. */
const STALE_MEMBERSHIP = new Set(['MEMBERSHIP_NOT_PENDING', 'PAYMENT_ALREADY_REGISTERED', 'MEMBERSHIP_NOT_FOUND']);

function toLocalInput(date: Date) {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  const offset = copy.getTimezoneOffset() * 60_000;
  return new Date(copy.getTime() - offset).toISOString().slice(0, 16);
}

const nowLocalInput = () => toLocalInput(new Date());

/** Inicio del minuto en que se creó la membresía: el campo de fecha no tiene segundos. */
function createdMinute(membership: Membership) {
  const created = new Date(membership.createdAt);
  created.setSeconds(0, 0);
  return created;
}

export function PaymentForm({ variant, membershipId, lockMembership, onSuccess, onCancel }: PaymentFormProps) {
  const queryClient = useQueryClient();
  const { memberships, memberById, planById, membershipById } = useLookups();
  const [selected, setSelected] = useState<number | null>(membershipId ?? null);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(nowLocalInput);
  const [errors, setErrors] = useState<{ amount?: string; paidAt?: string }>({});
  const [formError, setFormError] = useState<unknown>(null);
  const [replaced, setReplaced] = useState<number | null>(null);
  const mutation = useCreatePayment();

  const pending = useMemo(
    () => (memberships.data ?? []).filter((membership) => membership.status === 'PENDING'),
    [memberships.data],
  );

  const options = lockMembership && selected ? pending.filter((m) => m.id === selected) : pending;
  const membership = selected ? membershipById.get(selected) : undefined;
  const plan = membership ? planById.get(membership.planId) : undefined;

  useEffect(() => {
    if (selected === null && pending.length > 0) setSelected(pending[0].id);
  }, [pending, selected]);

  // La membresía pedida ya no espera pago (otra persona la pagó o venció): se ofrece la siguiente pendiente.
  // Mientras la lista se refresca no se decide nada: una membresía recién creada puede no haber llegado aún.
  useEffect(() => {
    if (lockMembership || selected === null || memberships.data === undefined || memberships.isFetching) return;
    if (!pending.some((option) => option.id === selected)) {
      setReplaced(selected);
      setSelected(pending[0]?.id ?? null);
    }
  }, [lockMembership, selected, pending, memberships.data, memberships.isFetching]);

  // El monto parte del precio del plan elegido.
  useEffect(() => {
    if (plan) setAmount(String(plan.price));
  }, [plan]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const value = Number(amount);
    const found: typeof errors = {};
    if (!amount || !Number.isFinite(value) || value <= 0) found.amount = 'Escribe el monto pagado.';
    else if (plan && value < plan.price) found.amount = `Debe cubrir el valor del plan (${formatMoney(plan.price)}).`;
    else if (value > MAX_AMOUNT) found.amount = `Revisa el valor: el máximo es ${formatMoney(MAX_AMOUNT)}.`;
    const paidDate = new Date(paidAt);
    if (!paidAt || Number.isNaN(paidDate.getTime())) found.paidAt = 'Indica la fecha y hora del pago.';
    else if (paidDate.getTime() > Date.now() + 60_000) found.paidAt = 'La fecha no puede estar en el futuro.';
    else if (membership && paidDate.getTime() < createdMinute(membership).getTime()) {
      // Un pago anterior a la membresía la activaría con una vigencia que ya pudo terminar.
      found.paidAt = `No puede ser anterior a la creación de la membresía (${formatDateTime(membership.createdAt)}).`;
    }
    setErrors(found);
    if (Object.keys(found).length > 0 || !selected || !membership) return;
    try {
      const payment = await mutation.mutateAsync({ membershipId: selected, amount: value, paidAt: paidDate.toISOString() });
      onSuccess(payment, membership);
    } catch (cause) {
      const code = errorCode(cause);
      const info = describeError(cause);
      if (code === 'AMOUNT_BELOW_PLAN_PRICE') setErrors({ amount: info.message ?? info.title });
      else if (code === 'PAYMENT_IN_FUTURE') setErrors({ paidAt: info.message ?? info.title });
      else setFormError(cause);
      if (code && STALE_MEMBERSHIP.has(code)) queryClient.invalidateQueries({ queryKey: keys.memberships });
    }
  };

  const body = variant === 'drawer' ? 'drawer-body' : 'form-body';

  if (memberships.error && memberships.data === undefined) {
    return (
      <div className={body}>
        <ErrorState
          error={memberships.error}
          title="No se pudieron cargar las membresías"
          onRetry={() => memberships.refetch()}
          retrying={memberships.isFetching}
        />
      </div>
    );
  }

  // Recién creada, la membresía puede no estar aún en la lista: se espera al refresco antes de decir que no hay.
  const waitingForList = memberships.isLoading || (memberships.isFetching && membershipId !== undefined && !membership);
  if (waitingForList) {
    return (
      <div className={body}>
        <span className="skeleton" style={{ height: 72 }} />
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className={body}>
        <EmptyState
          icon={Receipt}
          title="No hay membresías esperando pago"
          text={
            replaced
              ? `La membresía #${replaced} ya no está pendiente: se pagó o venció. Revisa su estado en Membresías.`
              : 'Los pagos se registran sobre una membresía pendiente. Primero asigna un plan a un miembro.'
          }
        />
      </div>
    );
  }

  const minPaidAt = membership ? toLocalInput(createdMinute(membership)) : undefined;

  return (
    <form className={`form form-${variant}`} onSubmit={submit} noValidate>
      <div className={body}>
        <div className="form-grid">
          {replaced ? (
            <div className="notice notice-warn" role="status">
              <Info aria-hidden="true" />
              <span>
                <strong>La membresía #{replaced} ya no espera pago.</strong> Se pagó o venció mientras tanto; elige otra.
              </span>
            </div>
          ) : null}

          <fieldset className="fieldset">
            <legend className="field-label">Membresía a pagar</legend>
            <div className="choice-grid choice-scroll">
              {options.map((option) => {
                const owner = memberById.get(option.memberId);
                const optionPlan = planById.get(option.planId);
                return (
                  <label key={option.id} className="choice">
                    <input
                      type="radio"
                      name="membership"
                      value={option.id}
                      checked={selected === option.id}
                      onChange={() => {
                        setSelected(option.id);
                        setErrors({});
                      }}
                    />
                    <span className="choice-mark" aria-hidden="true" />
                    <span className="cell-stack">
                      <span className="choice-title">{owner?.name ?? `Miembro #${option.memberId}`}</span>
                      <span className="choice-meta">
                        Membresía #{option.id} · Plan {optionPlan?.name ?? `#${option.planId}`}
                        {optionPlan ? ` · ${plural(optionPlan.durationDays, 'día')}` : ''}
                      </span>
                    </span>
                    <span className="choice-aside">{optionPlan ? formatMoney(optionPlan.price) : null}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="form-row">
            <Field
              label="Monto pagado"
              error={errors.amount}
              hint={plan ? `Valor del plan ${plan.name}: ${formatMoney(plan.price)}` : 'En pesos colombianos'}
            >
              <input
                className="input num"
                inputMode="numeric"
                value={amount ? formatInteger(Number(amount)) : ''}
                onChange={(event) => {
                  setAmount(event.target.value.replace(/\D/g, '').slice(0, 12));
                  setErrors((current) => ({ ...current, amount: undefined }));
                }}
                placeholder="90.000"
              />
            </Field>
            <Field label="Fecha y hora del pago" error={errors.paidAt}>
              <input
                className="input"
                type="datetime-local"
                value={paidAt}
                min={minPaidAt}
                max={nowLocalInput()}
                onChange={(event) => {
                  setPaidAt(event.target.value);
                  setErrors((current) => ({ ...current, paidAt: undefined }));
                }}
              />
            </Field>
          </div>

          <p className="field-hint">
            Al registrar el pago, Payments publica <code>PAYMENT_REGISTERED</code> y Memberships activa la membresía en
            segundos.
          </p>

          {formError ? <ErrorNotice error={formError} title="No se pudo registrar el pago" /> : null}
        </div>
      </div>
      <FormFooter variant={variant} onCancel={onCancel}>
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending || !selected}>
          {mutation.isPending ? <Spinner label="Registrando" /> : null}
          Registrar pago
        </button>
      </FormFooter>
    </form>
  );
}
