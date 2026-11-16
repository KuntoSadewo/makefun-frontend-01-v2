// api.js — the only module that talks to make.fun.
//
// Every answer is cached in memory together with its ETag. The API binds its
// ETags to the minute: revalidating inside the same minute answers 304 and
// costs no body, and once the minute turns the same tag earns a fresh 200.
// So a view can simply ask again — revisits and the board's auto-refresh stay
// cheap, and repeat visits inside a minute are nearly free.

export const API_ORIGIN = 'https://make.fun';

const cache = new Map(); // path -> { etag, body }
const inflight = new Map(); // path -> Promise<body>

async function fetchJson(path) {
  const hit = cache.get(path);
  const headers = {};
  if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
  const res = await fetch(API_ORIGIN + path, { headers });
  if (res.status === 304 && hit) return hit.body;
  if (!res.ok) throw new Error(`make.fun answered ${res.status} for ${path}`);
  const body = await res.json();
  cache.set(path, { etag: res.headers.get('etag'), body });
  return body;
}

// Concurrent callers for the same path share one request.
export function getJson(path) {
  let pending = inflight.get(path);
  if (!pending) {
    pending = fetchJson(path).finally(() => inflight.delete(path));
    inflight.set(path, pending);
  }
  return pending;
}

export function listCompetitions(query) {
  const params = new URLSearchParams(query);
  return getJson(`/api/competitions?${params}`);
}

export function getCompetition(slug) {
  return getJson(`/api/competitions/${encodeURIComponent(slug)}`);
}

export function getLeaderboard(slug) {
  return getJson(`/api/competitions/${encodeURIComponent(slug)}/leaderboard`);
}

export function getProfile(handle) {
  return getJson(`/api/profiles/${encodeURIComponent(handle)}`);
}

// API image paths are site-relative; make them absolute for <img src>.
export function apiUrl(path) {
  if (!path) return null;
  return path.startsWith('http') ? path : API_ORIGIN + path;
}
