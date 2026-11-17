// Configuración leída del entorno. Los valores por defecto sirven para ejecutar el simulador fuera de
// Docker contra la infraestructura local (PostgreSQL en 5432 y Kafka en 9092).

const env = process.env;

function integer(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value, fallback) {
  return (value ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = Object.freeze({
  port: integer(env.PORT, 8090),
  kafka: {
    brokers: list(env.KAFKA_BOOTSTRAP_SERVERS, 'localhost:9092'),
    clientId: 'services-simulator',
  },
  db: {
    host: env.DB_HOST ?? 'localhost',
    port: integer(env.DB_PORT, 5432),
    user: env.DB_USERNAME ?? '',
    password: env.DB_PASSWORD ?? '',
    databases: {
      members: env.MEMBERS_DB_NAME ?? 'members_db',
      memberships: env.MEMBERSHIPS_DB_NAME ?? 'memberships_db',
      payments: env.PAYMENTS_DB_NAME ?? 'payments_db',
      access: env.ACCESS_DB_NAME ?? 'access_db',
    },
  },
  // Misma credencial HTTP Basic que usan los clientes del GraphQL Gateway: un solo inicio de sesión en el panel.
  admin: {
    username: env.ADMIN_USERNAME ?? '',
    password: env.ADMIN_PASSWORD ?? '',
  },
  // Zona horaria del negocio para calcular vigencias (startDate, endDate y vencimientos).
  timezone: env.BUSINESS_TIMEZONE ?? 'America/Bogota',
  expirationIntervalMs: integer(env.EXPIRATION_INTERVAL_MS, 60_000),
  seedPlans: (env.SEED_PLANS ?? 'true') !== 'false',
  // Una consulta que tarde más que esto se cancela: el gateway espera 5 s y es mejor responder un error
  // claro que dejar la solicitud colgada.
  statementTimeoutMs: integer(env.DB_STATEMENT_TIMEOUT_MS, 4_000),
});

export function assertConfig() {
  const problems = [];
  if (!config.db.user || !config.db.password) {
    problems.push('Faltan DB_USERNAME y DB_PASSWORD.');
  }
  if (!config.admin.username || !config.admin.password) {
    problems.push('Faltan ADMIN_USERNAME y ADMIN_PASSWORD (credencial HTTP Basic del panel).');
  }
  if (problems.length > 0) {
    throw new Error(`Configuración incompleta: ${problems.join(' ')}`);
  }
}
