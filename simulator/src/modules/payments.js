import { Router } from 'express';
import { withTransaction } from '../db.js';
import { MembershipStatus } from '../domain.js';
import {
  conflict,
  dateTime,
  nonNegativeNumber,
  notFound,
  positiveId,
  readBody,
  unprocessable,
} from '../http.js';
import { envelope, Topics } from '../kafka.js';
import { enqueueEvent } from '../outbox.js';

// Payments Service simulado: payments_db, POST/GET /payments y PAYMENT_REGISTERED (RF-05).
// No activa la membresía: eso lo hace Memberships al consumir el evento (RF-06).

const CLOCK_TOLERANCE_MS = 5 * 60_000;

const toResponse = (row) => ({
  id: row.id,
  membershipId: row.membership_id,
  amount: row.amount,
  paidAt: row.paid_at.toISOString(),
  createdAt: row.created_at.toISOString(),
});

export function createPaymentsModule({ pool, relay, memberships }) {
  async function register(body) {
    const membershipId = positiveId(body.membershipId, 'membershipId');
    const amount = nonNegativeNumber(body.amount, 'El monto');
    const paidAt = dateTime(body.paidAt, 'La fecha de pago');
    if (paidAt.getTime() > Date.now() + CLOCK_TOLERANCE_MS) {
      throw unprocessable('PAYMENT_IN_FUTURE', 'La fecha de pago no puede estar en el futuro.');
    }

    // Validación síncrona contra Memberships (en el simulador, llamada en proceso al módulo).
    const membership = await memberships.findMembership(membershipId);
    if (!membership) {
      throw notFound('MEMBERSHIP_NOT_FOUND', `No existe la membresía ${membershipId}.`);
    }
    if (membership.status !== MembershipStatus.PENDING) {
      throw conflict(
        'MEMBERSHIP_NOT_PENDING',
        `La membresía #${membershipId} ya está ${membership.status === 'ACTIVE' ? 'activa' : 'vencida'}; no admite pagos.`,
      );
    }
    const plan = await memberships.findPlan(membership.planId);
    if (plan && amount < plan.price) {
      throw unprocessable(
        'AMOUNT_BELOW_PLAN_PRICE',
        `El monto no cubre el valor del plan ${plan.name} (${plan.price}).`,
      );
    }

    const payment = await withTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [membershipId]);
      const previous = await client.query('SELECT id FROM payments WHERE membership_id = $1 LIMIT 1', [membershipId]);
      if (previous.rowCount > 0) {
        throw conflict(
          'PAYMENT_ALREADY_REGISTERED',
          `La membresía #${membershipId} ya tiene el pago #${previous.rows[0].id} registrado.`,
        );
      }
      const { rows } = await client.query(
        'INSERT INTO payments (membership_id, amount, paid_at) VALUES ($1, $2, $3) RETURNING *',
        [membershipId, Math.round(amount * 100) / 100, paidAt],
      );
      const created = toResponse(rows[0]);
      await enqueueEvent(
        client,
        Topics.PAYMENTS,
        membershipId,
        envelope('PAYMENT_REGISTERED', {
          paymentId: created.id,
          membershipId,
          amount: created.amount,
          paidAt: created.paidAt,
        }),
      );
      return created;
    });
    relay.notify();
    return payment;
  }

  const router = Router();

  router.post('/payments', async (req, res) => {
    res.status(201).json(await register(readBody(req, ['membershipId', 'amount', 'paidAt'])));
  });

  router.get('/payments', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM payments ORDER BY created_at DESC, id DESC');
    res.json(rows.map(toResponse));
  });

  router.get('/payments/:paymentId', async (req, res) => {
    const id = positiveId(req.params.paymentId, 'paymentId');
    const { rows } = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
    if (!rows[0]) {
      throw notFound('PAYMENT_NOT_FOUND', `No existe el pago ${id}.`);
    }
    res.json(toResponse(rows[0]));
  });

  return { router };
}
