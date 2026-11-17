import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { keys, waitForMembershipStatus } from '../api/hooks';
import { MemberForm } from '../forms/MemberForm';
import { MembershipForm } from '../forms/MembershipForm';
import { PaymentForm } from '../forms/PaymentForm';
import { PlanForm } from '../forms/PlanForm';
import { describeError } from '../lib/errors';
import { formatDate } from '../lib/format';
import { Drawer } from './Drawer';

// Los formularios de alta viven en paneles laterales que cualquier pantalla puede abrir. Al terminar,
// cada uno propone el siguiente paso del flujo: miembro -> plan -> pago -> ingreso.

type DrawerRequest =
  | { kind: 'member' }
  | { kind: 'membership'; memberId?: number }
  | { kind: 'payment'; membershipId?: number }
  | { kind: 'plan' };

interface DrawerApi {
  open: (request: DrawerRequest) => void;
}

const DrawerContext = createContext<DrawerApi | null>(null);

export function useDrawers() {
  const value = useContext(DrawerContext);
  if (!value) throw new Error('useDrawers debe usarse dentro de DrawerHost');
  return value;
}

export function DrawerHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DrawerRequest | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const close = useCallback(() => setCurrent(null), []);
  const open = useCallback((request: DrawerRequest) => setCurrent(request), []);
  const api = useMemo(() => ({ open }), [open]);

  let drawer: ReactNode = null;
  if (current?.kind === 'member') {
    drawer = (
      <Drawer
        title="Registrar miembro"
        description="Members Service lo guarda y publica MEMBER_REGISTERED para que aparezca en la vista consolidada."
        onClose={close}
      >
        <MemberForm
          variant="drawer"
          onCancel={close}
          onSuccess={(member) => {
            close();
            toast.success(`Miembro #${member.id} registrado`, {
              description: `${member.name}. El siguiente paso es asignarle un plan.`,
              action: { label: 'Asignar plan', onClick: () => open({ kind: 'membership', memberId: member.id }) },
              duration: 8_000,
            });
          }}
        />
      </Drawer>
    );
  } else if (current?.kind === 'membership') {
    drawer = (
      <Drawer
        title="Asignar plan"
        description="Crea una membresía pendiente de pago. Se activa cuando registres el pago."
        onClose={close}
      >
        <MembershipForm
          variant="drawer"
          memberId={current.memberId}
          onCancel={close}
          onPayPending={(membership) => open({ kind: 'payment', membershipId: membership.id })}
          onSuccess={(membership) => {
            close();
            toast.success(`Membresía #${membership.id} creada`, {
              description: 'Queda pendiente hasta registrar el pago.',
              action: { label: 'Registrar pago', onClick: () => open({ kind: 'payment', membershipId: membership.id }) },
              duration: 8_000,
            });
          }}
        />
      </Drawer>
    );
  } else if (current?.kind === 'payment') {
    drawer = (
      <Drawer
        title="Registrar pago"
        description="Payments registra el pago y Memberships activa la membresía al recibir el evento."
        onClose={close}
      >
        <PaymentForm
          variant="drawer"
          membershipId={current.membershipId}
          onCancel={close}
          onSuccess={(payment, membership) => {
            close();
            const activation = waitForMembershipStatus(membership.id, 'ACTIVE').then((active) => {
              queryClient.invalidateQueries({ queryKey: keys.memberships });
              return active;
            });
            toast.promise(activation, {
              loading: `Pago #${payment.id} registrado. Activando la membresía #${membership.id}…`,
              success: (active) => ({
                message: `Membresía #${active.id} activa`,
                description: `Vigente hasta el ${formatDate(active.endDate)}. Ya puede ingresar al gimnasio.`,
                action: {
                  label: 'Validar ingreso',
                  onClick: () => navigate(`/acceso?miembro=${active.memberId}`),
                },
                duration: 10_000,
              }),
              // Que la activación tarde no significa que el pago se perdiera: el aviso lo aclara y dice qué revisar.
              error: (error: unknown) => {
                const info = describeError(error);
                return {
                  message: info.title,
                  description: [info.message, info.hint].filter(Boolean).join(' '),
                  action: { label: 'Ver eventos', onClick: () => navigate('/eventos') },
                  duration: 15_000,
                };
              },
            });
          }}
        />
      </Drawer>
    );
  } else if (current?.kind === 'plan') {
    drawer = (
      <Drawer title="Nuevo plan" description="Los planes definen la duración y el valor de las membresías." onClose={close}>
        <PlanForm
          variant="drawer"
          onCancel={close}
          onSuccess={(plan) => {
            close();
            toast.success(`Plan ${plan.name} creado`, { description: 'Ya puedes asignarlo a los miembros.' });
          }}
        />
      </Drawer>
    );
  }

  return (
    <DrawerContext.Provider value={api}>
      {children}
      {drawer}
    </DrawerContext.Provider>
  );
}
