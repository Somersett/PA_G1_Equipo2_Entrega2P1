// Cliente HTTP del panel. Todo pasa por el GraphQL Gateway en el mismo origen (/api/graphql), que resuelve
// contra Consolidated Queries y contra Members, Memberships, Payments y Access Control. El panel no conoce la
// dirección de ningún servicio: si el gateway no está, no hay otro camino.

export interface ApiErrorDetails {
  /** extensions.classification del gateway (BAD_REQUEST, UPSTREAM_UNAVAILABLE...). */
  classification?: string;
  /** Servicio que falló, según el gateway: GYM_PLATFORM o CONSOLIDATED_QUERIES. */
  upstream?: string;
}

export class ApiError extends Error {
  readonly status: number;
  /** Código más específico disponible: el del servicio (extensions.code), el del gateway o el del panel. */
  readonly code: string;
  readonly classification?: string;
  readonly upstream?: string;

  constructor(status: number, code: string, message: string, details: ApiErrorDetails = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.classification = details.classification;
    this.upstream = details.upstream;
  }
}

/** Más que el timeout de nginx hacia el gateway (15 s): normalmente responde nginx antes con 504. */
const REQUEST_TIMEOUT_MS = 20_000;

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(value: string | null) {
  token = value;
}

export function getToken() {
  return token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function encodeBasic(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export interface RequestOptions {
  /** Token explícito (para validar credenciales antes de guardarlas). */
  token?: string;
  /** No dispara el cierre de sesión global ante un 401. */
  silent401?: boolean;
}

async function parse(response: Response): Promise<{ ok: boolean; value: unknown }> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return { ok: false, value: null };
  }
  if (!text) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

/** POST /api/graphql con HTTP Basic. Los errores GraphQL (HTTP 200) los interpreta graphql.ts. */
export async function postGraphql<T>(body: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const credential = options.token ?? token;
  if (credential) headers.Authorization = `Basic ${credential}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('/api/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'TIMEOUT', 'El sistema tardó demasiado en responder.');
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new ApiError(0, 'OFFLINE', 'Este equipo no tiene conexión de red.');
    }
    throw new ApiError(0, 'NETWORK', 'No hay conexión con el panel.');
  } finally {
    clearTimeout(timer);
  }

  const parsed = await parse(response);
  const data = parsed.value as { code?: string; message?: string } | null;

  if (response.status === 401) {
    if (!options.silent401) onUnauthorized?.();
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuario o contraseña incorrectos.');
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    // nginx responde GATEWAY_UNAVAILABLE o GATEWAY_TIMEOUT cuando no logra hablar con el gateway.
    const code = response.status === 504 || data?.code === 'GATEWAY_TIMEOUT' ? 'GATEWAY_TIMEOUT' : 'GATEWAY_UNAVAILABLE';
    throw new ApiError(response.status, code, data?.message ?? 'El GraphQL Gateway no responde.');
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.code ?? `HTTP_${response.status}`,
      data?.message ?? `La solicitud falló (HTTP ${response.status}).`,
    );
  }
  if (!parsed.ok || data === null || typeof data !== 'object') {
    throw new ApiError(response.status, 'BAD_RESPONSE', 'El gateway respondió algo que el panel no entiende.');
  }
  return data as T;
}
