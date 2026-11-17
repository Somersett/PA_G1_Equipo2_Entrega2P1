import pg from 'pg';
import { log } from './log.js';

// Cada módulo simulado usa su propia base lógica (RNF-03): members_db, memberships_db, payments_db y
// access_db. Las tablas viven en el esquema "simulator" para no chocar con tablas que otras
// implementaciones hayan creado en esas mismas bases.
export const SCHEMA = 'simulator';

// BIGINT (20) y NUMERIC (1700) llegan como texto por defecto; los ids y montos de la demo caben en un
// Number. DATE (1082) se conserva como 'yyyy-MM-dd' para no aplicar zonas horarias a fechas calendario.
pg.types.setTypeParser(20, (value) => Number(value));
pg.types.setTypeParser(1700, (value) => Number(value));
pg.types.setTypeParser(1082, (value) => value);

export function createPools(dbConfig, { statementTimeoutMs = 4_000 } = {}) {
  const pools = {};
  for (const [module, database] of Object.entries(dbConfig.databases)) {
    pools[module] = new pg.Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database,
      max: 5,
      // Sin base de datos la solicitud falla en 3 s con DATABASE_UNAVAILABLE en vez de quedar colgada.
      connectionTimeoutMillis: 3_000,
      options: `-c search_path=${SCHEMA} -c statement_timeout=${statementTimeoutMs}`,
    });
    pools[module].on('error', (error) => log.warn(`Conexión de ${database} interrumpida: ${error.message}`));
  }
  return pools;
}

export async function withTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const OUTBOX = `
  CREATE TABLE IF NOT EXISTS outbox (
    id           BIGSERIAL   PRIMARY KEY,
    topic        TEXT        NOT NULL,
    message_key  TEXT        NOT NULL,
    payload      TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox (id) WHERE published_at IS NULL;
`;

const PROCESSED_EVENTS = `
  CREATE TABLE IF NOT EXISTS processed_events (
    consumer_name VARCHAR(100) NOT NULL,
    event_id      UUID         NOT NULL,
    processed_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_processed_events PRIMARY KEY (consumer_name, event_id)
  );
`;

const MIGRATIONS = {
  members: `
    CREATE TABLE IF NOT EXISTS members (
      id         BIGSERIAL   PRIMARY KEY,
      document   TEXT        NOT NULL UNIQUE,
      name       TEXT        NOT NULL,
      phone      TEXT        NOT NULL,
      email      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ${OUTBOX}
  `,
  memberships: `
    CREATE TABLE IF NOT EXISTS plans (
      id            BIGSERIAL     PRIMARY KEY,
      name          TEXT          NOT NULL UNIQUE,
      duration_days INTEGER       NOT NULL CHECK (duration_days > 0),
      price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS memberships (
      id         BIGSERIAL   PRIMARY KEY,
      member_id  BIGINT      NOT NULL,
      plan_id    BIGINT      NOT NULL REFERENCES plans (id),
      status     VARCHAR(16) NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED')),
      start_date DATE,
      end_date   DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_memberships_member ON memberships (member_id, created_at DESC);
    ${PROCESSED_EVENTS}
    ${OUTBOX}
  `,
  payments: `
    CREATE TABLE IF NOT EXISTS payments (
      id            BIGSERIAL     PRIMARY KEY,
      membership_id BIGINT        NOT NULL,
      amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
      paid_at       TIMESTAMPTZ   NOT NULL,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_payments_membership ON payments (membership_id);
    ${OUTBOX}
  `,
  access: `
    CREATE TABLE IF NOT EXISTS access_state (
      member_id     BIGINT      PRIMARY KEY,
      membership_id BIGINT      NOT NULL,
      status        VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED')),
      end_date      DATE        NOT NULL,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS access_attempts (
      attempt_id  BIGSERIAL   PRIMARY KEY,
      member_id   BIGINT      NOT NULL,
      result      VARCHAR(16) NOT NULL CHECK (result IN ('ACCESS_GRANTED', 'ACCESS_DENIED')),
      reason      TEXT        NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_access_attempts_recent ON access_attempts (occurred_at DESC);
    ${PROCESSED_EVENTS}
    ${OUTBOX}
  `,
};

export async function migrate(pools) {
  for (const [module, ddl] of Object.entries(MIGRATIONS)) {
    await withTransaction(pools[module], async (client) => {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
      await client.query(`SET LOCAL search_path TO ${SCHEMA}`);
      await client.query(ddl);
    });
  }
}

export async function pingAll(pools) {
  await Promise.all(Object.values(pools).map((pool) => pool.query('SELECT 1')));
}
