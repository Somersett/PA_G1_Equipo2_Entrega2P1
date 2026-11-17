import {
  CalendarX,
  CircleCheck,
  Hourglass,
  ShieldCheck,
  ShieldX,
  type LucideIcon,
} from 'lucide-react';
import type { AccessResult, MembershipStatus, TopicName } from '../api/types';
import { formatDate, formatMoney } from './format';

export type Tone = 'good' | 'warn' | 'bad' | 'idle';

interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  help: string;
}

export const MEMBERSHIP_STATUS: Record<MembershipStatus, StatusMeta> = {
  PENDING: {
    label: 'Pendiente de pago',
    tone: 'warn',
    icon: Hourglass,
    help: 'Creada y a la espera del pago. Todavía no permite el ingreso.',
  },
  ACTIVE: {
    label: 'Activa',
    tone: 'good',
    icon: CircleCheck,
    help: 'Pagada y vigente. El miembro puede ingresar.',
  },
  EXPIRED: {
    label: 'Vencida',
    tone: 'idle',
    icon: CalendarX,
    help: 'Su vigencia terminó. Para volver a ingresar necesita una membresía nueva.',
  },
};

export const ACCESS_RESULT: Record<AccessResult, StatusMeta> = {
  ACCESS_GRANTED: {
    label: 'Permitido',
    tone: 'good',
    icon: ShieldCheck,
    help: 'El torniquete abrió.',
  },
  ACCESS_DENIED: {
    label: 'Denegado',
    tone: 'bad',
    icon: ShieldX,
    help: 'El torniquete no abrió.',
  },
};

export const ACCESS_REASON: Record<string, string> = {
  MEMBERSHIP_ACTIVE: 'Membresía activa',
  NO_ACTIVE_MEMBERSHIP: 'Sin membresía activa',
  MEMBERSHIP_EXPIRED: 'Membresía vencida',
};

export const reasonLabel = (reason: string) => ACCESS_REASON[reason] ?? reason;

/** Explicación para la persona en el torniquete. */
export const REASON_DETAIL: Record<string, string> = {
  MEMBERSHIP_ACTIVE: 'La membresía está pagada y vigente.',
  NO_ACTIVE_MEMBERSHIP: 'No tiene una membresía activa. Si ya tiene una asignada, falta registrar el pago.',
  MEMBERSHIP_EXPIRED: 'Su membresía venció. Asígnale un plan nuevo y registra el pago para renovarla.',
};

interface TopicMeta {
  label: string;
  producer: string;
  consumers: string[];
  purpose: string;
}

export const TOPICS: Record<TopicName, TopicMeta> = {
  'members.events': {
    label: 'Miembros',
    producer: 'Members Service',
    consumers: ['Consolidated Queries'],
    purpose: 'Lleva cada miembro nuevo a la vista consolidada.',
  },
  'payments.events': {
    label: 'Pagos',
    producer: 'Payments Service',
    consumers: ['Memberships Service'],
    purpose: 'Avisa a Memberships que debe activar la membresía pagada.',
  },
  'memberships.events': {
    label: 'Membresías',
    producer: 'Memberships Service',
    consumers: ['Access Control', 'Consolidated Queries'],
    purpose: 'Propaga creación, activación y vencimiento de membresías.',
  },
  'access.events': {
    label: 'Accesos',
    producer: 'Access Control Service',
    consumers: ['Consolidated Queries'],
    purpose: 'Refleja cada intento de ingreso en la vista consolidada.',
  },
};

export const TOPIC_ORDER: TopicName[] = ['members.events', 'payments.events', 'memberships.events', 'access.events'];

/** Quién produce y quién consume cada tipo de evento (contracts/kafka/events.yaml). */
export const EVENT_FLOW: Record<string, { producer: string; consumers: string[] }> = {
  MEMBER_REGISTERED: { producer: 'Members', consumers: ['Consolidated Queries'] },
  PAYMENT_REGISTERED: { producer: 'Payments', consumers: ['Memberships'] },
  MEMBERSHIP_CREATED: { producer: 'Memberships', consumers: ['Consolidated Queries'] },
  MEMBERSHIP_ACTIVATED: { producer: 'Memberships', consumers: ['Access Control', 'Consolidated Queries'] },
  MEMBERSHIP_EXPIRED: { producer: 'Memberships', consumers: ['Access Control', 'Consolidated Queries'] },
  ACCESS_GRANTED: { producer: 'Access Control', consumers: ['Consolidated Queries'] },
  ACCESS_DENIED: { producer: 'Access Control', consumers: ['Consolidated Queries'] },
};

type Payload = Record<string, unknown>;

/** Un mensaje cumple el sobre común si trae eventId, eventType, occurredAt y version. */
export function isValidEnvelope(payload: Payload | null): payload is Payload {
  return Boolean(
    payload &&
      typeof payload.eventId === 'string' &&
      typeof payload.eventType === 'string' &&
      typeof payload.occurredAt === 'string' &&
      payload.version === 1,
  );
}

export const INVALID_MESSAGE = 'Mensaje fuera del contrato: los consumidores lo descartan sin aplicar efectos';

export const eventLabel = (eventType: string | null, payload: Payload | null) =>
  eventType && isValidEnvelope(payload) ? eventType : 'MENSAJE INVÁLIDO';

/** Frase legible para un evento de Kafka. `nameOf` resuelve el nombre del miembro si se conoce. */
export function describeEvent(eventType: string | null, payload: Payload | null, nameOf: (id: number) => string | undefined) {
  if (!eventType || !isValidEnvelope(payload)) return INVALID_MESSAGE;
  const member = (id: unknown) => {
    const name = nameOf(Number(id));
    return name ? `${name} (#${id})` : `el miembro #${id}`;
  };
  switch (eventType) {
    case 'MEMBER_REGISTERED':
      return `Se registró a ${payload.name ?? 'un miembro'} como miembro #${payload.memberId}`;
    case 'MEMBERSHIP_CREATED':
      return `Membresía #${payload.membershipId} creada para ${member(payload.memberId)}, pendiente de pago`;
    case 'PAYMENT_REGISTERED':
      return `Pago #${payload.paymentId} por ${formatMoney(Number(payload.amount))} para la membresía #${payload.membershipId}`;
    case 'MEMBERSHIP_ACTIVATED':
      return `Membresía #${payload.membershipId} de ${member(payload.memberId)} activada hasta el ${formatDate(String(payload.endDate))}`;
    case 'MEMBERSHIP_EXPIRED':
      return `Membresía #${payload.membershipId} de ${member(payload.memberId)} vencida`;
    case 'ACCESS_GRANTED':
      return `Ingreso permitido a ${member(payload.memberId)}`;
    case 'ACCESS_DENIED':
      return `Ingreso denegado a ${member(payload.memberId)}: ${reasonLabel(String(payload.reason ?? '')).toLowerCase()}`;
    default:
      return eventType;
  }
}
