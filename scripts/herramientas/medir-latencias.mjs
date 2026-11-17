// Mide tiempos de respuesta reales de la plataforma desplegada, siempre a través del GraphQL Gateway.
// Crea registros de prueba (miembros "Medición latencia N", pagos e intentos de ingreso): úselo en un entorno
// de pruebas o bórrelos después con borrar-datos.
// Uso: docker compose --profile apps --profile herramientas run --rm herramientas medir-latencias.mjs [repeticiones]
import { performance } from 'node:perf_hooks';
import { gql, gqlOk, sleep, waitForMembershipStatus, waitForPlatform } from './gateway.mjs';

const N = Number(process.argv[2] ?? 30);
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const fmt = (ms) => `${ms.toFixed(1)} ms`;
const rows = [];

async function time(fn) {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

function record(name, samples) {
  rows.push({ operacion: name, n: samples.length, min: fmt(Math.min(...samples)), p50: fmt(percentile(samples, 50)), p95: fmt(percentile(samples, 95)), max: fmt(Math.max(...samples)) });
}

console.log(`\n  FET Gym - Medición de latencias (${N} repeticiones por operación de lectura)`);
await waitForPlatform();

// Preparación: un miembro con membresía activa para las consultas y los ingresos.
const stamp = Date.now().toString().slice(-7);
const plan = (await gqlOk('{ plans { id price durationDays } }')).plans.sort((a, b) => a.durationDays - b.durationDays)[0];

async function activeMember(i) {
  const member = (await gqlOk('mutation($i: RegisterMemberInput!) { registerMember(input: $i) { id } }',
    { i: { document: `M${stamp}${i}`, name: `Medición latencia ${i}`, phone: '3000000000' } })).registerMember;
  const membership = (await gqlOk('mutation($i: CreateMembershipInput!) { createMembership(input: $i) { id } }',
    { i: { memberId: member.id, planId: plan.id } })).createMembership;
  const paid = performance.now();
  await gqlOk('mutation($i: RegisterPaymentInput!) { registerPayment(input: $i) { id } }',
    { i: { membershipId: membership.id, amount: plan.price, paidAt: new Date().toISOString() } });
  const ok = await waitForMembershipStatus(membership.id, 'ACTIVE', 30_000, 20);
  if (!ok) throw new Error('La membresía no se activó en 30 s.');
  return { memberId: member.id, activationMs: performance.now() - paid };
}

// 1. Activación asíncrona de extremo a extremo: registerPayment -> Kafka -> MEMBERSHIP_ACTIVATED visible por el gateway.
const activations = [];
let probe;
for (let i = 1; i <= 5; i++) {
  probe = await activeMember(i);
  activations.push(probe.activationMs);
}
record('Activación por Kafka (pago -> ACTIVE)*', activations);
await sleep(1_500);

// 2. Lecturas.
const reads = {
  'Consulta systemStatus': '{ systemStatus { components { id status } } }',
  'Consulta plans': '{ plans { id name } }',
  'Consulta members': '{ members { id name } }',
  'Consulta member(id) (vista consolidada)': `{ member(id: ${probe.memberId}) { member { id name } membership { status } recentAccesses { result } } }`,
};
for (const [name, query] of Object.entries(reads)) {
  await gql(query); // calentamiento
  const samples = [];
  for (let i = 0; i < N; i++) samples.push(await time(() => gqlOk(query)));
  record(name, samples);
}

// 3. Decisión de acceso (escritura): registerAccessAttempt con estado local de Access Control.
const accessSamples = [];
for (let i = 0; i < Math.min(N, 20); i++) {
  accessSamples.push(await time(() => gqlOk('mutation($m: Int!) { registerAccessAttempt(memberId: $m) { result } }', { m: probe.memberId })));
}
record('Mutación registerAccessAttempt', accessSamples);

console.log('');
console.table(rows);
console.log('  * Incluye el sondeo cada 20 ms del estado de la membresía; mide la latencia observable por un cliente.');
console.log('\n| Operación | n | Mínimo | p50 | p95 | Máximo |\n| --- | ---: | ---: | ---: | ---: | ---: |');
for (const r of rows) console.log(`| ${r.operacion} | ${r.n} | ${r.min} | ${r.p50} | ${r.p95} | ${r.max} |`);
