import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarX } from 'lucide-react';
import { toast } from 'sonner';
import { keys, useExpireMembership } from '../api/hooks';
import type { Membership } from '../api/types';
import { errorCode } from '../lib/errors';
import { Drawer } from './Drawer';
import { ErrorNotice, Spinner } from './ui';

/**
 * Acción de demostración: adelanta el vencimiento (RF-07) sin esperar a que termine la vigencia.
 * Produce el mismo MEMBERSHIP_EXPIRED que la tarea programada.
 */
export function ExpireDialog({ membership, memberName, onClose }: { membership: Membership; memberName: string; onClose: () => void }) {
  const mutation = useExpireMembership();
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);

  const confirm = async () => {
    setError(null);
    try {
      await mutation.mutateAsync(membership.id);
      toast.success(`Membresía #${membership.id} vencida`, {
        description: 'Access Control ya no dejará entrar a este miembro. Pruébalo en el torniquete.',
      });
      onClose();
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'MEMBERSHIP_NOT_ACTIVE' || code === 'MEMBERSHIP_NOT_FOUND') {
        // La pantalla mostraba un estado viejo: se refresca y se cierra, no hay nada que vencer.
        queryClient.invalidateQueries({ queryKey: keys.memberships });
        toast.info(`La membresía #${membership.id} ya no está activa`, {
          description: 'Se venció o cambió mientras tanto. La lista ya se actualizó.',
        });
        onClose();
        return;
      }
      setError(cause);
    }
  };

  return (
    <Drawer
      title="Forzar vencimiento"
      description="Acción de demostración. En la operación normal, una tarea programada vence la membresía al terminar su vigencia."
      onClose={onClose}
    >
      <div className="drawer-body">
        <div className="stack">
          <div className="notice notice-warn">
            <CalendarX aria-hidden="true" />
            <span>
              La membresía <strong>#{membership.id}</strong> de <strong>{memberName}</strong> quedará <strong>vencida hoy</strong>.
              Memberships publicará <code>MEMBERSHIP_EXPIRED</code> y, al recibirlo, Access Control negará el ingreso.
            </span>
          </div>
          <p className="muted">No se puede deshacer. Para que vuelva a entrar, asígnale un plan nuevo y registra el pago.</p>
          {error ? <ErrorNotice error={error} title="No se pudo vencer la membresía" /> : null}
        </div>
      </div>
      <div className="drawer-footer">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn btn-danger" onClick={confirm} disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner label="Venciendo" /> : <CalendarX aria-hidden="true" />}
          Vencer membresía
        </button>
      </div>
    </Drawer>
  );
}
