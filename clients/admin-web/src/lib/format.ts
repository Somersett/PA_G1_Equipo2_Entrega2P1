// Formato de fechas, dinero y textos para Colombia (es-CO).

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat('es-CO');
const shortDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDateNoYear = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const dateTime = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const time = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export const formatMoney = (value: number) => money.format(value);
export const formatMoneyCompact = (value: number) => (value >= 1_000_000 ? compactMoney.format(value) : money.format(value));
export const formatInteger = (value: number) => integer.format(value);

/** 'yyyy-MM-dd' -> Date local a medianoche (sin corrimiento por zona horaria). */
export function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(value: string | null | undefined, withYear = true) {
  if (!value) return '—';
  const date = value.length === 10 ? parseLocalDate(value) : new Date(value);
  return (withYear ? shortDate : shortDateNoYear).format(date).replace('.', '');
}

export const formatLongDate = (date = new Date()) => {
  const text = longDate.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const formatDateTime = (value: string) => dateTime.format(new Date(value)).replace('.', '');
export const formatTime = (value: string) => time.format(new Date(value));

export function formatRelative(value: string, now = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'hace un momento';
  if (abs < 3_600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3_600), 'hour');
  if (abs < 86_400 * 30) return relative.format(Math.round(seconds / 86_400), 'day');
  return formatDate(value);
}

/** Fecha local de hoy en 'yyyy-MM-dd'. */
export function todayISO(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Días completos entre hoy y una fecha (positivo si es futura). */
export function daysUntil(value: string, from = new Date()) {
  const target = parseLocalDate(value).getTime();
  const today = parseLocalDate(todayISO(from)).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Fondos suaves para avatares: tonos cálidos y neutros, ninguno de los colores de estado.
const AVATAR_TINTS = ['#ecebe5', '#e8ecf3', '#efe8f1', '#e6efec', '#f3ece4', '#e9eef0', '#f1ebe9', '#eceee4'];
export const avatarTint = (id: number) => AVATAR_TINTS[Math.abs(id) % AVATAR_TINTS.length];

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${formatInteger(count)} ${count === 1 ? singular : pluralForm}`;
}

/** Normaliza texto para búsquedas sin tildes ni mayúsculas. */
export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
