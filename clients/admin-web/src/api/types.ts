// Tipos del contrato contracts/graphql/schema.graphqls (mismos campos que gym-platform-api.yaml).

export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED';
export type AccessResult = 'ACCESS_GRANTED' | 'ACCESS_DENIED';

export interface Member {
  id: number;
  document: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
}

export interface Plan {
  id: number;
  name: string;
  durationDays: number;
  price: number;
  createdAt: string;
}

export interface Membership {
  id: number;
  memberId: number;
  planId: number;
  status: MembershipStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export interface Payment {
  id: number;
  membershipId: number;
  amount: number;
  paidAt: string;
  createdAt: string;
}

export interface AccessAttempt {
  attemptId: number;
  memberId: number;
  result: AccessResult;
  reason: string;
  occurredAt: string;
}

export interface MemberOverview {
  member: Member;
  membership: Membership | null;
  recentAccesses: AccessAttempt[];
}

export interface CreateMemberInput {
  document: string;
  name: string;
  phone: string;
  email?: string;
}

export interface CreatePlanInput {
  name: string;
  durationDays: number;
  price: number;
}

export interface CreateMembershipInput {
  memberId: number;
  planId: number;
}

export interface CreatePaymentInput {
  membershipId: number;
  amount: number;
  paidAt: string;
}

export type ComponentId = 'simulator' | 'kafka' | 'postgres' | 'queries' | 'gateway';

/** UNKNOWN: no se pudo saber porque el componente que lo informa no respondió. */
export type ComponentStatus = 'UP' | 'DOWN' | 'UNKNOWN';

export interface SystemComponent {
  id: ComponentId;
  name: string;
  role: string;
  status: ComponentStatus;
}

export interface SystemStatus {
  ready: boolean;
  checkedAt: string;
  components: SystemComponent[];
}

export type TopicName = 'members.events' | 'payments.events' | 'memberships.events' | 'access.events';

export interface KafkaEntry {
  seq: number;
  topic: TopicName;
  partition: number;
  offset: number;
  key: string | null;
  timestamp: string;
  eventType: string | null;
  payload: Record<string, unknown> | null;
  raw: string | null;
}

export interface KafkaFeed {
  lastSeq: number;
  events: KafkaEntry[];
}
