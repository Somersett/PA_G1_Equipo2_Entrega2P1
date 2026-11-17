import { useState, type FormEvent } from 'react';
import { useCreatePlan } from '../api/hooks';
import type { Plan } from '../api/types';
import { ErrorNotice, Field, Spinner } from '../components/ui';
import { describeError, errorCode, fieldOf } from '../lib/errors';
import { formatInteger, formatMoney } from '../lib/format';
import { FormFooter, type FormVariant } from './FormFooter';

/** Tope de cordura para el precio: evita un cero de más por error de digitación. */
const MAX_PRICE = 100_000_000;

/** Cómo empiezan los mensajes de validación de Memberships Service para cada campo. */
const SERVICE_FIELDS = {
  name: ['El nombre del plan'],
  days: ['La duración'],
  price: ['El precio'],
};

interface PlanFormProps {
  variant: FormVariant;
  onSuccess: (plan: Plan) => void;
  onCancel?: () => void;
}

const DURATION_PRESETS = [
  { label: '1 mes', days: 30 },
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
  { label: '1 año', days: 365 },
];

export function PlanForm({ variant, onSuccess, onCancel }: PlanFormProps) {
  const [name, setName] = useState('');
  const [days, setDays] = useState('30');
  const [price, setPrice] = useState('');
  const [errors, setErrors] = useState<{ name?: string; days?: string; price?: string }>({});
  const [formError, setFormError] = useState<unknown>(null);
  const mutation = useCreatePlan();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const found: typeof errors = {};
    const trimmed = name.trim();
    if (trimmed.length < 2) found.name = 'Ponle un nombre al plan.';
    else if (trimmed.length > 60) found.name = 'Máximo 60 caracteres.';
    const durationDays = Number(days);
    if (!days || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) found.days = 'Entre 1 y 3650 días.';
    const value = Number(price);
    if (price === '' || !Number.isFinite(value)) found.price = 'Escribe el precio.';
    else if (value > MAX_PRICE) found.price = `Revisa el valor: el máximo es ${formatMoney(MAX_PRICE)}.`;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    try {
      onSuccess(await mutation.mutateAsync({ name: trimmed, durationDays, price: value }));
    } catch (cause) {
      const field = errorCode(cause) === 'PLAN_NAME_TAKEN' ? 'name' : fieldOf(cause, SERVICE_FIELDS);
      if (field) {
        const info = describeError(cause);
        setErrors({ [field]: [info.message ?? info.title, field === 'name' ? info.hint : ''].filter(Boolean).join(' ') });
      } else {
        setFormError(cause);
      }
    }
  };

  return (
    <form className={`form form-${variant}`} onSubmit={submit} noValidate>
      <div className={variant === 'drawer' ? 'drawer-body' : 'form-body'}>
        <div className="form-grid">
          <Field label="Nombre del plan" error={errors.name}>
            <input
              className="input"
              value={name}
              maxLength={60}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder="Semestral"
            />
          </Field>
          <Field label="Duración en días" error={errors.days} hint="La vigencia empieza el día del pago y cuenta ese día.">
            <input
              className="input num"
              inputMode="numeric"
              value={days}
              onChange={(event) => setDays(event.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <div className="preset-row" role="group" aria-label="Duraciones frecuentes">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                className="btn btn-secondary btn-sm"
                aria-pressed={Number(days) === preset.days}
                onClick={() => setDays(String(preset.days))}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Field
            label="Precio"
            error={errors.price}
            hint="En pesos colombianos (COP)"
          >
            <input
              className="input num"
              inputMode="numeric"
              value={price ? formatInteger(Number(price)) : ''}
              onChange={(event) => setPrice(event.target.value.replace(/\D/g, ''))}
              placeholder="450.000"
            />
          </Field>
          {formError ? <ErrorNotice error={formError} title="No se pudo crear el plan" /> : null}
        </div>
      </div>
      <FormFooter variant={variant} onCancel={onCancel}>
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner label="Creando" /> : null}
          Crear plan
        </button>
      </FormFooter>
    </form>
  );
}
