// Cliente mínimo del GraphQL Gateway para las herramientas de demostración y medición.
// Usa la misma entrada que el panel: HTTP Basic contra /graphql.

export const ENDPOINT = process.env.GATEWAY_URL ?? 'http://graphql-gateway:8080/graphql';
const user = process.env.GATEWAY_CLIENT_USERNAME ?? '';
const pass = process.env.GATEWAY_CLIENT_PASSWORD ?? '';
const AUTH = 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ejecuta una operación GraphQL. Devuelve { data, errors } o lanza un error si la respuesta no es HTTP 200. */
export async function gql(query, variables = {}) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401) throw new Error('El gateway rechazó la credencial (401). Revise GATEWAY_CLIENT_* en infrastructure/.env.');
  if (response.status !== 200) throw new Error(`El gateway respondió HTTP ${response.status}.`);
  return response.json();
}

/** Igual que gql, pero lanza un error si la respuesta trae errores GraphQL. */
export async function gqlOk(query, variables = {}) {
  const { data, errors } = await gql(query, variables);
  if (errors?.length) {
    const error = new Error(errors.map((e) => `${e.extensions?.code ?? e.extensions?.classification ?? 'ERROR'}: ${e.message}`).join('; '));
    error.code = errors[0].extensions?.code;
    throw error;
  }
  return data;
}

/** Espera a que el gateway informe todos los componentes en línea. */
export async function waitForPlatform(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'sin respuesta';
  while (Date.now() < deadline) {
    try {
      const { data } = await gql('{ systemStatus { components { id status } } }');
      const components = data?.systemStatus?.components ?? [];
      last = components.map((c) => `${c.id}=${c.status}`).join(' ');
      if (components.length && components.every((c) => c.status === 'UP')) return;
    } catch (error) {
      last = error.message;
    }
    await sleep(2_000);
  }
  throw new Error(`La plataforma no quedó en línea a tiempo (${last}). Ejecute primero iniciar.bat o bash iniciar.sh.`);
}

/** Espera a que una membresía llegue al estado indicado (la activación viaja por Kafka). */
export async function waitForMembershipStatus(id, status, timeoutMs = 30_000, pollMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await gqlOk('query($id: Int!) { membership(id: $id) { status } }', { id });
    if (data.membership?.status === status) return true;
    await sleep(pollMs);
  }
  return false;
}
