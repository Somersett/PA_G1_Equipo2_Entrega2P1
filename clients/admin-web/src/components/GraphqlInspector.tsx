import { Braces, ChevronRight } from 'lucide-react';
import { MEMBER_OVERVIEW_QUERY } from '../api/graphql';
import { CodeBlock } from './ui';

/** Muestra la consulta GraphQL real y la respuesta tal como la devolvió el gateway. */
export function GraphqlInspector({
  memberId,
  limit = 10,
  raw,
  durationMs,
  defaultOpen = false,
}: {
  memberId: number;
  limit?: number;
  raw: unknown;
  durationMs?: number;
  defaultOpen?: boolean;
}) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <ChevronRight className="chev" aria-hidden="true" />
        <Braces aria-hidden="true" />
        Consulta GraphQL y respuesta
        {durationMs !== undefined ? (
          <span className="muted num" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {durationMs} ms
          </span>
        ) : null}
      </summary>
      <div className="disclosure-body">
        <div className="code-caption">
          <span>POST /graphql</span>
          <span className="muted">variables: {JSON.stringify({ id: memberId, limit })}</span>
        </div>
        <CodeBlock value={MEMBER_OVERVIEW_QUERY} language="graphql" label="Consulta GraphQL" />
        <div className="code-caption">
          <span>Respuesta del GraphQL Gateway</span>
        </div>
        <CodeBlock value={raw} language="json" label="Respuesta JSON" />
      </div>
    </details>
  );
}
