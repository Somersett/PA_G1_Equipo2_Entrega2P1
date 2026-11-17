// Reglas de negocio puras (sin base de datos ni Kafka), cubiertas por test/domain.test.js.
// Fuente: PDF §5.1 "Reglas mínimas de estado".

export const MembershipStatus = Object.freeze({ PENDING: 'PENDING', ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED' });
export const AccessResult = Object.freeze({ GRANTED: 'ACCESS_GRANTED', DENIED: 'ACCESS_DENIED' });
export const AccessReason = Object.freeze({
  MEMBERSHIP_ACTIVE: 'MEMBERSHIP_ACTIVE',
  NO_ACTIVE_MEMBERSHIP: 'NO_ACTIVE_MEMBERSHIP',
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
});

/** Fecha calendario 'yyyy-MM-dd' de un instante en la zona horaria del negocio. */
export function businessDate(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Suma días a una fecha 'yyyy-MM-dd' sin depender de la zona horaria del proceso. */
export function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

/**
 * Vigencia calculada al activar: inicia el día del pago y cubre `durationDays` días completos,
 * incluido el primero. Un plan de 30 días pagado el 2026-11-04 vence al terminar el 2026-12-03.
 */
export function activationPeriod(paidAt, durationDays, timezone) {
  const startDate = businessDate(paidAt, timezone);
  return { startDate, endDate: addDays(startDate, durationDays - 1) };
}

/**
 * Decisión de Access Control con su estado local (RNF-01, regla crítica del PDF §3): concede el ingreso
 * únicamente con estado ACTIVE y vigencia no terminada. Nunca consulta otros servicios ni queries_db.
 */
export function decideAccess(state, today) {
  if (!state) {
    return { result: AccessResult.DENIED, reason: AccessReason.NO_ACTIVE_MEMBERSHIP };
  }
  if (state.status === MembershipStatus.ACTIVE && state.endDate >= today) {
    return { result: AccessResult.GRANTED, reason: AccessReason.MEMBERSHIP_ACTIVE };
  }
  if (state.status === MembershipStatus.EXPIRED || state.endDate < today) {
    return { result: AccessResult.DENIED, reason: AccessReason.MEMBERSHIP_EXPIRED };
  }
  return { result: AccessResult.DENIED, reason: AccessReason.NO_ACTIVE_MEMBERSHIP };
}
