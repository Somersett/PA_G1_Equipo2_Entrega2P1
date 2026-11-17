import { randomUUID } from 'node:crypto';
import { Kafka, logLevel, Partitioners } from 'kafkajs';
import { log } from './log.js';

export const Topics = Object.freeze({
  MEMBERS: 'members.events',
  PAYMENTS: 'payments.events',
  MEMBERSHIPS: 'memberships.events',
  ACCESS: 'access.events',
});

const KAFKA_LOG_LEVELS = {
  [logLevel.ERROR]: 'error',
  [logLevel.WARN]: 'warn',
  [logLevel.INFO]: 'info',
  [logLevel.DEBUG]: 'info',
};

export function createKafka({ brokers, clientId }) {
  return new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.WARN,
    retry: { initialRetryTime: 300, retries: 8 },
    logCreator: () => ({ namespace, level, log: entry }) => {
      const method = KAFKA_LOG_LEVELS[level] ?? 'info';
      log[method](`[kafka ${namespace}] ${entry.message}`);
    },
  });
}

export function createProducer(kafka) {
  return kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: true,
  });
}

/** Crea los cuatro tópicos del contrato si aún no existen (broker académico: 1 partición, réplica 1). */
export async function ensureTopics(admin) {
  const existing = new Set(await admin.listTopics());
  const missing = Object.values(Topics).filter((topic) => !existing.has(topic));
  if (missing.length === 0) {
    return;
  }
  try {
    await admin.createTopics({
      waitForLeaders: true,
      topics: missing.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
    });
    log.info(`Tópicos creados: ${missing.join(', ')}`);
  } catch (error) {
    // Otro cliente pudo crearlos al mismo tiempo (auto-creación del broker).
    if (!String(error?.message).includes('already exists')) {
      throw error;
    }
  }
}

/**
 * Supervisión de un consumidor. Si kafkajs agota sus reintentos y decide no reiniciarlo, el consumidor
 * quedaría detenido en silencio: las membresías dejarían de activarse sin que nadie lo note. En ese caso
 * se termina el proceso para que Docker Compose lo reinicie (restart: unless-stopped); al volver retoma
 * desde el último offset confirmado y la idempotencia evita aplicar dos veces un evento.
 */
export function superviseConsumer(consumer, name) {
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    if (payload?.restart) {
      log.warn(`[${name}] el consumidor falló (${payload.error?.message}); kafkajs lo reinicia`);
      return;
    }
    log.error(`[${name}] el consumidor se detuvo sin reinicio (${payload?.error?.message}); se reinicia el proceso`);
    setTimeout(() => process.exit(1), 100);
  });
}

/** Sobre común versionado de contracts/kafka/events.yaml con los campos de dominio en el mismo objeto. */
export function envelope(eventType, fields, occurredAt = new Date()) {
  return {
    eventId: randomUUID(),
    eventType,
    occurredAt: occurredAt.toISOString(),
    version: 1,
    ...fields,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lectura defensiva de un mensaje: devuelve null si no cumple el sobre común. */
export function parseEvent(message) {
  let event;
  try {
    event = JSON.parse(message.value?.toString('utf8') ?? '');
  } catch {
    return null;
  }
  if (
    event === null ||
    typeof event !== 'object' ||
    typeof event.eventId !== 'string' ||
    !UUID.test(event.eventId) ||
    typeof event.eventType !== 'string' ||
    event.version !== 1
  ) {
    return null;
  }
  return event;
}
