import { log } from './log.js';

/**
 * Outbox transaccional: el evento se guarda en la misma transacción que el cambio de dominio y un relay
 * lo publica después en Kafka. Así una operación REST nunca confirma un cambio sin su evento, y si Kafka
 * no está disponible los eventos salen en orden cuando vuelve.
 */
export async function enqueueEvent(client, topic, key, event) {
  await client.query('INSERT INTO outbox (topic, message_key, payload) VALUES ($1, $2, $3)', [
    topic,
    String(key),
    JSON.stringify(event),
  ]);
}

export class OutboxRelay {
  constructor({ pools, producer, intervalMs = 1_000 }) {
    this.pools = pools;
    this.producer = producer;
    this.intervalMs = intervalMs;
    this.running = false;
    this.pending = false;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.flush(), this.intervalMs);
    this.flush();
  }

  stop() {
    clearInterval(this.timer);
  }

  /** Publica lo pendiente cuanto antes (se llama justo después de cada commit). */
  notify() {
    this.flush();
  }

  async flush() {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.pending = false;
        for (const [module, pool] of Object.entries(this.pools)) {
          await this.flushPool(module, pool);
        }
      } while (this.pending);
    } finally {
      this.running = false;
    }
  }

  async flushPool(module, pool) {
    let rows;
    try {
      ({ rows } = await pool.query(
        'SELECT id, topic, message_key, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 100',
      ));
    } catch (error) {
      log.warn(`Outbox de ${module} no disponible: ${error.message}`);
      return;
    }
    for (const row of rows) {
      try {
        await this.producer.send({ topic: row.topic, messages: [{ key: row.message_key, value: row.payload }] });
        await pool.query('UPDATE outbox SET published_at = now() WHERE id = $1', [row.id]);
        const event = JSON.parse(row.payload);
        log.info(`Publicado ${event.eventType} ${event.eventId} en ${row.topic} (clave ${row.message_key})`);
      } catch (error) {
        // Se detiene en el primer fallo para conservar el orden; el siguiente ciclo reintenta.
        log.warn(`No se pudo publicar el evento ${row.id} de ${module}: ${error.message}`);
        return;
      }
    }
  }
}
