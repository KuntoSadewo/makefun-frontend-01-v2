// main.js — the router and the page's small always-on behaviours.
//
// Routes are hash routes, one per surface:
//   #/                              the bounty board
//   #/bounty/<slug>                 a bounty's page
//   #/bounty/<slug>/leaderboard    its leaderboard
//   #/u/<handle>                    a public profile
//
// The views module is loaded lazily with import(), so the first load is just
// this file, the API cache and the formatters. window.__shotReady is false
// while a route loads and true once its data has rendered, which is the
// signal the screenshot script waits for.

import { timeLeft, monogram } from './format.js';

window.__shotReady = false;

const mount = document.querySelector('#view');
let viewsPromise = null;

function loadViews() {
  if (!viewsPromise) viewsPromise = import('./views.js');
  return viewsPromise;
}

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: 'board' };
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') {
    return { name: 'leaderboard', slug: parts[1] };
  }
  if (parts[0] === 'bounty' && parts[1]) return { name: 'bounty', slug: parts[1] };
  if (parts[0] === 'u' && parts[1]) return { name: 'profile', handle: parts[1] };
  return { name: 'board' };
}

function markNav(route) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.toggleAttribute('aria-current', a.dataset.nav === route.name);
  });
}

let routeSerial = 0;

async function render() {
  const route = parseRoute();
  const serial = ++routeSerial;
  window.__shotReady = false;
  markNav(route);
  try {
    const views = await loadViews();
    if (serial !== routeSerial) return;
    if (route.name === 'board') await views.boardView(mount);
    else if (route.name === 'bounty') await views.bountyView(mount, route.slug);
    else if (route.name === 'leaderboard') await views.leaderboardView(mount, route.slug);
    else if (route.name === 'profile') await views.profileView(mount, route.handle);
  } catch (err) {
    if (serial !== routeSerial) return;
    try {
      const views = await loadViews();
      views.errorView(mount, 'Something did not load', err);
    } catch {
      mount.textContent = 'Something did not load: ' + (err?.message ?? err);
    }
  }
  if (serial === routeSerial) {
    window.__shotReady = true;
    mount.focus({ preventScroll: true });
  }
}

// Countdowns tick in place: only the time-left labels change, the page is
// never rebuilt for a clock.
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    el.textContent = timeLeft(el.dataset.deadline, now);
  });
}, 20000);

// Avatars that fail to load (a handle with no picture yet) fall back to a
// monogram block. Error events do not bubble, so listen in the capture phase.
document.addEventListener(
  'error',
  (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('avatar')) return;
    const span = document.createElement('span');
    span.className = img.className + ' avatar-fallback';
    span.textContent = monogram(img.dataset.handle ?? '?');
    span.setAttribute('aria-hidden', 'true');
    img.replaceWith(span);
  },
  true,
);

// The header's jump box goes straight to a profile.
document.querySelector('#jump').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#jump-input');
  const handle = input.value.trim().replace(/^@/, '');
  if (handle) location.hash = '#/u/' + encodeURIComponent(handle);
});

window.addEventListener('hashchange', render);
render();
