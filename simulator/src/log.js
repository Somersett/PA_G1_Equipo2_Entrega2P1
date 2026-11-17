// Logs de una línea con marca de tiempo, suficientes para seguir el flujo en `docker compose logs` (RNF-08).

function write(level, message) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${message}`;
  if (level === 'ERROR' || level === 'WARN') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info: (message) => write('INFO', message),
  warn: (message) => write('WARN', message),
  error: (message) => write('ERROR', message),
};
