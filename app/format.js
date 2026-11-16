// format.js — small pure formatters shared by every view.

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Money arrives as decimal strings ("713.50") or plain numbers (250).
export function money(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

// Win rates travel as micro-units: 973639 means 0.973639.
export function winRate(micro) {
  const n = Number(micro);
  if (!Number.isFinite(n)) return '—';
  return (n / 10000).toFixed(1) + '%';
}

export function parseTime(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? t : null;
}

// A bounty takes entries until its deadline — never mind the status field,
// which can keep saying "open" until results are published.
export function isOpen(comp, now = Date.now()) {
  const deadline = parseTime(comp?.deadline);
  return deadline !== null && deadline > now;
}

export function timeLeft(iso, now = Date.now()) {
  const t = parseTime(iso);
  if (t === null) return 'no deadline';
  const diff = t - now;
  if (diff <= 0) return 'closed';
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  if (mins > 0) return `${mins}m left`;
  return 'under a minute left';
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function dateTime(iso) {
  const t = parseTime(iso);
  return t === null ? '—' : DATE_FMT.format(t) + ' UTC';
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function dayOnly(iso) {
  const t = parseTime(iso);
  return t === null ? '—' : DAY_FMT.format(t);
}

export function bytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  return (v / (1024 * 1024)).toFixed(2) + ' MB';
}

// "tidy-meteor-25" -> "TM": a stable monogram for avatar fallbacks.
export function monogram(handle) {
  const parts = String(handle ?? '?').split(/[-_\s]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]).join('');
  return (letters || '?').toUpperCase();
}
