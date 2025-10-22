/** ui.js — views, data helpers, and global UI hooks (no inline <script> needed)
 *  This file returns HTML strings for each route and wires up page behaviors
 *  (search, QR generation) via global event delegation + observers.
 */

// ---- Fetch helpers --------------------------------------------------------
const cacheBust = () => `?v=${globalThis.crypto?.randomUUID?.() || Date.now()}`;

async function fetchJSON(url, fallback) {
  try {
    const res = await fetch(url + cacheBust(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (_) {
    return fallback;
  }
}

export async function loadJSON(path) {
  return fetchJSON(path, []);
}

export async function loadSettings() {
  return fetchJSON('./data/settings.json', { team_name: 'Team Hub', theme: 'auto' });
}

export function setTheme(mode = 'auto') {
  if (mode === 'auto') return; // honor system by default
  document.documentElement.style.colorScheme = mode;
}

// ---- Formatting -----------------------------------------------------------
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

// ---- Data caches (to avoid refetching) -----------------------------------
let drillsCache = null;
async function ensureDrills() {
  if (!drillsCache) drillsCache = await loadJSON('./data/drills.json');
  return drillsCache;
}

// ---- Views ---------------------------------------------------------------
export async function renderHome() {
  const [settings, ann, plans] = await Promise.all([
    loadSettings(),
    loadJSON('./data/announcements.json'),
    loadJSON('./data/practice_plans.json'),
  ]);

  const next = [...(plans || [])]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .find(
      (p) =>
        new Date(p.date).setHours(0, 0, 0, 0) >= new Date().setHours(0, 0, 0, 0)
    );

  return `
  <section class="grid">
    <div class="card">
      <h3>Next Practice</h3>
      ${
        next
          ? `
        <div class="meta">${fmtDate(next.date)} • ${next.location || ''} • ${
              next.theme || ''
            }</div>
        <p>${next.focus || ''}</p>
        <a class="badge" href="#/practice">View all plans →</a>
      `
          : `<p>No upcoming practices yet.</p>`
      }
    </div>
    <div class="card">
      <h3>Announcements</h3>
      <ul class="list">
        ${(ann || [])
          .slice(0, 4)
          .map(
            (a) => `
          <li>
            <strong>${a.title || ''}</strong>
            <div class="meta">${a.date ? fmtDate(a.date) : ''}</div>
            <p>${a.body || ''}</p>
          </li>`
          )
          .join('')}
      </ul>
      <p class="meta">Edit announcements in <code>/data/announcements.json</code></p>
    </div>
  </section>`;
}

export async function renderPractice() {
  const [plans, drills, videos, mentor] = await Promise.all([
    loadJSON('./data/practice_plans.json'),
    ensureDrills(),
    loadJSON('./data/videos.json'),
    loadJSON('./data/mentorship.json'),
  ]);
  const refs = videos?.references || [];

  const list = (plans || [])
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((p) => {
      const items = (p.items || [])
        .map((it) => {
          const d = drills.find((x) => x.id === it.drill_id);
          const m =
            (it.mentorship_id && (mentor || []).find((x) => x.id === it.mentorship_id)) ||
            null;
          const v = (it.video_ref && refs.find((r) => r.id === it.video_ref)) || null;
          return `
          <li class="card">
            <div class="row"><strong>${it.time || ''}</strong> ${
            d?.name ? `<span class="badge">${d.name}</span>` : it.notes || ''
          }</div>
            ${
              d?.tags?.length
                ? `<div class='row'>${d.tags
                    .map((t) => `<span class='badge'>${t}</span>`)
                    .join('')}</div>`
                : ''
            }
            ${
              m
                ? `<div class='row'>
                  <span class='meta'>Mentorship:</span> ${m.title}
                  ${
                    m.video_url
                      ? `<span class='badge'><a href='${m.video_url}' target='_blank' rel='noopener'>Video</a></span>`
                      : ''
                  }
                </div>`
                : ''
            }
            ${
              m?.video_url
                ? `<div class='qr' aria-label='QR code to mentorship video' data-qr='${m.video_url}'></div>`
                : ''
            }
            ${
              v
                ? `<div class='row meta'>Video Channel: ${v.channel || ''} ${
                    v.source ? `• Source: ${v.source}` : ''
                  }</div>`
                : ''
            }
            ${it.diagram ? `<div class='meta'>Diagram file: ${it.diagram}</div>` : ''}
          </li>`;
        })
        .join('');

      return `
        <section class="card">
          <h3>${fmtDate(p.date)}${p.location ? ` • ${p.location}` : ''}${
        p.theme ? ` • ${p.theme}` : ''
      }</h3>
          <p class="meta">${p.focus ? `Focus: ${p.focus} • ` : ''}${
        p.duration ? `Duration: ${p.duration}` : ''
      }</p>
          <ol class="list">${items}</ol>
        </section>`;
    })
    .join('');

  return `<div class="list">${list || '<p>No practice plans yet.</p>'}</div>`;
}

export async function renderDrills() {
  const drills = await ensureDrills();
  const tags = [...new Set((drills || []).flatMap((d) => d.tags || []))];
  return `
    <input id="q" class="input" placeholder="Search drills by name or tag…" aria-label="Search drills" />
    <div class="row" style="margin:8px 0;">
      ${tags.map((t) => `<button class='ghost' data-tag='${t}'>${t}</button>`).join('')}
    </div>
    <div class="list" id="drillList">${renderDrillsList(drills)}</div>
  `;
}

function renderDrillsList(rows) {
  return (rows || [])
    .map(
      (d) => `
    <section class='card'>
      <h3>${d.name || ''}</h3>
      ${
        d.tags?.length
          ? `<div class='row'>${d.tags.map((t) => `<span class='badge'>${t}</span>`).join('')}</div>`
          : ''
      }
      ${d.summary ? `<p class='meta'>${d.summary}</p>` : ''}
      ${d.video_channel_ref ? `<p class='meta'>Video Channel Ref: ${d.video_channel_ref}</p>` : ''}
      ${d.video_source ? `<p class='meta'>Video Source: ${d.video_source}</p>` : ''}
      ${d.diagram ? `<p class='meta'>Diagram file: ${d.diagram}</p>` : ''}
    </section>`
    )
    .join('');
}

export async function renderMentorship() {
  const items = await loadJSON('./data/mentorship.json');
  return `<div class='list'>${(items || [])
    .map(
      (m) => `
    <section class='card'>
      <h3>${m.title || ''}</h3>
      ${m.story ? `<p>${m.story}</p>` : ''}
      ${
        m.video_url
          ? `<div class='row'>
        <a class='badge' href='${m.video_url}' target='_blank' rel='noopener'>Watch</a>
      </div>
      <div class='qr' data-qr='${m.video_url}' aria-label='QR code to mentorship video'></div>`
          : ''
      }
    </section>`
    )
    .join('')}</div>`;
}

export async function renderRoster() {
  const roster = await loadJSON('./data/roster.json');
  if (!(roster || []).length) return '<p>No roster yet.</p>';
  const mail = (v) => (v && /@/.test(v) ? `<a href="mailto:${v}">${v}</a>` : v || '');
  return `
    <table class='table'>
      <thead><tr><th>#</th><th>Name</th><th>Pos</th><th>Parent Contact</th></tr></thead>
      <tbody>
        ${roster
          .map(
            (r) =>
              `<tr><td>${r.number || ''}</td><td>${r.name || ''}</td><td>${r.pos || ''}</td><td>${mail(
                r.parent
              )}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

export async function renderAbout() {
  const s = await loadSettings();
  return `
    <section class='card'>
      <h3>About</h3>
      <p>Team: ${s.team_name || ''}</p>
      ${s.season ? `<p>Season: ${s.season}</p>` : ''}
      ${s.coach_email ? `<p>Coach: <a href='mailto:${s.coach_email}'>${s.coach_email}</a></p>` : ''}
      <p class='meta'>Edit <code>/data/settings.json</code> to update branding, theme, and links.</p>
    </section>`;
}

// ---- Global UI hooks (run once on import) --------------------------------
(function bootUI() {
  const app = document.getElementById('app');
  if (!app) return;

  // 1) Auto-generate QR codes for any element with [data-qr]
  const qrInit = (root) => {
    if (!root) return;
    // eslint-disable-next-line no-undef
    if (typeof QRCode === 'undefined') return; // guard if library missing
    root.querySelectorAll('[data-qr]').forEach((node) => {
      if (node.getAttribute('data-qr-initialized')) return;
      const url = node.getAttribute('data-qr');
      if (!url) return;
      node.setAttribute('data-qr-initialized', '1');
      try {
        // eslint-disable-next-line no-undef
        new QRCode(node, { text: url, width: 120, height: 120 });
      } catch (_) {
        /* no-op */
      }
    });
  };

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) {
          // element
          qrInit(n);
        }
      });
    }
  });
  mo.observe(app, { childList: true, subtree: true });

  // Also run once on current content (after first route render)
  setTimeout(() => qrInit(app), 0);

  // 2) Drill search & tag filter via event delegation
  document.addEventListener('input', async (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.id !== 'q') return;
    const list = document.getElementById('drillList');
    if (!list) return;
    const drills = await ensureDrills();
    const term = (el.value || '').toLowerCase();
    const filtered = drills.filter(
      (d) =>
        (d.name || '').toLowerCase().includes(term) ||
        (d.tags || []).some((t) => t.toLowerCase().includes(term))
    );
    list.innerHTML = renderDrillsList(filtered);
  });

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest?.('[data-tag]');
    if (!btn) return;
    const t = btn.getAttribute('data-tag');
    const q = document.getElementById('q');
    if (q) {
      q.value = t;
      q.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
})();
