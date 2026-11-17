import { Router } from 'express';
import { withTransaction } from '../db.js';
import { AccessResult, businessDate, decideAccess } from '../domain.js';
import { positiveId, readBody } from '../http.js';
import { envelope, Topics } from '../kafka.js';
import { startIdempotentConsumer } from '../consumer.js';
import { enqueueEvent } from '../outbox.js';
import { log } from '../log.js';

// Access Control Service simulado: access_db con su estado local (AccessState) y los intentos (RF-08, RF-09).
// Consume MEMBERSHIP_ACTIVATED y MEMBERSHIP_EXPIRED; produce ACCESS_GRANTED y ACCESS_DENIED.
// Decide solo con access_db: nunca llama a Members, Memberships, Payments ni queries_db (RNF-01, RNF-02).

export const CONSUMER_NAME = 'access-control-service';

const attemptResponse = (row) => ({
  attemptId: row.attempt_id,
  memberId: row.member_id,
  result: row.result,
  reason: row.reason,
  occurredAt: row.occurred_at.toISOString(),
});

export function createAccessModule({ pool, relay, timezone }) {
  async function onMembershipActivated(client, event) {
    const memberId = Number(event.memberId);
    const membershipId = Number(event.membershipId);
    // Una membresía más reciente reemplaza el estado; un evento atrasado de una anterior no lo retrocede.
    await client.query(
      `INSERT INTO access_state (member_id, membership_id, status, end_date, updated_at)
       VALUES ($1, $2, 'ACTIVE', $3, now())
       ON CONFLICT (member_id) DO UPDATE SET
         membership_id = EXCLUDED.membership_id, status = 'ACTIVE', end_date = EXCLUDED.end_date, updated_at = now()
       WHERE access_state.membership_id < EXCLUDED.membership_id
          OR (access_state.membership_id = EXCLUDED.membership_id AND access_state.status = 'ACTIVE')`,
      [memberId, membershipId, event.endDate],
    );
  }

  async function onMembershipExpired(client, event) {
    const memberId = Number(event.memberId);
    const membershipId = Number(event.membershipId);
    const result = await client.query(
      `INSERT INTO access_state (member_id, membership_id, status, end_date, updated_at)
       VALUES ($1, $2, 'EXPIRED', $3, now())
       ON CONFLICT (member_id) DO UPDATE SET status = 'EXPIRED', end_date = EXCLUDED.end_date, updated_at = now()
       WHERE access_state.membership_id = EXCLUDED.membership_id`,
      [memberId, membershipId, event.endDate],
    );
    if (result.rowCount === 0) {
      log.info(`${CONSUMER_NAME}: MEMBERSHIP_EXPIRED de la membresía ${membershipId} ignorado; el miembro ya tiene una más reciente`);
    }
  }

  async function attempt(body) {
    const memberId = positiveId(body.memberId, 'memberId');
    const recorded = await withTransaction(pool, async (client) => {
      const { rows } = await client.query('SELECT status, end_date FROM access_state WHERE member_id = $1', [memberId]);
      const state = rows[0] ? { status: rows[0].status, endDate: rows[0].end_date } : null;
      const decision = decideAccess(state, businessDate(new Date(), timezone));
      const inserted = await client.query(
        'INSERT INTO access_attempts (member_id, result, reason) VALUES ($1, $2, $3) RETURNING *',
        [memberId, decision.result, decision.reason],
      );
      const created = attemptResponse(inserted.rows[0]);
      await enqueueEvent(
        client,
        Topics.ACCESS,
        memberId,
        envelope(
          decision.result,
          { attemptId: created.attemptId, memberId, result: decision.result, reason: decision.reason },
          new Date(created.occurredAt),
        ),
      );
      return created;
    });
    relay.notify();
    const verb = recorded.result === AccessResult.GRANTED ? 'concedido' : 'denegado';
    log.info(`Acceso ${verb} al miembro ${memberId} (${recorded.reason})`);
    return recorded;
  }

  async function start({ kafka }) {
    await startIdempotentConsumer({
      kafka,
      groupId: CONSUMER_NAME,
      consumerName: CONSUMER_NAME,
      topics: [Topics.MEMBERSHIPS],
      pool,
      handlers: {
        MEMBERSHIP_ACTIVATED: onMembershipActivated,
        MEMBERSHIP_EXPIRED: onMembershipExpired,
      },
    });
  }

  // POST /access-attempts no exige HTTP Basic: representa al simulador del punto de ingreso (contrato).
  const publicRouter = Router();
  publicRouter.post('/access-attempts', async (req, res) => {
    res.json(await attempt(readBody(req, ['memberId'])));
  });

  // Extensión del simulador (fuera del contrato): últimos intentos para el panel.
  const adminRouter = Router();
  adminRouter.get('/sim/access-attempts', async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
    const { rows } = await pool.query(
      'SELECT * FROM access_attempts ORDER BY occurred_at DESC, attempt_id DESC LIMIT $1',
      [limit],
    );
    res.json(rows.map(attemptResponse));
  });

  return { publicRouter, adminRouter, start };
}
