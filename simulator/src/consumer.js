import { withTransaction } from './db.js';
import { parseEvent, superviseConsumer } from './kafka.js';
import { log } from './log.js';

/**
 * Consumidor idempotente (RNF-09): el registro del eventId en processed_events y el efecto del evento se
 * confirman en la misma transacción local, y el offset se confirma después del commit. Un eventId repetido
 * se reconoce sin volver a aplicar efectos.
 *
 * @param handlers mapa eventType -> async (client, event) => void. Los tipos sin handler se ignoran.
 */
export async function startIdempotentConsumer({ kafka, groupId, consumerName, topics, pool, handlers, afterCommit }) {
  const consumer = kafka.consumer({ groupId, allowAutoTopicCreation: true });
  superviseConsumer(consumer, consumerName);
  await consumer.connect();
  await consumer.subscribe({ topics, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const event = parseEvent(message);
      if (!event) {
        log.error(`${consumerName}: mensaje descartado por no cumplir el sobre común (${topic}-${partition}@${message.offset})`);
        return;
      }
      const handler = handlers[event.eventType];
      if (!handler) {
        return;
      }
      const applied = await withTransaction(pool, async (client) => {
        const inserted = await client.query(
          'INSERT INTO processed_events (consumer_name, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [consumerName, event.eventId],
        );
        if (inserted.rowCount === 0) {
          return false;
        }
        await handler(client, event);
        return true;
      });
      if (applied) {
        log.info(`${consumerName}: ${event.eventType} ${event.eventId} aplicado`);
        afterCommit?.();
      } else {
        log.info(`${consumerName}: ${event.eventType} ${event.eventId} duplicado, reconocido sin efectos`);
      }
    },
  });
  return consumer;
}
