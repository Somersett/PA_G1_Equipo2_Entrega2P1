import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, RotateCw, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { keys, useSystemStatus } from '../api/hooks';
import { diagnose, IMPACT } from '../lib/health';
import { Spinner } from './ui';

/**
 * Aviso discreto en la parte superior cuando algo de la plataforma no responde: qué falla, qué parte del
 * panel se ve afectada y qué hacer. Aparece solo con problemas, se puede descartar (vuelve si el problema
 * cambia) y, cuando todo se recupera, avisa con un toast y refresca los datos sin recargar la página.
 */
export function ConnectionBanner() {
  const status = useSystemStatus();
  const queryClient = useQueryClient();
  const problem = diagnose(status.data, status.error);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const hadProblem = useRef(false);

  const problemKey = problem?.key ?? null;
  const recovered = !problem && Boolean(status.data?.ready) && !status.error;

  useEffect(() => {
    if (problemKey) {
      hadProblem.current = true;
      return;
    }
    if (recovered && hadProblem.current) {
      hadProblem.current = false;
      setDismissed(null);
      toast.success('El sistema volvió a estar en línea', {
        description: 'Todos los componentes responden. Los datos se actualizaron.',
        duration: 5_000,
      });
      // Lo que falló mientras tanto se vuelve a consultar de inmediato.
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== keys.status[0] });
    }
  }, [problemKey, recovered, queryClient]);

  if (!problem || dismissed === problem.key) return null;

  const Icon = problem.tone === 'bad' ? CircleAlert : TriangleAlert;
  return (
    <div className={`conn-banner is-${problem.tone}`} role="status" aria-live="polite">
      <Icon className="conn-banner-icon" aria-hidden="true" />
      <div className="conn-banner-body">
        <p className="conn-banner-title">{problem.title}</p>
        {problem.down.length > 0 ? (
          <ul className="conn-banner-list">
            {problem.down.map((component) => (
              <li key={component.id}>
                {problem.down.length > 1 ? <strong>{component.name}: </strong> : null}
                {IMPACT[component.id] ?? component.role}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="conn-banner-hint">{problem.hint}</p>
      </div>
      <div className="conn-banner-actions">
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => status.refetch()}
          disabled={status.isFetching}
        >
          {status.isFetching ? <Spinner label="Comprobando" /> : <RotateCw aria-hidden="true" />}
          Comprobar ahora
        </button>
        {status.data ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => window.dispatchEvent(new Event('fetgym:show-status'))}
          >
            Ver detalle
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setDismissed(problem.key)}
          aria-label="Ocultar aviso"
          title="Ocultar aviso (vuelve si el problema cambia)"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
