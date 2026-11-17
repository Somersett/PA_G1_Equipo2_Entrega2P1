import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { superviseConsumer, Topics } from '../kafka.js';
import { log } from '../log.js';

// Extensión del simulador (fuera del contrato): lee los cuatro tópicos desde el inicio con un grupo propio
// y conserva los últimos mensajes en memoria para que el panel muestre lo que viaja realmente por Kafka.
// No participa en el flujo de negocio ni confirma offsets de otros consumidores.

const CAPACITY = 500;

export function createFeedModule() {
  const buffer = [];
  let sequence = 0;
  let consumer = null;

  function push(entry) {
    sequence += 1;
    buffer.push({ seq: sequence, ...entry });
    if (buffer.length > CAPACITY) {
      buffer.shift();
    }
  }

  async function start({ kafka }) {
    consumer = kafka.consumer({ groupId: `admin-web-event-feed-${randomUUID()}`, allowAutoTopicCreation: true });
    superviseConsumer(consumer, 'visor de eventos');
    await consumer.connect();
    await consumer.subscribe({ topics: Object.values(Topics), fromBeginning: true });
    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        const raw = message.value?.toString('utf8') ?? '';
        let payload = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
        push({
          topic,
          partition,
          offset: Number(message.offset),
          key: message.key?.toString('utf8') ?? null,
          timestamp: new Date(Number(message.timestamp)).toISOString(),
          eventType: payload?.eventType ?? null,
          payload,
          raw: payload ? null : raw.slice(0, 2_000),
        });
      },
    });
    log.info('Visor de eventos suscrito a los cuatro tópicos');
  }

  async function stop() {
    await consumer?.disconnect().catch(() => {});
  }

  const router = Router();
  router.get('/sim/events', (req, res) => {
    const after = Number.parseInt(req.query.after, 10) || 0;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), CAPACITY);
    const events = buffer.filter((entry) => entry.seq > after).slice(-limit);
    res.json({ lastSeq: sequence, events });
  });

  return { router, start, stop };
}
