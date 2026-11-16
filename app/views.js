// views.js — the four surfaces of the app: the bounty board, a bounty's
// page, its leaderboard, and a public profile. Each view renders into the
// shared <main> element and wires up its own controls; long lists are
// paginated in place and countdowns tick without re-rendering the page.

import {
  getCompetition,
  getLeaderboard,
  getProfile,
  listCompetitions,
  apiUrl,
} from './api.js';
import {
  bytes,
  count,
  dateTime,
  dayOnly,
  escapeHtml,
  isOpen,
  money,
  timeLeft,
  winRate,
} from './format.js';
import { renderMarkdown } from './markdown.js';

const PAGE_SIZE = 50;

function avatarImg(imagePath, handle, sizeClass) {
  const src = apiUrl(imagePath) ?? apiUrl(`/api/profiles/${encodeURIComponent(handle)}/picture.png`);
  return `<img class="avatar ${sizeClass}" src="${escapeHtml(src)}" data-handle="${escapeHtml(handle)}" alt="" crossorigin="anonymous" loading="lazy">`;
}

function statusPill(comp, now) {
  if (isOpen(comp, now)) {
    return `<span class="pill pill-open">Open · <span data-deadline="${escapeHtml(comp.deadline)}">${timeLeft(comp.deadline, now)}</span></span>`;
  }
  return '<span class="pill pill-closed">Closed</span>';
}

export function errorView(mount, title, err) {
  mount.innerHTML = `
    <section class="panel error-panel">
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${escapeHtml(err?.message ?? String(err))}</p>
      <p><a href="#/">Back to the board</a></p>
    </section>`;
}

// ---------------------------------------------------------------- board

function bountyCard(comp, now) {
  const fee =
    comp.entryFeeUsd !== null && comp.entryFeeUsd !== undefined
      ? `<span class="fact"><span class="fact-label">Entry fee</span> ${money(comp.entryFeeUsd)}</span>`
      : '<span class="fact"><span class="fact-label">Entry fee</span> Free</span>';
  return `
  <article class="card" data-search="${escapeHtml((comp.title + ' ' + comp.slug).toLowerCase())}">
    <div class="card-top">
      <h2 class="card-title"><a href="#/bounty/${escapeHtml(comp.slug)}">${escapeHtml(comp.title)}</a></h2>
      ${statusPill(comp, now)}
    </div>
    <p class="card-summary">${escapeHtml(comp.summary ?? '')}</p>
    <div class="card-facts">
      <span class="fact fact-pot"><span class="fact-label">Live pot</span> ${money(comp.potUsd ?? comp.rewardAmount)}</span>
      ${fee}
      <span class="fact"><span class="fact-label">Entries</span> ${count(comp.submissionCount)}</span>
      <span class="fact"><span class="fact-label">Deadline</span> ${dateTime(comp.deadline)}</span>
    </div>
    <div class="card-links">
      <a href="#/bounty/${escapeHtml(comp.slug)}">Bounty page</a>
      <a href="#/bounty/${escapeHtml(comp.slug)}/leaderboard">Leaderboard</a>
      ${comp.category ? `<span class="chip">${escapeHtml(comp.category)}</span>` : ''}
    </div>
  </article>`;
}

export async function boardView(mount) {
  mount.innerHTML = `
    <section class="page-head">
      <h1>Live bounties</h1>
      <p class="lede">Every bounty make.fun is running, with its live pot — the
      base reward plus the entry fees paid in so far. Pots and counts refresh
      on their own; revalidation inside the minute is answered from the ETag
      cache, so the refresh costs almost nothing.</p>
      <div class="board-tools">
        <label class="visually-hidden" for="board-search">Filter bounties</label>
        <input id="board-search" type="search" placeholder="Filter by name…" autocomplete="off">
        <span id="board-count" class="muted" role="status"></span>
      </div>
    </section>
    <div id="board-list"><p class="muted">Loading bounties…</p></div>
    <div id="board-more"></div>`;

  const listEl = mount.querySelector('#board-list');
  const moreEl = mount.querySelector('#board-more');
  const countEl = mount.querySelector('#board-count');
  const searchEl = mount.querySelector('#board-search');
  const items = [];
  let cursor = null;

  const render = () => {
    const now = Date.now();
    const open = items
      .filter((c) => isOpen(c, now))
      .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
    const closed = items
      .filter((c) => !isOpen(c, now))
      .sort((a, b) => Date.parse(b.deadline) - Date.parse(a.deadline));
    listEl.innerHTML =
      open.map((c) => bountyCard(c, now)).join('') +
      (closed.length
        ? `<h2 class="section-title">Closed — results pending</h2>` +
          closed.map((c) => bountyCard(c, now)).join('')
        : '');
    applyFilter();
  };

  const applyFilter = () => {
    const q = searchEl.value.trim().toLowerCase();
    let shown = 0;
    listEl.querySelectorAll('.card').forEach((card) => {
      const hit = !q || card.dataset.search.includes(q);
      card.hidden = !hit;
      if (hit) shown++;
    });
    countEl.textContent = q ? `${shown} of ${items.length} shown` : `${items.length} bounties`;
  };
  searchEl.addEventListener('input', applyFilter);

  const loadPage = async () => {
    const query = { status: 'open', limit: '100' };
    if (cursor) query.cursor = cursor;
    const page = await listCompetitions(query);
    items.push(...(page.items ?? []));
    cursor = page.next_cursor ?? null;
    render();
    moreEl.innerHTML = cursor
      ? '<button id="board-load-more" type="button">Load more bounties</button>'
      : '';
    const btn = moreEl.querySelector('#board-load-more');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Loading…';
        try {
          await loadPage();
        } catch {
          btn.disabled = false;
          btn.textContent = 'Load more bounties';
        }
      });
    }
  };

  await loadPage();

  // The board refreshes itself once a minute; the ETag cache turns most of
  // those refreshes into 304s, and only the list element is re-rendered.
  const timer = setInterval(async () => {
    if (!mount.isConnected || !location.hash.startsWith('#/') || location.hash !== '#/') {
      clearInterval(timer);
      return;
    }
    try {
      const page = await listCompetitions({ status: 'open', limit: '100' });
      items.length = 0;
      items.push(...(page.items ?? []));
      cursor = page.next_cursor ?? null;
      render();
    } catch {
      /* keep the last good board */
    }
  }, 60000);
}

// ---------------------------------------------------------------- bounty

function rewardsTable(comp) {
  const rows = comp.rewardsNow ?? [];
  if (!rows.length) return '';
  const body = rows
    .map(
      (r) => `<tr>
        <td class="num">${escapeHtml(r.place)}</td>
        <td class="num">${money(r.baseUsd)}</td>
        <td class="num">${money(r.feeShareUsd)}</td>
        <td class="num strong">${money(r.amountUsd)}</td>
      </tr>`,
    )
    .join('');
  return `
    <section class="panel">
      <h2>Rewards — live pot ${money(comp.potUsd)}</h2>
      <p class="muted">Base rewards plus each place's share of the entry fees
      paid so far (${count(comp.entryFeePayers)} payers, ${money(comp.entryFeesUsd)} in fees).</p>
      <div class="table-scroll"><table>
        <thead><tr><th>Place</th><th>Base</th><th>Fee share</th><th>Total now</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </section>`;
}

export async function bountyView(mount, slug) {
  const comp = await getCompetition(slug);
  const now = Date.now();
  const rules =
    comp.rules && comp.rules !== comp.description
      ? `<section class="panel prose"><h2>Rules</h2>${renderMarkdown(comp.rules)}</section>`
      : '';
  const skills = (comp.skills ?? [])
    .map((s) => `<span class="chip">${escapeHtml(s)}</span>`)
    .join(' ');
  mount.innerHTML = `
    <article>
      <section class="page-head">
        <p class="crumbs"><a href="#/">Bounties</a> / ${escapeHtml(comp.slug)}</p>
        <h1>${escapeHtml(comp.title)}</h1>
        <p class="lede">${escapeHtml(comp.summary ?? '')}</p>
        <div class="stat-row">
          <div class="stat"><span class="stat-label">Live pot</span><span class="stat-value">${money(comp.potUsd ?? comp.rewardAmount)}</span></div>
          <div class="stat"><span class="stat-label">Entry fee</span><span class="stat-value">${comp.entryFeeUsd ? money(comp.entryFeeUsd) : 'Free'}</span></div>
          <div class="stat"><span class="stat-label">Entries</span><span class="stat-value">${count(comp.submissionCount)}</span></div>
          <div class="stat"><span class="stat-label">Status</span><span class="stat-value">${isOpen(comp, now) ? 'Open' : 'Closed'}</span></div>
          <div class="stat"><span class="stat-label">Time left</span><span class="stat-value" data-deadline="${escapeHtml(comp.deadline)}">${timeLeft(comp.deadline, now)}</span></div>
        </div>
        <p class="actions">
          <a class="button" href="#/bounty/${escapeHtml(comp.slug)}/leaderboard">View the leaderboard</a>
          <a class="button button-ghost" href="https://make.fun/c/${escapeHtml(comp.slug)}" target="_blank" rel="noopener">Open on make.fun</a>
        </p>
        ${skills ? `<p class="chips">${skills}</p>` : ''}
      </section>
      <section class="panel">
        <h2>Dates</h2>
        <dl class="dates">
          <div><dt>Published</dt><dd>${dateTime(comp.publishedAt)}</dd></div>
          ${comp.opensAt ? `<div><dt>Opens</dt><dd>${dateTime(comp.opensAt)}</dd></div>` : ''}
          <div><dt>Deadline</dt><dd>${dateTime(comp.deadline)}</dd></div>
          ${comp.resolvedAt ? `<div><dt>Resolved</dt><dd>${dateTime(comp.resolvedAt)}</dd></div>` : ''}
          <div><dt>Sponsor</dt><dd>${escapeHtml(comp.sponsor?.name ?? 'make.fun')}</dd></div>
          ${comp.category ? `<div><dt>Category</dt><dd>${escapeHtml(comp.category)}</dd></div>` : ''}
        </dl>
      </section>
      ${rewardsTable(comp)}
      <section class="panel prose"><h2>About this bounty</h2>${renderMarkdown(comp.description)}</section>
      ${rules}
    </article>`;
}

// ---------------------------------------------------------------- leaderboard

function entryRow(entry) {
  const judge = entry.judge ?? {};
  const wl =
    judge.wins !== undefined && judge.losses !== undefined
      ? `${count(judge.wins)}–${count(judge.losses)}`
      : '—';
  const rate =
    entry.values?.judge !== undefined && entry.values?.judge !== null
      ? winRate(entry.values.judge)
      : escapeHtml(entry.display?.judge ?? '—');
  return `<tr>
    <td class="num strong">${escapeHtml(entry.prize_rank ?? entry.rank ?? '—')}</td>
    <td><span class="entrant">${avatarImg(entry.image, entry.handle, 'avatar-sm')}
      <a href="#/u/${escapeHtml(encodeURIComponent(entry.handle))}">@${escapeHtml(entry.handle)}</a></span></td>
    <td class="entry-title">${escapeHtml(entry.title ?? '')}${entry.house ? ' <span class="chip">house</span>' : ''}</td>
    <td class="num">${rate}</td>
    <td class="num">${wl}</td>
    <td class="num">${entry.values?.bytes !== undefined ? bytes(entry.values.bytes) : '—'}</td>
    <td>${dayOnly(entry.received_at)}</td>
  </tr>`;
}

export async function leaderboardView(mount, slug) {
  const data = await getLeaderboard(slug);
  const entries = data.entries ?? [];
  const phase = data.phase?.title ?? 'Results';
  let page = 0;
  let query = '';

  mount.innerHTML = `
    <section class="page-head">
      <p class="crumbs"><a href="#/">Bounties</a> / <a href="#/bounty/${escapeHtml(slug)}">${escapeHtml(slug)}</a> / Leaderboard</p>
      <h1>${escapeHtml(data.competition?.title ?? slug)} — leaderboard</h1>
      <p class="lede">${escapeHtml(phase)} phase · ${count(entries.length)} ranked entries.
      Win rate is the judge's Bradley–Terry rate for the entry; W–L is its
      head-to-head record so far.</p>
      <div class="board-tools">
        <label class="visually-hidden" for="lb-search">Search the leaderboard</label>
        <input id="lb-search" type="search" placeholder="Search handle or title…" autocomplete="off">
        <span id="lb-count" class="muted" role="status"></span>
      </div>
    </section>
    <section class="panel">
      <div class="table-scroll"><table>
        <thead><tr><th>Rank</th><th>Entrant</th><th>Entry</th><th>Win rate</th><th>W–L</th><th>Size</th><th>Received</th></tr></thead>
        <tbody id="lb-body"></tbody>
      </table></div>
      <div class="pager">
        <button id="lb-prev" type="button">← Prev</button>
        <span id="lb-page" class="muted"></span>
        <button id="lb-next" type="button">Next →</button>
      </div>
    </section>
    <p><a href="#/bounty/${escapeHtml(slug)}">← Back to the bounty page</a></p>`;

  const body = mount.querySelector('#lb-body');
  const pageEl = mount.querySelector('#lb-page');
  const countEl = mount.querySelector('#lb-count');
  const prevBtn = mount.querySelector('#lb-prev');
  const nextBtn = mount.querySelector('#lb-next');
  const searchEl = mount.querySelector('#lb-search');

  const filtered = () =>
    query
      ? entries.filter(
          (e) =>
            e.handle.toLowerCase().includes(query) ||
            (e.title ?? '').toLowerCase().includes(query),
        )
      : entries;

  const render = () => {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    body.innerHTML = slice.length
      ? slice.map(entryRow).join('')
      : '<tr><td colspan="7" class="muted">No entries match.</td></tr>';
    pageEl.textContent = `Page ${page + 1} of ${pages}`;
    countEl.textContent = query
      ? `${count(rows.length)} of ${count(entries.length)} entries`
      : `${count(entries.length)} entries`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages - 1;
  };

  prevBtn.addEventListener('click', () => {
    page--;
    render();
  });
  nextBtn.addEventListener('click', () => {
    page++;
    render();
  });
  searchEl.addEventListener('input', () => {
    query = searchEl.value.trim().toLowerCase();
    page = 0;
    render();
  });
  render();
}

// ---------------------------------------------------------------- profile

function solutionRow(sol) {
  const comp = sol.competition ?? {};
  const score = sol.score?.display
    ? `${escapeHtml(sol.score.display)} <span class="muted">(${escapeHtml(sol.score.column?.title ?? 'score')})</span>`
    : '—';
  const place =
    sol.placement !== null && sol.placement !== undefined
      ? `Placed #${count(sol.placement)}`
      : 'Not placed yet';
  const prize = sol.prize_usd ? ` · won ${money(sol.prize_usd)}` : '';
  return `<li class="solution">
    <div class="solution-main">
      <a class="solution-title" href="#/bounty/${escapeHtml(comp.slug)}">${escapeHtml(sol.title ?? 'Untitled entry')}</a>
      <span class="muted"> in </span>
      <a href="#/bounty/${escapeHtml(comp.slug)}">${escapeHtml(comp.title ?? comp.slug ?? '')}</a>
    </div>
    <div class="solution-meta muted">
      Score ${score} · ${place}${prize} · entered ${dayOnly(sol.entered_at)} ·
      <a href="#/bounty/${escapeHtml(comp.slug)}/leaderboard">leaderboard</a>
    </div>
  </li>`;
}

export async function profileView(mount, handle) {
  const profile = await getProfile(handle);
  const record = profile.record ?? {};
  const name = profile.display_name ?? profile.handle;
  const links = [];
  if (profile.x?.url) {
    links.push(`<a href="${escapeHtml(profile.x.url)}" target="_blank" rel="noopener">X: @${escapeHtml(profile.x.username ?? '')}</a>`);
  }
  if (profile.github_login) {
    links.push(`<a href="https://github.com/${escapeHtml(encodeURIComponent(profile.github_login))}" target="_blank" rel="noopener">GitHub: ${escapeHtml(profile.github_login)}</a>`);
  }
  if (profile.wallet?.explorer_url) {
    links.push(`<a href="${escapeHtml(profile.wallet.explorer_url)}" target="_blank" rel="noopener">Wallet</a>`);
  }
  const solutions = profile.solutions ?? [];
  mount.innerHTML = `
    <section class="page-head profile-head">
      ${avatarImg(profile.image ?? profile.avatar, profile.handle, 'avatar-lg')}
      <div>
        <h1>${escapeHtml(name)}</h1>
        <p class="muted">@${escapeHtml(profile.handle)} · joined ${dayOnly(profile.joined_at)}</p>
        ${profile.bio ? `<p class="lede">${escapeHtml(profile.bio)}</p>` : ''}
        ${links.length ? `<p class="profile-links">${links.join(' · ')}</p>` : ''}
      </div>
    </section>
    <section class="panel">
      <h2>Record</h2>
      <div class="stat-row">
        <div class="stat"><span class="stat-label">Entered</span><span class="stat-value">${count(record.competitions_entered)}</span></div>
        <div class="stat"><span class="stat-label">Placed</span><span class="stat-value">${count(record.competitions_placed)}</span></div>
        <div class="stat"><span class="stat-label">Won</span><span class="stat-value">${count(record.competitions_won)}</span></div>
        <div class="stat"><span class="stat-label">Podiums</span><span class="stat-value">${count(record.podium_finishes)}</span></div>
        <div class="stat"><span class="stat-label">Best place</span><span class="stat-value">${record.best_placement ? '#' + count(record.best_placement) : '—'}</span></div>
        <div class="stat"><span class="stat-label">Prizes</span><span class="stat-value">${money(record.prize_usd)}</span></div>
      </div>
    </section>
    <section class="panel">
      <h2>Entries (${count(solutions.length)})</h2>
      ${solutions.length ? `<ul class="solutions">${solutions.map(solutionRow).join('')}</ul>` : '<p class="muted">No entries yet.</p>'}
    </section>`;
}
