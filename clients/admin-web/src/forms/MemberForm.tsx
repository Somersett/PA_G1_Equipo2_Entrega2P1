import { useState, type FormEvent } from 'react';
import { Shuffle } from 'lucide-react';
import { useCreateMember } from '../api/hooks';
import type { Member } from '../api/types';
import { ErrorNotice, Field, Spinner } from '../components/ui';
import { describeError, errorCode, fieldOf } from '../lib/errors';
import { sampleMember } from '../lib/sample';
import { FormFooter, type FormVariant } from './FormFooter';

interface Values {
  name: string;
  document: string;
  phone: string;
  email: string;
}

type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = { name: '', document: '', phone: '', email: '' };

// Mismas reglas que valida Members Service: el error se ve antes de enviar, junto al campo.
function validate(values: Values): Errors {
  const errors: Errors = {};
  const name = values.name.trim();
  if (name.length < 3) errors.name = 'Escribe el nombre completo.';
  else if (name.length > 100) errors.name = 'Máximo 100 caracteres.';
  const document = values.document.trim();
  if (!document) errors.document = 'El documento es obligatorio.';
  else if (!/^[A-Za-z0-9-]{5,20}$/.test(document)) errors.document = 'Entre 5 y 20 letras o números, sin espacios.';
  const phone = values.phone.trim();
  if (!phone) errors.phone = 'El teléfono es obligatorio.';
  else if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) errors.phone = 'Solo números, espacios o guiones; entre 7 y 20 caracteres.';
  else if (phone.replace(/\D/g, '').length < 7) errors.phone = 'Debe tener al menos 7 dígitos.';
  const email = values.email.trim();
  if (email.length > 120) errors.email = 'Máximo 120 caracteres.';
  else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Revisa el formato, por ejemplo nombre@correo.com.';
  }
  return errors;
}

/** Cómo empiezan los mensajes de validación de Members Service para cada campo. */
const SERVICE_FIELDS: Record<keyof Values, string[]> = {
  document: ['El documento'],
  name: ['El nombre'],
  phone: ['El teléfono'],
  email: ['El correo'],
};

interface MemberFormProps {
  variant: FormVariant;
  onSuccess: (member: Member) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function MemberForm({ variant, onSuccess, onCancel, submitLabel = 'Registrar miembro' }: MemberFormProps) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<unknown>(null);
  const mutation = useCreateMember();

  const set = (field: keyof Values) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const fillSample = () => {
    setValues(sampleMember());
    setErrors({});
    setFormError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    try {
      const member = await mutation.mutateAsync({
        name: values.name.trim(),
        document: values.document.trim(),
        phone: values.phone.trim(),
        email: values.email.trim() || undefined,
      });
      setValues(EMPTY);
      onSuccess(member);
    } catch (error) {
      // El rechazo del servicio se muestra junto al campo que lo causó; lo demás (red, servicio caído), abajo.
      const field = errorCode(error) === 'DOCUMENT_ALREADY_REGISTERED' ? 'document' : fieldOf(error, SERVICE_FIELDS);
      if (field) {
        const info = describeError(error);
        const message = info.code === 'DOCUMENT_ALREADY_REGISTERED' ? `${info.message} ${info.hint}` : (info.message ?? info.title);
        setErrors({ [field]: message } as Errors);
      } else {
        setFormError(error);
      }
    }
  };

  return (
    <form className={`form form-${variant}`} onSubmit={submit} noValidate>
      <div className={variant === 'drawer' ? 'drawer-body' : 'form-body'}>
        <div className="form-grid">
          <div className="form-helper">
            <span className="muted">Todos son obligatorios, salvo el correo.</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={fillSample}>
              <Shuffle aria-hidden="true" />
              Usar datos de ejemplo
            </button>
          </div>
          <Field label="Nombre completo" error={errors.name}>
            <input className="input" value={values.name} onChange={set('name')} autoComplete="off" placeholder="Ana Ruiz Gómez" />
          </Field>
          <div className="form-row">
            <Field label="Documento" error={errors.document} hint="Cédula o documento de identidad">
              <input
                className="input mono"
                value={values.document}
                onChange={set('document')}
                inputMode="numeric"
                autoComplete="off"
                placeholder="1075123456"
              />
            </Field>
            <Field label="Teléfono" error={errors.phone}>
              <input
                className="input"
                value={values.phone}
                onChange={set('phone')}
                inputMode="tel"
                autoComplete="off"
                placeholder="300 123 4567"
              />
            </Field>
          </div>
          <Field label="Correo" optional error={errors.email}>
            <input
              className="input"
              type="email"
              value={values.email}
              onChange={set('email')}
              autoComplete="off"
              placeholder="ana@correo.com"
            />
          </Field>
          {formError ? <ErrorNotice error={formError} title="No se pudo registrar el miembro" /> : null}
        </div>
      </div>
      <FormFooter variant={variant} onCancel={onCancel}>
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner label="Registrando" /> : null}
          {submitLabel}
        </button>
      </FormFooter>
    </form>
  );
}
