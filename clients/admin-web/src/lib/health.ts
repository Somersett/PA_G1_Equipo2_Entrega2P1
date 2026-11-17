import type { SystemComponent, SystemStatus } from '../api/types';
import { describeError, isGatewayUnreachable } from './errors';

// Qué significa para quien usa el panel que cada componente esté caído. El estado lo arma el GraphQL
// Gateway (systemStatus): si el gateway responde, informa a todos los demás aunque estén caídos.

export const IMPACT: Record<string, string> = {
  gateway: 'Ninguna operación del panel puede completarse.',
  simulator: 'No se pueden registrar ni consultar miembros, membresías, pagos ni ingresos.',
  queries: 'La ficha consolidada no está disponible. El resto del panel funciona.',
  kafka: 'Los registros se guardan, pero activaciones, ingresos y ficha consolidada se ponen al día cuando Kafka vuelva.',
  postgres: 'No se pueden guardar ni consultar datos.',
};

/** Componentes cuya caída impide operar; los demás degradan una parte del panel. */
const CRITICAL = new Set(['gateway', 'simulator', 'postgres']);

export interface HealthProblem {
  /** Identifica el problema: si cambia, un aviso descartado vuelve a mostrarse. */
  key: string;
  tone: 'bad' | 'warn';
  title: string;
  hint: string;
  down: SystemComponent[];
}

export function diagnose(status: SystemStatus | undefined, error: unknown): HealthProblem | null {
  if (error) {
    const info = describeError(error);
    if (isGatewayUnreachable(error)) {
      return {
        key: `unreachable:${info.code}`,
        tone: 'bad',
        title: info.title,
        hint: `${info.hint ?? ''} El panel lo vuelve a intentar cada pocos segundos.`.trim(),
        down: [],
      };
    }
    // El gateway respondió con un error: el resto del panel puede funcionar.
    return {
      key: `status-error:${info.code}`,
      tone: 'warn',
      title: 'No se pudo consultar el estado del sistema',
      hint: info.hint ?? 'Se vuelve a consultar en unos segundos.',
      down: [],
    };
  }
  if (!status) return null;
  const down = status.components.filter((component) => component.status === 'DOWN');
  if (down.length === 0) return null;
  const critical = down.some((component) => CRITICAL.has(component.id));
  return {
    key: `down:${down.map((component) => component.id).sort().join(',')}`,
    tone: critical ? 'bad' : 'warn',
    title: down.length === 1 ? `${down[0].name} no responde` : `${down.length} componentes no responden`,
    hint: 'El panel se recupera solo cuando vuelvan. Si no vuelven en un minuto, ejecuta iniciar.bat o revisa: docker compose ps.',
    down,
  };
}
