import { Router } from 'express';
import { pingAll } from '../db.js';

// Estado de lo que solo el simulador puede observar: él mismo, Kafka y PostgreSQL. El GraphQL Gateway lo
// combina con su propio estado y con la salud de Consolidated Queries en la consulta systemStatus; el
// simulador no conoce al gateway ni a los demás servicios.

const CACHE_MS = 2_000;
const TIMEOUT_MS = 2_000;

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createStatusModule({ pools, admin, isReady }) {
  let cached = null;
  let cachedAt = 0;

  async function check(id, name, role, probe) {
    try {
      await withTimeout(probe());
      return { id, name, role, status: 'up' };
    } catch {
      return { id, name, role, status: 'down' };
    }
  }

  async function snapshot() {
    if (cached && Date.now() - cachedAt < CACHE_MS) {
      return cached;
    }
    const components = await Promise.all([
      check('simulator', 'Simulador de servicios', 'Members, Memberships, Payments y Access Control', async () => {
        if (!isReady()) throw new Error('arrancando');
      }),
      check('kafka', 'Apache Kafka', 'Mensajería de eventos', () => admin.describeCluster()),
      check('postgres', 'PostgreSQL', 'Bases de datos por servicio', () => pingAll(pools)),
    ]);
    cached = {
      ready: components.every((component) => component.status === 'up'),
      checkedAt: new Date().toISOString(),
      components,
    };
    cachedAt = Date.now();
    return cached;
  }

  // Público y sin datos sensibles: responde aunque el simulador esté arrancando, para informar por qué.
  const router = Router();
  router.get('/sim/status', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await snapshot());
  });
  return { router };
}
