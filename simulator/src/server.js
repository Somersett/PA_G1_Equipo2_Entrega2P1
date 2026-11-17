import express from 'express';
import { assertConfig, config } from './config.js';
import { createPools, migrate, pingAll } from './db.js';
import { basicAuth, errorHandler, notFoundHandler } from './http.js';
import { createKafka, createProducer, ensureTopics } from './kafka.js';
import { log } from './log.js';
import { OutboxRelay } from './outbox.js';
import { createAccessModule } from './modules/access.js';
import { createFeedModule } from './modules/feed.js';
import { createMembersModule } from './modules/members.js';
import { createMembershipsModule } from './modules/memberships.js';
import { createPaymentsModule } from './modules/payments.js';
import { createStatusModule } from './modules/status.js';

assertConfig();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryUntilReady(description, action) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (attempt === 1 || attempt % 10 === 0) {
        log.warn(`${description} todavía no está disponible (${error.message}); reintentando...`);
      }
      await sleep(Math.min(500 * attempt, 3_000));
    }
  }
}

const pools = createPools(config.db, { statementTimeoutMs: config.statementTimeoutMs });
const kafka = createKafka(config.kafka);
const admin = kafka.admin();
const producer = createProducer(kafka);
const relay = new OutboxRelay({ pools, producer });

const members = createMembersModule({ pool: pools.members, relay });
const memberships = createMembershipsModule({
  pool: pools.memberships,
  relay,
  members,
  timezone: config.timezone,
});
const payments = createPaymentsModule({ pool: pools.payments, relay, memberships });
const access = createAccessModule({ pool: pools.access, relay, timezone: config.timezone });
const feed = createFeedModule();

let ready = false;
const status = createStatusModule({ pools, admin, isReady: () => ready });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// Salud del propio proceso (healthcheck de Docker Compose): 200 cuando terminó de arrancar.
app.get('/health', (_req, res) => {
  res.status(ready ? 200 : 503).json({ status: ready ? 'UP' : 'STARTING' });
});

// Rutas públicas: estado del sistema y punto de ingreso.
app.use(status.router);
app.use((req, res, next) => {
  if (!ready && req.path !== '/health') {
    return res.status(503).json({ code: 'STARTING', message: 'El simulador está arrancando. Intente en unos segundos.' });
  }
  next();
});
app.use(access.publicRouter);

// Rutas administrativas con HTTP Basic (RNF-07).
const admins = express.Router();
admins.use(basicAuth(config.admin));
admins.use(members.router);
admins.use(memberships.router);
admins.use(payments.router);
admins.use(access.adminRouter);
admins.use(feed.router);
app.use(admins);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  log.info(`Simulador escuchando en el puerto ${config.port}`);
});

async function boot() {
  await retryUntilReady('PostgreSQL', () => pingAll(pools));
  await migrate(pools);
  log.info('Esquemas de members_db, memberships_db, payments_db y access_db listos');

  await retryUntilReady('Kafka', async () => {
    await admin.connect();
    await ensureTopics(admin);
  });
  await producer.connect();
  relay.start();

  await memberships.start({ kafka, expirationIntervalMs: config.expirationIntervalMs, seed: config.seedPlans });
  await access.start({ kafka });
  await feed.start({ kafka });

  ready = true;
  log.info('Simulador listo: Members, Memberships, Payments y Access Control en línea');
}

boot().catch((error) => {
  log.error(`El simulador no pudo arrancar: ${error.stack ?? error}`);
  process.exit(1);
});

async function shutdown(signal) {
  log.info(`Recibida ${signal}; deteniendo el simulador`);
  ready = false;
  server.close();
  relay.stop();
  memberships.stop();
  await feed.stop();
  await producer.disconnect().catch(() => {});
  await admin.disconnect().catch(() => {});
  await Promise.all(Object.values(pools).map((pool) => pool.end().catch(() => {})));
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
