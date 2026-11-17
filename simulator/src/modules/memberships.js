import { Router } from 'express';
import { withTransaction } from '../db.js';
import { activationPeriod, businessDate, MembershipStatus } from '../domain.js';
import { badRequest, conflict, notFound, positiveId, readBody, requiredText, unprocessable } from '../http.js';
import { envelope, Topics } from '../kafka.js';
import { startIdempotentConsumer } from '../consumer.js';
import { enqueueEvent } from '../outbox.js';
import { log } from '../log.js';

// Memberships Service simulado: memberships_db con planes y membresías (RF-03, RF-04, RF-06, RF-07).
// Consume PAYMENT_REGISTERED y produce MEMBERSHIP_CREATED, MEMBERSHIP_ACTIVATED y MEMBERSHIP_EXPIRED.

export const CONSUMER_NAME = 'memberships-service';

const DEFAULT_PLANS = [
  { name: 'Mensual', durationDays: 30, price: 90_000 },
  { name: 'Trimestral', durationDays: 90, price: 240_000 },
  { name: 'Anual', durationDays: 365, price: 850_000 },
];

const planResponse = (row) => ({
  id: row.id,
  name: row.name,
  durationDays: row.duration_days,
  price: row.price,
  createdAt: row.created_at.toISOString(),
});

const membershipResponse = (row) => ({
  id: row.id,
  memberId: row.member_id,
  planId: row.plan_id,
  status: row.status,
  startDate: row.start_date,
  endDate: row.end_date,
  createdAt: row.created_at.toISOString(),
});

export function createMembershipsModule({ pool, relay, members, timezone }) {
  const today = () => businessDate(new Date(), timezone);

  async function findPlan(id) {
    const { rows } = await pool.query('SELECT * FROM plans WHERE id = $1', [id]);
    return rows[0] ? planResponse(rows[0]) : null;
  }

  async function findMembership(id) {
    const { rows } = await pool.query('SELECT * FROM memberships WHERE id = $1', [id]);
    return rows[0] ? membershipResponse(rows[0]) : null;
  }

  async function seedPlans() {
    const { rows } = await pool.query('SELECT count(*)::int AS total FROM plans');
    if (rows[0].total > 0) {
      return;
    }
    for (const plan of DEFAULT_PLANS) {
      await pool.query(
        'INSERT INTO plans (name, duration_days, price) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
        [plan.name, plan.durationDays, plan.price],
      );
    }
    log.info(`Catálogo inicial creado: ${DEFAULT_PLANS.map((plan) => plan.name).join(', ')}`);
  }

  async function createPlan(body) {
    const name = requiredText(body, 'name', 'El nombre del plan', { min: 2, max: 60 });
    const durationDays = body.durationDays;
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
      throw badRequest('La duración debe ser un número entero de días entre 1 y 3650.');
    }
    const price = body.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      throw badRequest('El precio debe ser un número mayor o igual que 0.');
    }
    try {
      const { rows } = await pool.query(
        'INSERT INTO plans (name, duration_days, price) VALUES ($1, $2, $3) RETURNING *',
        [name, durationDays, Math.round(price * 100) / 100],
      );
      return planResponse(rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        throw conflict('PLAN_NAME_TAKEN', `Ya existe un plan llamado "${name}".`);
      }
      throw error;
    }
  }

  async function createMembership(body) {
    const memberId = positiveId(body.memberId, 'memberId');
    const planId = positiveId(body.planId, 'planId');
    // Validación síncrona contra Members: en el simulador es una llamada en proceso al módulo de miembros.
    if (!(await members.findById(memberId))) {
      throw notFound('MEMBER_NOT_FOUND', `No existe el miembro ${memberId}.`);
    }
    const membership = await withTransaction(pool, async (client) => {
      const plan = await client.query('SELECT id FROM plans WHERE id = $1', [planId]);
      if (plan.rowCount === 0) {
        throw notFound('PLAN_NOT_FOUND', `No existe el plan ${planId}.`);
      }
      // Bloqueo por miembro para que dos solicitudes simultáneas no abran dos membresías.
      await client.query('SELECT pg_advisory_xact_lock($1)', [memberId]);
      const open = await client.query(
        `SELECT id, status FROM memberships WHERE member_id = $1 AND status IN ('PENDING', 'ACTIVE') LIMIT 1`,
        [memberId],
      );
      if (open.rowCount > 0) {
        const current = open.rows[0];
        const detail = current.status === 'PENDING' ? 'pendiente de pago' : 'activa';
        throw conflict(
          'MEMBERSHIP_ALREADY_OPEN',
          `El miembro ya tiene la membresía #${current.id} ${detail}. Solo puede tener una a la vez.`,
        );
      }
      const { rows } = await client.query(
        `INSERT INTO memberships (member_id, plan_id, status) VALUES ($1, $2, 'PENDING') RETURNING *`,
        [memberId, planId],
      );
      const created = membershipResponse(rows[0]);
      await enqueueEvent(
        client,
        Topics.MEMBERSHIPS,
        memberId,
        envelope('MEMBERSHIP_CREATED', {
          membershipId: created.id,
          memberId,
          planId,
          status: MembershipStatus.PENDING,
        }),
      );
      return created;
    });
    relay.notify();
    return membership;
  }

  /** PAYMENT_REGISTERED -> membresía ACTIVE con vigencia calculada -> MEMBERSHIP_ACTIVATED (RF-06). */
  async function onPaymentRegistered(client, event) {
    const membershipId = Number(event.membershipId);
    const paidAt = new Date(event.paidAt);
    if (!Number.isSafeInteger(membershipId) || Number.isNaN(paidAt.getTime())) {
      log.error(`${CONSUMER_NAME}: PAYMENT_REGISTERED ${event.eventId} sin membershipId o paidAt válidos; se ignora`);
      return;
    }
    const { rows } = await client.query(
      `SELECT m.*, p.duration_days FROM memberships m JOIN plans p ON p.id = m.plan_id WHERE m.id = $1 FOR UPDATE OF m`,
      [membershipId],
    );
    const membership = rows[0];
    if (!membership) {
      log.warn(`${CONSUMER_NAME}: el pago ${event.paymentId} referencia la membresía ${membershipId}, que no existe`);
      return;
    }
    if (membership.status !== MembershipStatus.PENDING) {
      log.warn(`${CONSUMER_NAME}: la membresía ${membershipId} ya estaba ${membership.status}; el pago no la modifica`);
      return;
    }
    const { startDate, endDate } = activationPeriod(paidAt, membership.duration_days, timezone);
    await client.query(
      `UPDATE memberships SET status = 'ACTIVE', start_date = $2, end_date = $3, updated_at = now() WHERE id = $1`,
      [membershipId, startDate, endDate],
    );
    await enqueueEvent(
      client,
      Topics.MEMBERSHIPS,
      membership.member_id,
      envelope('MEMBERSHIP_ACTIVATED', {
        membershipId,
        memberId: membership.member_id,
        status: MembershipStatus.ACTIVE,
        startDate,
        endDate,
      }),
    );
  }

  async function expire(client, membership, endDate) {
    await client.query(
      `UPDATE memberships SET status = 'EXPIRED', end_date = $2, updated_at = now() WHERE id = $1`,
      [membership.id, endDate],
    );
    await enqueueEvent(
      client,
      Topics.MEMBERSHIPS,
      membership.member_id,
      envelope('MEMBERSHIP_EXPIRED', {
        membershipId: membership.id,
        memberId: membership.member_id,
        status: MembershipStatus.EXPIRED,
        endDate,
      }),
    );
  }

  /** Tarea programada (RF-07): ACTIVE con vigencia terminada -> EXPIRED. */
  async function expireDueMemberships() {
    const expired = await withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        `SELECT id, member_id, end_date FROM memberships WHERE status = 'ACTIVE' AND end_date < $1 FOR UPDATE`,
        [today()],
      );
      for (const membership of rows) {
        await expire(client, membership, membership.end_date);
      }
      return rows.length;
    });
    if (expired > 0) {
      log.info(`Tarea de vencimiento: ${expired} membresía(s) marcadas como EXPIRED`);
      relay.notify();
    }
  }

  /**
   * Acción de demostración: termina hoy la vigencia de una membresía activa para mostrar RF-07 sin esperar
   * semanas. Produce el mismo MEMBERSHIP_EXPIRED que la tarea programada.
   */
  async function forceExpire(id) {
    const membership = await withTransaction(pool, async (client) => {
      const { rows } = await client.query('SELECT * FROM memberships WHERE id = $1 FOR UPDATE', [id]);
      const current = rows[0];
      if (!current) {
        throw notFound('MEMBERSHIP_NOT_FOUND', `No existe la membresía ${id}.`);
      }
      if (current.status !== MembershipStatus.ACTIVE) {
        throw unprocessable('MEMBERSHIP_NOT_ACTIVE', 'Solo se puede vencer una membresía activa.');
      }
      const endDate = current.end_date < today() ? current.end_date : today();
      await expire(client, current, endDate);
      const updated = await client.query('SELECT * FROM memberships WHERE id = $1', [id]);
      return membershipResponse(updated.rows[0]);
    });
    relay.notify();
    return membership;
  }

  let scheduler = null;

  async function start({ kafka, expirationIntervalMs, seed }) {
    if (seed) {
      await seedPlans();
    }
    await startIdempotentConsumer({
      kafka,
      groupId: CONSUMER_NAME,
      consumerName: CONSUMER_NAME,
      topics: [Topics.PAYMENTS],
      pool,
      handlers: { PAYMENT_REGISTERED: onPaymentRegistered },
      afterCommit: () => relay.notify(),
    });
    const run = () =>
      expireDueMemberships().catch((error) => log.warn(`Tarea de vencimiento falló: ${error.message}`));
    await run();
    scheduler = setInterval(run, expirationIntervalMs);
  }

  function stop() {
    clearInterval(scheduler);
  }

  const router = Router();

  router.post('/plans', async (req, res) => {
    res.status(201).json(await createPlan(readBody(req, ['name', 'durationDays', 'price'])));
  });

  router.get('/plans', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM plans ORDER BY duration_days, id');
    res.json(rows.map(planResponse));
  });

  router.post('/memberships', async (req, res) => {
    res.status(201).json(await createMembership(readBody(req, ['memberId', 'planId'])));
  });

  router.get('/memberships', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM memberships ORDER BY created_at DESC, id DESC');
    res.json(rows.map(membershipResponse));
  });

  router.get('/memberships/:membershipId', async (req, res) => {
    const id = positiveId(req.params.membershipId, 'membershipId');
    const membership = await findMembership(id);
    if (!membership) {
      throw notFound('MEMBERSHIP_NOT_FOUND', `No existe la membresía ${id}.`);
    }
    res.json(membership);
  });

  // Extensión del simulador (fuera del contrato): adelanta el vencimiento para la demostración.
  router.post('/sim/memberships/:membershipId/expire', async (req, res) => {
    res.json(await forceExpire(positiveId(req.params.membershipId, 'membershipId')));
  });

  return { router, start, stop, findMembership, findPlan };
}
