import { ApiError, postGraphql, type RequestOptions } from './client';
import type {
  AccessAttempt,
  CreateMemberInput,
  CreateMembershipInput,
  CreatePaymentInput,
  CreatePlanInput,
  KafkaFeed,
  Member,
  MemberOverview,
  Membership,
  Payment,
  Plan,
  SystemStatus,
} from './types';

// Operaciones del contrato contracts/graphql/schema.graphqls. member(id) lee la vista consolidada (RF-10);
// las demás las resuelve el gateway contra Members, Memberships, Payments y Access Control.

const MEMBER = 'id document name phone email createdAt';
const PLAN = 'id name durationDays price createdAt';
const MEMBERSHIP = 'id memberId planId status startDate endDate createdAt';
const PAYMENT = 'id membershipId amount paidAt createdAt';
const ACCESS_ATTEMPT = 'attemptId memberId result reason occurredAt';

export const MEMBER_OVERVIEW_QUERY = `query MemberOverview($id: Int!, $limit: Int) {
  member(id: $id) {
    member { ${MEMBER} }
    membership { ${MEMBERSHIP} }
    recentAccesses(limit: $limit) { ${ACCESS_ATTEMPT} }
  }
}`;

interface GraphQLErrorItem {
  message?: string;
  /**
   * classification la pone el gateway; code es el código del servicio cuando rechaza un comando o explica una
   * caída (STARTING, DATABASE_UNAVAILABLE, CIRCUIT_OPEN); upstream dice qué servicio falló.
   */
  extensions?: { classification?: string; code?: string; upstream?: string };
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLErrorItem[];
}

// Spring for GraphQL responde los errores inesperados y de validación con textos técnicos en inglés: el
// panel los reemplaza por una explicación (lib/errors.ts) y conserva el original solo para el registro.
const CLASSIFICATION_MESSAGES: Record<string, string> = {
  INTERNAL_ERROR: 'El GraphQL Gateway no pudo completar la operación.',
  ValidationError: 'La consulta del panel no coincide con el esquema del gateway.',
  InvalidSyntax: 'La consulta del panel no es válida.',
};

export interface GraphQLResult<T> {
  data: T;
  /** Respuesta completa tal como la devolvió el gateway, para mostrarla en el panel. */
  raw: unknown;
  durationMs: number;
}

export async function graphql<T>(
  query: string,
  variables?: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<GraphQLResult<T>> {
  const started = performance.now();
  const response = await postGraphql<GraphQLResponse<T>>({ query, variables }, options);
  const durationMs = Math.round(performance.now() - started);
  const error = response?.errors?.[0];
  if (error) {
    const classification = error.extensions?.classification ?? 'GRAPHQL_ERROR';
    if (CLASSIFICATION_MESSAGES[classification]) {
      console.warn(`[GraphQL] ${classification}: ${error.message ?? ''}`);
    }
    throw new ApiError(
      200,
      error.extensions?.code ?? classification,
      CLASSIFICATION_MESSAGES[classification] ?? error.message ?? 'La operación GraphQL falló.',
      { classification, upstream: error.extensions?.upstream },
    );
  }
  if (response.data === undefined || response.data === null) {
    throw new ApiError(200, 'BAD_RESPONSE', 'El gateway respondió sin datos.');
  }
  return { data: response.data as T, raw: response, durationMs };
}

async function run<T>(query: string, variables?: Record<string, unknown>) {
  return (await graphql<T>(query, variables)).data;
}

// ───────────── Consultas ─────────────

export function fetchMemberOverview(id: number, limit = 10) {
  return graphql<{ member: MemberOverview | null }>(MEMBER_OVERVIEW_QUERY, { id, limit });
}

export const fetchMembers = async () =>
  (await run<{ members: Member[] }>(`query Members { members { ${MEMBER} } }`)).members;

export const fetchPlans = async () => (await run<{ plans: Plan[] }>(`query Plans { plans { ${PLAN} } }`)).plans;

export const fetchMemberships = async () =>
  (await run<{ memberships: Membership[] }>(`query Memberships { memberships { ${MEMBERSHIP} } }`)).memberships;

export const fetchMembership = async (id: number) =>
  (
    await run<{ membership: Membership | null }>(
      `query Membership($id: Int!) { membership(id: $id) { ${MEMBERSHIP} } }`,
      { id },
    )
  ).membership;

export const fetchPayments = async () =>
  (await run<{ payments: Payment[] }>(`query Payments { payments { ${PAYMENT} } }`)).payments;

export const fetchAccessAttempts = async (limit: number) =>
  (
    await run<{ accessAttempts: AccessAttempt[] }>(
      `query AccessAttempts($limit: Int) { accessAttempts(limit: $limit) { ${ACCESS_ATTEMPT} } }`,
      { limit },
    )
  ).accessAttempts;

export const fetchSystemStatus = async () =>
  (
    await run<{ systemStatus: SystemStatus }>(
      'query SystemStatus { systemStatus { ready checkedAt components { id name role status } } }',
    )
  ).systemStatus;

export const fetchKafkaEvents = async (after: number, limit: number) =>
  (
    await run<{ kafkaEvents: KafkaFeed }>(
      `query KafkaEvents($after: Int, $limit: Int) {
        kafkaEvents(after: $after, limit: $limit) {
          lastSeq
          events { seq topic partition offset key timestamp eventType payload raw }
        }
      }`,
      { after, limit },
    )
  ).kafkaEvents;

// ───────────── Mutaciones ─────────────

export const registerMember = async (input: CreateMemberInput) =>
  (
    await run<{ registerMember: Member }>(
      `mutation RegisterMember($input: RegisterMemberInput!) { registerMember(input: $input) { ${MEMBER} } }`,
      { input },
    )
  ).registerMember;

export const createPlan = async (input: CreatePlanInput) =>
  (
    await run<{ createPlan: Plan }>(
      `mutation CreatePlan($input: CreatePlanInput!) { createPlan(input: $input) { ${PLAN} } }`,
      { input },
    )
  ).createPlan;

export const createMembership = async (input: CreateMembershipInput) =>
  (
    await run<{ createMembership: Membership }>(
      `mutation CreateMembership($input: CreateMembershipInput!) { createMembership(input: $input) { ${MEMBERSHIP} } }`,
      { input },
    )
  ).createMembership;

export const registerPayment = async (input: CreatePaymentInput) =>
  (
    await run<{ registerPayment: Payment }>(
      `mutation RegisterPayment($input: RegisterPaymentInput!) { registerPayment(input: $input) { ${PAYMENT} } }`,
      { input },
    )
  ).registerPayment;

export const registerAccessAttempt = async (memberId: number) =>
  (
    await run<{ registerAccessAttempt: AccessAttempt }>(
      `mutation RegisterAccessAttempt($memberId: Int!) { registerAccessAttempt(memberId: $memberId) { ${ACCESS_ATTEMPT} } }`,
      { memberId },
    )
  ).registerAccessAttempt;

export const expireMembership = async (id: number) =>
  (
    await run<{ expireMembership: Membership }>(
      `mutation ExpireMembership($id: Int!) { expireMembership(id: $id) { ${MEMBERSHIP} } }`,
      { id },
    )
  ).expireMembership;
