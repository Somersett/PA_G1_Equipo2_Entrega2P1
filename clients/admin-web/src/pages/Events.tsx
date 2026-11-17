import { Fragment, useMemo, useState } from 'react';
import { Activity, ArrowRight, ChevronRight, Pause, Play } from 'lucide-react';
import { useKafkaFeed, useLookups } from '../api/hooks';
import type { TopicName } from '../api/types';
import { CodeBlock, EmptyState, ErrorNotice, ErrorState, PageHeader, Topic } from '../components/ui';
import { formatTime } from '../lib/format';
import { describeEvent, EVENT_FLOW, eventLabel, TOPIC_ORDER, TOPICS } from '../lib/labels';

type Filter = 'all' | TopicName;

export function Events() {
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const feed = useKafkaFeed({ paused });
  const { memberById } = useLookups();
  const nameOf = (id: number) => memberById.get(id)?.name;

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: feed.events.length };
    for (const topic of TOPIC_ORDER) result[topic] = 0;
    for (const entry of feed.events) result[entry.topic] = (result[entry.topic] ?? 0) + 1;
    return result;
  }, [feed.events]);

  const rows = useMemo(
    () => feed.events.filter((entry) => filter === 'all' || entry.topic === filter).slice().reverse(),
    [feed.events, filter],
  );

  return (
    <div className="page">
      <PageHeader
        title="Eventos Kafka"
        description="Todo lo que viaja por Kafka entre los servicios, leído directamente del broker. Así se comunican sin llamarse entre sí."
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? 'Reanudar' : 'Pausar'}
          </button>
        }
      />

      <section className="topic-grid" aria-label="Tópicos del contrato">
        {TOPIC_ORDER.map((topic) => (
          <button
            key={topic}
            type="button"
            className="card topic-card"
            aria-pressed={filter === topic}
            onClick={() => setFilter((current) => (current === topic ? 'all' : topic))}
          >
            <span className="topic-card-head">
              <Topic name={topic} />
              <span className="topic-count num">{counts[topic] ?? 0}</span>
            </span>
            <span className="topic-flow">
              <span>{TOPICS[topic].producer.replace(' Service', '')}</span>
              <ArrowRight aria-hidden="true" />
              <span>{TOPICS[topic].consumers.join(', ')}</span>
            </span>
            <span className="topic-purpose">{TOPICS[topic].purpose}</span>
          </button>
        ))}
      </section>

      {feed.error && feed.loaded ? (
        <ErrorNotice error={feed.error} title="El visor no se está actualizando" stale />
      ) : null}

      <section className="card">
        <div className="toolbar">
          <span className="live-status">
            <span className={`live-dot${paused ? ' is-paused' : ''}`} aria-hidden="true" />
            {paused ? 'En pausa' : 'En vivo'}
          </span>
          <div className="toolbar-spacer" />
          {filter !== 'all' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>
              Ver todos los tópicos ({counts.all})
            </button>
          ) : (
            <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>
              {counts.all} eventos · haz clic en uno para ver su JSON
            </span>
          )}
        </div>
        {feed.error && !feed.loaded ? (
          <ErrorState error={feed.error} title="No se pudieron leer los eventos de Kafka" />
        ) : feed.loaded && rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title={filter === 'all' ? 'Kafka todavía no tiene eventos' : 'Sin eventos en este tópico'}
            text="Registra un miembro, asigna un plan o valida un ingreso y verás aparecer sus eventos aquí."
          />
        ) : (
          <div className="table-wrap">
            <table className="table events-table">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Evento</th>
                  <th scope="col">Productor → consumidores</th>
                  <th scope="col">Tópico</th>
                  <th scope="col" className="align-right">
                    Offset
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const isOpen = expanded === entry.seq;
                  const flow = entry.eventType ? EVENT_FLOW[entry.eventType] : undefined;
                  const toggle = () => setExpanded(isOpen ? null : entry.seq);
                  return (
                    <Fragment key={entry.seq}>
                      <tr
                        className={`is-clickable${isOpen ? ' is-highlighted' : ''}`}
                        onClick={toggle}
                        onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), toggle())}
                        tabIndex={0}
                        aria-expanded={isOpen}
                      >
                        <td className="num muted" style={{ whiteSpace: 'nowrap' }}>
                          <ChevronRight className={`row-chev${isOpen ? ' is-open' : ''}`} aria-hidden="true" />
                          {formatTime(entry.timestamp)}
                        </td>
                        <td>
                          <div className="cell-stack">
                            <span className="event-type">{eventLabel(entry.eventType, entry.payload)}</span>
                            <span className="cell-secondary">{describeEvent(entry.eventType, entry.payload, nameOf)}</span>
                          </div>
                        </td>
                        <td className="cell-secondary">{flow ? `${flow.producer} → ${flow.consumers.join(', ')}` : '—'}</td>
                        <td>
                          <Topic name={entry.topic} />
                        </td>
                        <td className="align-right id-tag">
                          {entry.partition}:{entry.offset}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="event-detail">
                          <td colSpan={5}>
                            <div className="event-detail-body">
                              <dl className="dl dl-compact">
                                <dt>Clave</dt>
                                <dd className="mono">{entry.key ?? '—'}</dd>
                                <dt>eventId</dt>
                                <dd className="mono">{String(entry.payload?.eventId ?? '—')}</dd>
                                <dt>Recibido</dt>
                                <dd>{new Date(entry.timestamp).toLocaleString('es-CO')}</dd>
                              </dl>
                              <CodeBlock value={entry.payload ?? entry.raw} language="json" label={`Mensaje ${entry.eventType ?? ''}`} />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
