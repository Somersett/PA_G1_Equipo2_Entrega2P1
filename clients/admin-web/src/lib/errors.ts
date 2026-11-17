import { ApiError } from '../api/client';

// Catálogo de errores del panel: convierte cualquier fallo (de red, del gateway, de un servicio o del propio
// panel) en un aviso corto con qué pasó y qué se puede hacer. Las pantallas no redactan mensajes de error:
// todas usan describeError() para que el mismo problema se explique igual en todas partes.

export interface ErrorInfo {
  /** Qué pasó, en pocas palabras. */
  title: string;
  /** Detalle legible (p. ej. el mensaje del servicio que rechazó el comando). */
  message?: string;
  /** Posible solución. */
  hint?: string;
  /** 'warn' para problemas transitorios o esperables; 'bad' para fallos. */
  tone: 'bad' | 'warn';
  /** Vale la pena reintentar sin cambiar nada (fallas de red o de un servicio, no datos inválidos). */
  retryable: boolean;
  code: string;
}

const SERVICES: Record<string, string> = {
  GYM_PLATFORM: 'Members, Memberships, Payments y Access Control',
  CONSOLIDATED_QUERIES: 'Consolidated Queries',
};

const STILL_DOWN = 'Si sigue igual, ejecuta iniciar.bat o revisa los contenedores con: docker compose ps.';

type Entry = Omit<ErrorInfo, 'code' | 'message'> & { keepMessage?: boolean };

/** Rechazos de los servicios (extensions.code): el mensaje del servicio se conserva, el título lo resume. */
const DOMAIN: Record<string, Entry> = {
  DOCUMENT_ALREADY_REGISTERED: {
    title: 'Ese documento ya está registrado',
    hint: 'Busca a la persona en Miembros: no hace falta registrarla de nuevo.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  MEMBER_NOT_FOUND: {
    title: 'El miembro no existe',
    hint: 'Revisa el número del miembro o regístralo primero.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  PLAN_NOT_FOUND: {
    title: 'El plan ya no existe',
    hint: 'Elige otro plan de la lista.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  PLAN_NAME_TAKEN: {
    title: 'Ya hay un plan con ese nombre',
    hint: 'Usa otro nombre o asigna el plan existente.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  MEMBERSHIP_NOT_FOUND: {
    title: 'La membresía no existe',
    hint: 'Puede que los datos se hayan reiniciado. Recarga la lista y vuelve a intentar.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  MEMBERSHIP_ALREADY_OPEN: {
    title: 'El miembro ya tiene una membresía abierta',
    hint: 'Registra el pago de la pendiente, o espera a que la activa venza para asignar otra.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  MEMBERSHIP_NOT_PENDING: {
    title: 'La membresía ya no espera pago',
    hint: 'Ya se pagó o venció. Revisa su estado en Membresías.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  MEMBERSHIP_NOT_ACTIVE: {
    title: 'La membresía no está activa',
    hint: 'Solo se puede vencer una membresía activa.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  PAYMENT_ALREADY_REGISTERED: {
    title: 'Esa membresía ya tiene un pago',
    hint: 'No hace falta pagarla otra vez: se activa sola en unos segundos.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  AMOUNT_BELOW_PLAN_PRICE: {
    title: 'El monto no cubre el plan',
    hint: 'Escribe un monto igual o mayor que el precio del plan.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
  PAYMENT_IN_FUTURE: {
    title: 'La fecha del pago está en el futuro',
    hint: 'Usa la fecha y la hora reales del pago.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
};

/** Fallas de infraestructura: el mensaje técnico se reemplaza por una explicación. */
const INFRASTRUCTURE: Record<string, Entry> = {
  OFFLINE: {
    title: 'Este equipo no tiene conexión de red',
    hint: 'Revisa la conexión; el panel vuelve a intentarlo solo.',
    tone: 'bad',
    retryable: true,
  },
  NETWORK: {
    title: 'No hay conexión con el panel',
    hint: `Revisa que Docker Desktop esté abierto y que el sistema esté en marcha (iniciar.bat). ${STILL_DOWN}`,
    tone: 'bad',
    retryable: true,
  },
  TIMEOUT: {
    title: 'El sistema tardó demasiado en responder',
    hint: 'Vuelve a intentar. Si se repite, algún servicio puede estar sobrecargado: revisa el estado del sistema.',
    tone: 'warn',
    retryable: true,
  },
  GATEWAY_UNAVAILABLE: {
    title: 'El GraphQL Gateway no responde',
    hint: `Puede estar arrancando o reiniciándose: espera unos segundos. ${STILL_DOWN}`,
    tone: 'bad',
    retryable: true,
  },
  GATEWAY_TIMEOUT: {
    title: 'El GraphQL Gateway no responde a tiempo',
    hint: `Puede estar caído, reiniciándose o sobrecargado: espera unos segundos y vuelve a intentar. ${STILL_DOWN}`,
    tone: 'bad',
    retryable: true,
  },
  UNAUTHORIZED: {
    title: 'Usuario o contraseña incorrectos',
    hint: 'La contraseña está en infrastructure/.env, en la línea GATEWAY_CLIENT_PASSWORD.',
    tone: 'bad',
    retryable: false,
  },
  STARTING: {
    title: 'Los servicios están arrancando',
    hint: 'Espera unos segundos: el panel vuelve a intentarlo solo.',
    tone: 'warn',
    retryable: true,
  },
  DATABASE_UNAVAILABLE: {
    title: 'La base de datos no responde',
    hint: `Lo ya guardado no se pierde y nada quedó a medias. Vuelve a intentar cuando PostgreSQL esté en línea. ${STILL_DOWN}`,
    tone: 'bad',
    retryable: true,
  },
  INTERNAL_ERROR: {
    title: 'Error inesperado en el gateway',
    hint: 'Vuelve a intentar. Si se repite, revisa el registro con: docker compose logs graphql-gateway.',
    tone: 'bad',
    retryable: true,
  },
  BAD_RESPONSE: {
    title: 'Respuesta inesperada del gateway',
    hint: 'Vuelve a intentar. Si se repite, recarga la página.',
    tone: 'bad',
    retryable: true,
  },
  ValidationError: {
    title: 'El panel y el gateway no coinciden',
    hint: 'Recarga la página con Ctrl+F5. Si persiste, ejecuta iniciar.bat para que ambos queden en la misma versión.',
    tone: 'bad',
    retryable: false,
  },
  InvalidSyntax: {
    title: 'El panel envió una consulta inválida',
    hint: 'Recarga la página con Ctrl+F5.',
    tone: 'bad',
    retryable: false,
  },
  ACTIVATION_TIMEOUT: {
    title: 'La membresía todavía no se activa',
    hint:
      'El pago quedó guardado. Suele pasar cuando Kafka o el simulador están caídos o lentos: la membresía se activará sola al recuperarse, sin registrar el pago de nuevo. Revisa el estado del sistema y la pantalla Eventos Kafka.',
    tone: 'warn',
    retryable: false,
    keepMessage: true,
  },
};

/** Motivos de una caída que informa el propio servicio en su 503 (extensions.code). */
const SERVICE_REASONS = new Set(['STARTING', 'DATABASE_UNAVAILABLE']);

function serviceName(upstream?: string) {
  return (upstream && SERVICES[upstream]) || 'Un servicio de la plataforma';
}

// CIRCUIT_OPEN (el gateway pausó las llamadas a un servicio caído) se explica igual que cualquier caída de
// ese servicio: a quien usa el panel solo le importa qué no funciona y qué hacer.
function upstreamUnavailable(error: ApiError): ErrorInfo {
  if (error.upstream === 'CONSOLIDATED_QUERIES') {
    return {
      title: 'La vista consolidada no está disponible',
      message: 'Consolidated Queries no responde; el resto del panel sigue funcionando.',
      hint: 'Se actualiza sola cuando el servicio vuelva, sin perder eventos: los lee de Kafka al recuperarse.',
      tone: 'warn',
      retryable: true,
      code: error.code,
    };
  }
  return {
    title: `${serviceName(error.upstream)} no responde`,
    hint: `El simulador de servicios puede estar reiniciándose: espera unos segundos y vuelve a intentar. ${STILL_DOWN}`,
    tone: 'bad',
    retryable: true,
    code: error.code,
  };
}

function fromEntry(entry: Entry, code: string, message?: string): ErrorInfo {
  const { keepMessage, ...info } = entry;
  return { ...info, code, message: keepMessage ? message : undefined };
}

export function describeError(error: unknown): ErrorInfo {
  if (error instanceof ApiError) {
    const domain = DOMAIN[error.code];
    if (domain) return fromEntry(domain, error.code, error.message);

    if (error.classification === 'UPSTREAM_UNAVAILABLE') {
      // Solo estos códigos del servicio explican mejor la caída que el servicio en sí; cualquier otro (p. ej.
      // un INTERNAL_ERROR del simulador) es una falla de ese servicio, no del gateway.
      const reason = SERVICE_REASONS.has(error.code) ? INFRASTRUCTURE[error.code] : undefined;
      return reason ? fromEntry(reason, error.code, error.message) : upstreamUnavailable(error);
    }

    const infrastructure = INFRASTRUCTURE[error.code];
    if (infrastructure) return fromEntry(infrastructure, error.code, error.message);

    switch (error.classification) {
      case 'UPSTREAM_TIMEOUT':
        return {
          title: `${serviceName(error.upstream)} tardó demasiado en responder`,
          hint: 'Vuelve a intentar en unos segundos. Si se repite, revisa el estado del sistema.',
          tone: 'warn',
          retryable: true,
          code: error.code,
        };
      case 'BAD_REQUEST':
        return { title: 'Datos no válidos', message: error.message, hint: 'Revisa los datos e inténtalo de nuevo.', tone: 'warn', retryable: false, code: error.code };
      case 'NOT_FOUND':
        return { title: 'No se encontró', message: error.message, tone: 'warn', retryable: false, code: error.code };
      case 'CONFLICT':
        return { title: 'La operación no se puede hacer ahora', message: error.message, tone: 'warn', retryable: false, code: error.code };
      default:
        break;
    }
    const byClassification = error.classification ? INFRASTRUCTURE[error.classification] : undefined;
    if (byClassification) return fromEntry(byClassification, error.code, error.message);

    if (error.status >= 500) {
      return { title: 'El sistema respondió con un error', message: error.message, hint: 'Vuelve a intentar en unos segundos.', tone: 'bad', retryable: true, code: error.code };
    }
    return { title: 'No se pudo completar la operación', message: error.message, tone: 'bad', retryable: false, code: error.code };
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  return {
    title: 'Algo salió mal en el panel',
    message,
    hint: 'Vuelve a intentar. Si se repite, recarga la página.',
    tone: 'bad',
    retryable: true,
    code: 'CLIENT_ERROR',
  };
}

/** El panel no logra hablar con el gateway (no es un servicio detrás del gateway el que falla). */
export function isGatewayUnreachable(error: unknown) {
  return (
    error instanceof ApiError &&
    ['OFFLINE', 'NETWORK', 'TIMEOUT', 'GATEWAY_UNAVAILABLE', 'GATEWAY_TIMEOUT'].includes(error.code)
  );
}

/** Código del error si es un ApiError. */
export const errorCode = (error: unknown) => (error instanceof ApiError ? error.code : undefined);

/**
 * Asigna un rechazo del servicio al campo del formulario que lo causó, por el inicio de su mensaje
 * ("El documento ...", "El teléfono ..."). Devuelve null si no corresponde a ningún campo.
 */
export function fieldOf<F extends string>(error: unknown, prefixes: Record<F, string[]>): F | null {
  if (!(error instanceof ApiError) || error.classification !== 'BAD_REQUEST') return null;
  const message = error.message.toLowerCase();
  for (const [field, starts] of Object.entries(prefixes) as [F, string[]][]) {
    if (starts.some((start) => message.startsWith(start.toLowerCase()))) return field;
  }
  return null;
}
