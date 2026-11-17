// Carga los datos ficticios de datos-demo.json a través del GraphQL Gateway, siguiendo el mismo flujo que el
// panel: registrar miembro -> asignar plan -> registrar pago -> (activación por Kafka) -> intentos de ingreso.
// Así cada base (members_db, memberships_db, payments_db, access_db y queries_db) queda consistente por eventos.
// Es idempotente: si un documento ya existe, ese miembro se omite.
import { readFile } from 'node:fs/promises';
import { gqlOk, sleep, waitForMembershipStatus, waitForPlatform, ENDPOINT } from './gateway.mjs';

const { miembros } = JSON.parse(await readFile(new URL('./datos-demo.json', import.meta.url), 'utf8'));

console.log(`\n  FET Gym - Carga de datos ficticios (${miembros.length} miembros) por ${ENDPOINT}`);
console.log('  Esperando a que todos los componentes estén en línea...');
await waitForPlatform();

const plans = (await gqlOk('{ plans { id name price } }')).plans;
const existing = new Map((await gqlOk('{ members { id document } }')).members.map((m) => [m.document, m.id]));
const planByName = new Map(plans.map((p) => [p.name, p]));
const results = [];

async function attempt(memberId) {
  const data = await gqlOk('mutation($m: Int!) { registerAccessAttempt(memberId: $m) { attemptId result reason } }', { m: memberId });
  return data.registerAccessAttempt;
}

for (const m of miembros) {
  if (existing.has(m.documento)) {
    results.push({ nombre: m.nombre, id: existing.get(m.documento), escenario: m.escenario, estado: 'ya existía (omitido)', ingresos: '' });
    continue;
  }
  const member = (await gqlOk(
    'mutation($i: RegisterMemberInput!) { registerMember(input: $i) { id } }',
    { i: { document: m.documento, name: m.nombre, phone: m.telefono, ...(m.correo ? { email: m.correo } : {}) } },
  )).registerMember;
  let estado = 'sin membresía';

  if (m.escenario !== 'sin-membresia') {
    const plan = planByName.get(m.plan);
    if (!plan) throw new Error(`No existe el plan "${m.plan}". Planes disponibles: ${plans.map((p) => p.name).join(', ')}`);
    const membership = (await gqlOk(
      'mutation($i: CreateMembershipInput!) { createMembership(input: $i) { id status } }',
      { i: { memberId: member.id, planId: plan.id } },
    )).createMembership;
    estado = `#${membership.id} ${membership.status}`;

    if (m.escenario === 'activa' || m.escenario === 'vencida') {
      await gqlOk(
        'mutation($i: RegisterPaymentInput!) { registerPayment(input: $i) { id } }',
        { i: { membershipId: membership.id, amount: plan.price, paidAt: new Date().toISOString() } },
      );
      const active = await waitForMembershipStatus(membership.id, 'ACTIVE');
      estado = `#${membership.id} ${active ? 'ACTIVE' : 'PENDING (activación demorada)'}`;
      await sleep(1_500); // Access Control recibe MEMBERSHIP_ACTIVATED por Kafka.
      if (m.escenario === 'vencida') {
        await gqlOk('mutation($id: Int!) { expireMembership(id: $id) { status } }', { id: membership.id });
        estado = `#${membership.id} EXPIRED`;
        await sleep(2_500); // Access Control recibe MEMBERSHIP_EXPIRED por Kafka.
      }
    }
  }

  const ingresos = [];
  for (let i = 0; i < (m.ingresos ?? 0); i++) ingresos.push((await attempt(member.id)).result === 'ACCESS_GRANTED' ? 'permitido' : 'denegado');
  results.push({ nombre: m.nombre, id: member.id, escenario: m.escenario, estado, ingresos: ingresos.join(', ') });
  console.log(`  OK  #${member.id} ${m.nombre} (${m.escenario})`);
}

console.log('');
console.table(results);
const created = results.filter((r) => !r.estado.startsWith('ya existía')).length;
console.log(`\n  Listo: ${created} miembros nuevos, ${results.length - created} ya existían. Ábralos en el panel (Miembros).`);
