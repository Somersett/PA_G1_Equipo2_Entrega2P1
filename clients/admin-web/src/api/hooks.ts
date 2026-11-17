import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from '../lib/errors';
import { ApiError } from './client';
import {
  createMembership,
  createPlan,
  expireMembership,
  fetchAccessAttempts,
  fetchKafkaEvents,
  fetchMemberOverview,
  fetchMembers,
  fetchMembership,
  fetchMemberships,
  fetchPayments,
  fetchPlans,
  fetchSystemStatus,
  registerAccessAttempt,
  registerMember,
  registerPayment,
} from './graphql';
import type { KafkaEntry, Membership } from './types';

export const keys = {
  members: ['members'] as const,
  plans: ['plans'] as const,
  memberships: ['memberships'] as const,
  payments: ['payments'] as const,
  attempts: ['access-attempts'] as const,
  status: ['status'] as const,
  overview: (id: number) => ['overview', id] as const,
};

// Las listas se refrescan solas cada pocos segundos: los cambios llegan por Kafka de forma asíncrona.
const LIVE = 4_000;

export const useMembers = () => useQuery({ queryKey: keys.members, queryFn: fetchMembers, refetchInterval: LIVE });

export const usePlans = () => useQuery({ queryKey: keys.plans, queryFn: fetchPlans });

export const useMemberships = () =>
  useQuery({ queryKey: keys.memberships, queryFn: fetchMemberships, refetchInterval: LIVE });

export const usePayments = () => useQuery({ queryKey: keys.payments, queryFn: fetchPayments, refetchInterval: LIVE });

export const useAccessAttempts = (limit = 50) =>
  useQuery({
    queryKey: [...keys.attempts, limit],
    queryFn: () => fetchAccessAttempts(limit),
    refetchInterval: LIVE,
  });

// Lo arma el gateway con todos los componentes. Un reintento corto evita que un corte de un instante haga
// parpadear el aviso de conexión; con problemas se consulta más seguido para avisar en cuanto se recupere.
export const useSystemStatus = () =>
  useQuery({
    queryKey: keys.status,
    queryFn: fetchSystemStatus,
    refetchInterval: (query) => (query.state.data?.ready && !query.state.error ? 10_000 : 3_000),
    retry: 1,
    retryDelay: 800,
  });

export const useMemberOverview = (id: number | null, options: { limit?: number; poll?: number | false } = {}) =>
  useQuery({
    queryKey: [...keys.overview(id ?? 0), options.limit ?? 10],
    queryFn: () => fetchMemberOverview(id as number, options.limit ?? 10),
    enabled: id !== null && id > 0,
    refetchInterval: options.poll ?? 5_000,
  });

/** Mapas id -> entidad para cruzar listas en la vista (los servicios no hacen joins entre dominios). */
export function useLookups() {
  const members = useMembers();
  const plans = usePlans();
  const memberships = useMemberships();
  const maps = useMemo(() => {
    const memberById = new Map((members.data ?? []).map((m) => [m.id, m]));
    const planById = new Map((plans.data ?? []).map((p) => [p.id, p]));
    const membershipById = new Map((memberships.data ?? []).map((m) => [m.id, m]));
    // La membresía vigente de un miembro: la más reciente, igual que la vista consolidada.
    const currentMembership = new Map<number, Membership>();
    for (const membership of memberships.data ?? []) {
      const previous = currentMembership.get(membership.memberId);
      // Se comparan instantes, no textos: el gateway recorta los ceros finales de las fracciones de segundo.
      const created = Date.parse(membership.createdAt);
      const previousCreated = previous ? Date.parse(previous.createdAt) : 0;
      const newer =
        !previous || created > previousCreated || (created === previousCreated && membership.id > previous.id);
      if (newer) currentMembership.set(membership.memberId, membership);
    }
    return { memberById, planById, membershipById, currentMembership };
  }, [members.data, plans.data, memberships.data]);
  return { members, plans, memberships, ...maps };
}

// ───────────── Mutaciones ─────────────

export function useCreateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: registerMember,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.members }),
  });
}

export function useCreatePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createPlan,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.plans }),
  });
}

export function useCreateMembership() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createMembership,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.memberships }),
  });
}

export function useCreatePayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: registerPayment,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.payments });
      client.invalidateQueries({ queryKey: keys.memberships });
    },
  });
}

export function useExpireMembership() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: expireMembership,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.memberships }),
  });
}

export function useAccessAttempt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: registerAccessAttempt,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.attempts }),
  });
}

/**
 * Espera a que una membresía llegue a un estado. La activación ocurre de forma asíncrona:
 * Payments publica PAYMENT_REGISTERED y Memberships la activa al consumirlo. Tolera cortes momentáneos
 * (sigue consultando hasta el plazo) y, si no llega, falla con ACTIVATION_TIMEOUT, que explica que el
 * pago sí quedó guardado.
 */
export async function waitForMembershipStatus(
  membershipId: number,
  status: Membership['status'],
  timeoutMs = 20_000,
): Promise<Membership> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const membership = await fetchMembership(membershipId);
      if (!membership) {
        throw new ApiError(404, 'MEMBERSHIP_NOT_FOUND', `No existe la membresía #${membershipId}.`);
      }
      if (membership.status === status) return membership;
    } catch (cause) {
      if (!describeError(cause).retryable || Date.now() > deadline) throw cause;
    }
    if (Date.now() > deadline) {
      throw new ApiError(
        0,
        'ACTIVATION_TIMEOUT',
        `Memberships todavía no procesa el pago de la membresía #${membershipId}.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const FEED_MAX_BACKOFF_MS = 15_000;

/**
 * Visor de Kafka: acumula los mensajes de los cuatro tópicos, consultados por kafkaEvents en el gateway. Si
 * la consulta falla conserva lo ya recibido y espera cada vez más entre intentos (hasta 15 s), para no
 * insistir sobre un servicio caído; al primer éxito vuelve al ritmo normal.
 */
export function useKafkaFeed({ paused = false, interval = 1_500 }: { paused?: boolean; interval?: number } = {}) {
  const [events, setEvents] = useState<KafkaEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastSeq = useRef(0);

  useEffect(() => {
    if (paused) return;
    let active = true;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const feed = await fetchKafkaEvents(lastSeq.current, 500);
        if (!active) return;
        if (feed.lastSeq < lastSeq.current) {
          // El simulador se reinició: se vuelve a cargar todo.
          lastSeq.current = 0;
          setEvents([]);
        }
        if (feed.events.length > 0) {
          lastSeq.current = feed.events[feed.events.length - 1].seq;
          setEvents((current) => [...current, ...feed.events].slice(-500));
        }
        failures = 0;
        setError(null);
        setLoaded(true);
      } catch (cause) {
        failures += 1;
        if (active) setError(cause as Error);
      }
      if (active) timer = setTimeout(tick, Math.min(interval * 2 ** failures, FEED_MAX_BACKOFF_MS));
    };
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [paused, interval]);

  return { events, error, loaded };
}
