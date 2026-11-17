import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activationPeriod, addDays, businessDate, decideAccess } from '../src/domain.js';

const BOGOTA = 'America/Bogota';

test('businessDate usa la zona horaria del negocio y no la del proceso', () => {
  // 2026-11-05T03:00Z todavía es 4 de noviembre en Bogotá (UTC-5).
  assert.equal(businessDate(new Date('2026-11-05T03:00:00Z'), BOGOTA), '2026-11-04');
  assert.equal(businessDate(new Date('2026-11-05T05:00:00Z'), BOGOTA), '2026-11-05');
});

test('addDays cruza meses, años y bisiestos', () => {
  assert.equal(addDays('2026-11-04', 29), '2026-12-03');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-11-04', 0), '2026-11-04');
});

test('la vigencia cubre durationDays días incluido el del pago', () => {
  assert.deepEqual(activationPeriod(new Date('2026-11-04T15:00:00Z'), 30, BOGOTA), {
    startDate: '2026-11-04',
    endDate: '2026-12-03',
  });
  assert.deepEqual(activationPeriod(new Date('2026-11-04T15:00:00Z'), 1, BOGOTA), {
    startDate: '2026-11-04',
    endDate: '2026-11-04',
  });
});

test('sin estado local el acceso se niega por falta de membresía activa', () => {
  assert.deepEqual(decideAccess(null, '2026-11-04'), {
    result: 'ACCESS_DENIED',
    reason: 'NO_ACTIVE_MEMBERSHIP',
  });
});

test('con estado ACTIVE y vigencia en curso el acceso se concede, incluido el último día', () => {
  const state = { status: 'ACTIVE', endDate: '2026-11-30' };
  assert.equal(decideAccess(state, '2026-11-04').result, 'ACCESS_GRANTED');
  assert.equal(decideAccess(state, '2026-11-30').result, 'ACCESS_GRANTED');
  assert.equal(decideAccess(state, '2026-11-30').reason, 'MEMBERSHIP_ACTIVE');
});

test('una vigencia terminada se niega aunque la tarea programada aún no la haya vencido', () => {
  assert.deepEqual(decideAccess({ status: 'ACTIVE', endDate: '2026-11-03' }, '2026-11-04'), {
    result: 'ACCESS_DENIED',
    reason: 'MEMBERSHIP_EXPIRED',
  });
});

test('una membresía EXPIRED se niega aunque su fecha de fin sea hoy', () => {
  assert.deepEqual(decideAccess({ status: 'EXPIRED', endDate: '2026-11-04' }, '2026-11-04'), {
    result: 'ACCESS_DENIED',
    reason: 'MEMBERSHIP_EXPIRED',
  });
});
