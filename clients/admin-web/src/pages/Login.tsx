import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/auth';
import { BrandMark } from '../components/Layout';
import { ErrorNotice, Field, Spinner } from '../components/ui';

export function Login() {
  const { login, notice } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setMissing(!username.trim() ? 'Escribe el usuario.' : 'Escribe la contraseña.');
      return;
    }
    setMissing(null);
    setPending(true);
    try {
      await login(username, password);
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  };

  const watchCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="login">
      <section className="login-brand" aria-label="Presentación">
        <div className="brand">
          <BrandMark size={40} />
          <span>
            <span className="brand-name">FET Gym</span>
            <br />
            <span className="brand-sub">Plataforma de membresías y control de acceso</span>
          </span>
        </div>
        <div className="login-hero">
          <h1>
            Del registro al torniquete, <em>en un solo panel.</em>
          </h1>
          <p>Registra miembros, asigna planes, recibe pagos y valida cada ingreso. Mira en tiempo real cómo viaja cada evento entre los servicios.</p>
          <ol className="login-flow">
            <li>
              <span>
                <strong>Registra al miembro</strong> y asígnale un plan.
              </span>
            </li>
            <li>
              <span>
                <strong>Registra el pago:</strong> la membresía se activa sola por Kafka.
              </span>
            </li>
            <li>
              <span>
                <strong>Valida el ingreso</strong> con el estado local de Access Control.
              </span>
            </li>
            <li>
              <span>
                <strong>Consulta la ficha consolidada</strong> por GraphQL.
              </span>
            </li>
          </ol>
        </div>
        <p className="login-foot">Programación Avanzada · Grupo 2 – Equipo 2</p>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit} noValidate>
          <div>
            <h2>Ingresar</h2>
            <p className="lede">Usa la credencial de administrador del sistema.</p>
          </div>

          {notice ? (
            <div className="notice notice-warn" role="status">
              <CircleAlert aria-hidden="true" />
              <span>{notice}</span>
            </div>
          ) : null}

          <div className="form-grid">
            <Field label="Usuario">
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                spellCheck={false}
              />
            </Field>
            <div className="field">
              <label className="field-label" htmlFor="login-password">
                Contraseña
              </label>
              <div className="input-group password-group">
                <input
                  id="login-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={watchCapsLock}
                  onKeyUp={watchCapsLock}
                  onBlur={() => setCapsLock(false)}
                  autoComplete="current-password"
                  aria-describedby="login-password-hint"
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm reveal"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
              {capsLock ? (
                <span className="field-error" role="status">
                  <CircleAlert size={13} aria-hidden="true" />
                  Bloq Mayús está activado.
                </span>
              ) : null}
              <span className="field-hint" id="login-password-hint">
                Está en <code>infrastructure/.env</code>, en la línea <code>GATEWAY_CLIENT_PASSWORD</code>.
              </span>
            </div>
          </div>

          {missing ? (
            <div className="notice notice-warn" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{missing}</span>
            </div>
          ) : null}
          {error ? <ErrorNotice error={error} title="No se pudo ingresar" /> : null}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={pending}>
            {pending ? <Spinner label="Verificando" /> : null}
            {pending ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </div>
  );
}
