import { timingSafeEqual } from 'node:crypto';
import { log } from './log.js';

/** Error con la forma ErrorResponse { code, message } del contrato OpenAPI. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new ApiError(400, 'BAD_REQUEST', message);
export const notFound = (code, message) => new ApiError(404, code, message);
export const conflict = (code, message) => new ApiError(409, code, message);
export const unprocessable = (code, message) => new ApiError(422, code, message);

/** Valida el cuerpo contra los campos permitidos (additionalProperties: false en el contrato). */
export function readBody(req, allowed) {
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('El cuerpo de la solicitud debe ser un objeto JSON.');
  }
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw badRequest(`Campos no permitidos: ${unknown.join(', ')}.`);
  }
  return body;
}

export function requiredText(body, field, label, { min = 1, max = 120 } = {}) {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw badRequest(`${label} es obligatorio.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw badRequest(`${label} debe tener entre ${min} y ${max} caracteres.`);
  }
  if (trimmed.includes('\u0000')) {
    throw badRequest(`${label} contiene caracteres no válidos.`);
  }
  return trimmed;
}

export function positiveId(value, label) {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw badRequest(`${label} debe ser un número entero mayor o igual que 1.`);
  }
  return id;
}

export function nonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw badRequest(`${label} debe ser un número mayor o igual que 0.`);
  }
  return value;
}

export function dateTime(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw badRequest(`${label} debe ser una fecha y hora ISO 8601 con zona horaria.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(`${label} no es una fecha válida.`);
  }
  return parsed;
}

function safeEqual(a, b) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * HTTP Basic (RNF-07). No se envía WWW-Authenticate para que el navegador no muestre su diálogo nativo:
 * el panel tiene su propia pantalla de ingreso.
 */
export function basicAuth({ username, password }) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, encoded] = header.split(' ');
    if (scheme?.toLowerCase() === 'basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator > 0) {
        const user = decoded.slice(0, separator);
        const pass = decoded.slice(separator + 1);
        // Se comparan ambos siempre para no revelar cuál de los dos falló.
        const validUser = safeEqual(user, username);
        const validPass = safeEqual(pass, password);
        if (validUser && validPass) {
          return next();
        }
      }
    }
    next(new ApiError(401, 'UNAUTHORIZED', 'Usuario o contraseña incorrectos.'));
  };
}

// Códigos de red de Node y SQLSTATE de PostgreSQL que indican que la base no está disponible (clase 08:
// conexión; 57P01-57P03: servidor apagándose o arrancando; 57014: consulta cancelada por statement_timeout).
const DATABASE_DOWN_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  '57P01',
  '57P02',
  '57P03',
  '57014',
]);
const DATABASE_DOWN_MESSAGES = [
  'Connection terminated',
  'timeout exceeded when trying to connect',
  'Client has encountered a connection error',
  'Connection terminated unexpectedly',
];

/** El error viene de no poder hablar con PostgreSQL (y no de una regla de negocio ni de un bug). */
export function isDatabaseUnavailable(error) {
  if (!error) return false;
  if (DATABASE_DOWN_CODES.has(error.code) || String(error.code ?? '').startsWith('08')) return true;
  const message = String(error.message ?? '');
  return DATABASE_DOWN_MESSAGES.some((fragment) => message.includes(fragment));
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'BAD_REQUEST', message: 'El cuerpo de la solicitud no es JSON válido.' });
  }
  if (isDatabaseUnavailable(error)) {
    // 503 con código propio: el gateway lo informa como UPSTREAM_UNAVAILABLE con extensions.code y el panel
    // explica que el problema es la base de datos. Nada quedó a medias: la transacción se revirtió.
    log.warn(`${req.method} ${req.originalUrl}: la base de datos no responde (${error.code ?? error.message})`);
    return res
      .status(503)
      .set('Retry-After', '5')
      .json({ code: 'DATABASE_UNAVAILABLE', message: 'La base de datos no responde. Intente en unos segundos.' });
  }
  log.error(`${req.method} ${req.originalUrl} falló: ${error?.stack ?? error}`);
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Error interno del simulador.' });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ code: 'NOT_FOUND', message: `No existe la ruta ${req.method} ${req.path}.` });
}
