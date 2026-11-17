import { Router } from 'express';
import { withTransaction } from '../db.js';
import { badRequest, conflict, notFound, positiveId, readBody, requiredText } from '../http.js';
import { envelope, Topics } from '../kafka.js';
import { enqueueEvent } from '../outbox.js';

// Members Service simulado: members_db, POST/GET /members y MEMBER_REGISTERED (RF-01, RF-02).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toResponse = (row) => ({
  id: row.id,
  document: row.document,
  name: row.name,
  phone: row.phone,
  email: row.email,
  createdAt: row.created_at.toISOString(),
});

export function createMembersModule({ pool, relay }) {
  async function findById(id) {
    const { rows } = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
    return rows[0] ? toResponse(rows[0]) : null;
  }

  async function register(body) {
    const document = requiredText(body, 'document', 'El documento', { min: 5, max: 20 });
    if (!/^[A-Za-z0-9-]+$/.test(document)) {
      throw badRequest('El documento solo admite letras, números y guiones.');
    }
    const name = requiredText(body, 'name', 'El nombre', { min: 3, max: 100 });
    const phone = requiredText(body, 'phone', 'El teléfono', { min: 7, max: 20 });
    if (!/^\+?[0-9 ()-]+$/.test(phone)) {
      throw badRequest('El teléfono solo admite números, espacios, guiones y el prefijo +.');
    }
    let email = null;
    if (body.email !== undefined && body.email !== null && String(body.email).trim() !== '') {
      email = requiredText(body, 'email', 'El correo', { max: 120 }).toLowerCase();
      if (!EMAIL.test(email)) {
        throw badRequest('El correo no tiene un formato válido.');
      }
    }

    const duplicatedDocument = () =>
      conflict('DOCUMENT_ALREADY_REGISTERED', `Ya existe un miembro con el documento ${document}.`);

    const member = await withTransaction(pool, async (client) => {
      const duplicated = await client.query('SELECT id FROM members WHERE document = $1', [document]);
      if (duplicated.rowCount > 0) {
        throw duplicatedDocument();
      }
      const { rows } = await client
        .query('INSERT INTO members (document, name, phone, email) VALUES ($1, $2, $3, $4) RETURNING *', [
          document,
          name,
          phone,
          email,
        ])
        .catch((error) => {
          throw error.code === '23505' ? duplicatedDocument() : error;
        });
      const created = toResponse(rows[0]);
      await enqueueEvent(
        client,
        Topics.MEMBERS,
        created.id,
        envelope('MEMBER_REGISTERED', {
          memberId: created.id,
          document: created.document,
          name: created.name,
          phone: created.phone,
          email: created.email,
          createdAt: created.createdAt,
        }),
      );
      return created;
    });
    relay.notify();
    return member;
  }

  const router = Router();

  router.post('/members', async (req, res) => {
    const body = readBody(req, ['document', 'name', 'phone', 'email']);
    res.status(201).json(await register(body));
  });

  router.get('/members', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM members ORDER BY created_at DESC, id DESC');
    res.json(rows.map(toResponse));
  });

  router.get('/members/:memberId', async (req, res) => {
    const id = positiveId(req.params.memberId, 'memberId');
    const member = await findById(id);
    if (!member) {
      throw notFound('MEMBER_NOT_FOUND', `No existe el miembro ${id}.`);
    }
    res.json(member);
  });

  return { router, findById };
}
