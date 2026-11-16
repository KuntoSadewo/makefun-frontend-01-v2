// markdown.js — a small, safe Markdown renderer for bounty descriptions
// and rules. Everything is HTML-escaped first; the formatter then works on
// the escaped text, so markup in a description can never become live HTML.
// Links open only on http(s) or site-relative targets.

import { escapeHtml } from './format.js';
import { apiUrl } from './api.js';

function inline(escaped) {
  let out = escaped;
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => {
    const url = apiUrl(src.replaceAll('&amp;', '&'));
    return url
      ? `<img class="md-img" alt="${alt}" src="${url}" crossorigin="anonymous" loading="lazy">`
      : alt;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
    const url = href.replaceAll('&amp;', '&');
    if (/^https?:\/\//.test(url)) {
      return `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    }
    if (url.startsWith('/')) {
      return `<a href="https://make.fun${url}" target="_blank" rel="noopener">${text}</a>`;
    }
    return text;
  });
  return out;
}

function renderTable(lines) {
  const cells = (line) =>
    line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  const head = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  const thead = head.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join('');
  const rows = body
    .map(
      (row) =>
        '<tr>' +
        row.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join('') +
        '</tr>',
    )
    .join('');
  return `<div class="table-scroll"><table><thead><tr>${thead}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      html.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      html.push('<hr>');
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const tableLines = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        tableLines.push(lines[i]);
        i++;
      }
      html.push(renderTable(tableLines));
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      html.push(
        '<ul>' +
          items.map((item) => `<li>${inline(escapeHtml(item))}</li>`).join('') +
          '</ul>',
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      html.push(
        '<ol>' +
          items.map((item) => `<li>${inline(escapeHtml(item))}</li>`).join('') +
          '</ol>',
      );
      continue;
    }
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(
        `<blockquote>${buf.map((b) => inline(escapeHtml(b))).join('<br>')}</blockquote>`,
      );
      continue;
    }
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    html.push(`<p>${inline(escapeHtml(buf.join(' ')))}</p>`);
  }
  return html.join('\n');
}
