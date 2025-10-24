/** ui.js — views + data helpers + theme utilities */

// ---------- Small fetch helper ----------
const cacheBust = () => `?v=${globalThis.crypto?.randomUUID?.() || Date.now()}`;
async function fetchJSON(url, fallback) {
  try {
    const res = await fetch(url + cacheBust(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch {
    return fallback;
  }
}

export async function loadJSON(path)    { return fetchJSON(path, []); }
export async function loadSettings()    { return fetchJSON('./data/settings.json', { team_name: 'Team Hub', theme: 'auto' }); }

// ---------- Theme helpers ----------
export function applyTheme(mode = 'auto') {
  // mode: 'light' | 'dark' | 'auto'
  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = 'light dark';
  } else {
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode;
  }
  localStorage.setItem('theme', mode);
}
export function initThemeFromSettings(settings = {}) {
  const saved = localStorage.getItem('theme');
  const mode = saved || settings.theme || 'auto';
  applyTheme(mode);
  return mode;
}
export function toggleTheme() {
  const current = localStorage.getItem('theme') || 'auto';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

// ---------- Formatting ----------
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', time: 'short' });
  } catch { return iso; }
};

// ---------- Data caches ----------
let drillsLibCache = null;
async function ensureDrillsLib() {
  if (!drillsLibCache) drillsLibCache = await loadJSON('./data/drills.json');
  return drillsLibCache;
}

// ---------- HOME ----------
export async function renderHome() {
  const [settings, ann, plans] = await Promise.all([
    loadSettings(),
    loadJSON('./data/announcements.json'),
    loadJSON('./data/practice_plans.json'),
  ]);

  // Auto-pick next practice (>= today)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = [...(plans || [])]
    .filter(p => new Date(p.date).setHours(0,0,0,0) >= today.getTime())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  return `
    <section class="grid">
      <div class="card">
        <div class="card-header alt">Next Practice</div>
        <div class="card-body">
          ${
            next ? `
              <div class="meta">
                ${fmtDate(next.date)}
                ${next.location ? ` • ${next.location}` : ""}
                ${next.theme_title ? ` • ${next.theme_title}` : (next.theme || "")}
              </div>
              ${next.notes_coach ? `<p>${next.notes_coach}</p>` : (next.focus ? `<p>${next.focus}</p>` : "")}
              <a class="badge" href="#/practice">View all plans →</a>
            ` : `<p>No upcoming practices yet.</p>`
          }
        </div>
      </div>

      <div class="card">
        <div class="card-header alt">Announcements</div>
        <div class="card-body">
          <ul class="list">
            ${(ann || []).slice(0, 8).map(a => `
              <li>
                <strong>${a.title || ""}</strong>
                <div class="meta">${a.date ? fmtDate(a.date) : ""}</div>
                <p>${a.body || ""}</p>
              </li>
            `).join("")}
          </ul>          
        </div>
      </div>
    </section>`;
}

// ---------- PRACTICE PLANS ----------
export async function renderPractice() {
  const plans = await loadJSON('./data/practice_plans.json');

  const list = (plans || [])
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(p => {
      // Top-level practice header uses alt background
      const segments = (p.items || []).filter(i => i.type === 'segment');
      const mentorships = (p.items || []).filter(i => i.type === 'mentorship');

      const segHtml = segments.map(seg => {
        const drills = seg.drills || [];

        const drillsHtml = drills
          .sort((a,b) => (a.drill_order||0) - (b.drill_order||0))
          .map(d => {
            const tags = (d.drill_category || "")
              .split(/[|,]/).map(s => s.trim()).filter(Boolean);

            const prose = [
              d.setup ? `<p><strong>Setup:</strong> ${d.setup}</p>` : "",
              d.execution ? `<p><strong>Instructions:</strong> ${d.execution}</p>` : "",
              d.coaching_points ? `<p><strong>Coaching Points:</strong> ${d.coaching_points}</p>` : "",
              d.common_errors ? `<p><strong>Common Errors:</strong> ${d.common_errors}</p>` : "",
              d.variations ? `<p><strong>Variations:</strong> ${d.variations}</p>` : "",
            ].join("");

            const diagramBlock = d.diagram
              ? (d.diagram_embed === false
                  ? `<p class="meta">Diagram: <a href="./diagrams/${d.diagram}" target="_blank" rel="noopener">${d.diagram}</a></p>`
                  : `<figure class="figure"><img src="./diagrams/${d.diagram}" alt="${d.drill_name || "Diagram"}" loading="lazy"></figure>`)
              : "";

            const videoPlaceholder = `<span class="meta" data-video-id="${d.video_id || ""}" data-video-url="${d.video_url || ""}"></span>`;

            return `
              <li class="card">
                <div class="card-body">
                  ${d.drill_name ? `<div class="meta"><strong>${d.drill_name}</strong></div>` : ""}
                  ${tags.length ? `<div class="row">${tags.map(t => `<span class="badge">${t}</span>`).join("")}</div>` : ""}
                  ${prose}
                  ${diagramBlock}
                  ${videoPlaceholder}
                </div>
              </li>`;
          }).join("");

        return `
          <section class="card">
            <div class="card-header">${seg.segment_name || "Segment"} ${seg.duration_min ? `<span class="meta">• ${seg.duration_min} min</span>` : ""}</div>
            <div class="card-body">
              ${seg.objective ? `<p><strong>Objective:</strong> ${seg.objective}</p>` : ""}
              ${seg.cues_headline ? `<p><strong>Cues:</strong> ${seg.cues_headline}</p>` : ""}
              ${drillsHtml ? `<ol class="list">${drillsHtml}</ol>` : `<p class="meta">No drills listed.</p>`}
            </div>
          </section>`;
      }).join("");

      const mentorHtml = mentorships.map(m => `
        <section class="card">
          <div class="card-header alt">Mentorship — ${m.theme_title || m.theme_id || ""}</div>
          <div class="card-body">
            ${m.story_title ? `<p><strong>${m.story_title}</strong></p>` : ""}
            ${m.script ? `<p>${m.script}</p>` : ""}
            ${m.questions ? `<p><em>Questions:</em> ${m.questions}</p>` : ""}
            ${
              m.video_url
                ? `<div class="row"><a class="badge" href="${m.video_url}" target="_blank" rel="noopener">Video</a></div>
                   <div class="qr" data-qr="${m.video_url}" aria-label="QR to mentorship video"></div>`
                : ""
            }
          </div>
        </section>
      `).join("");

      return `
        <section class="card">
          <div class="card-header alt">
            ${fmtDate(p.date)}
            ${p.location ? ` • ${p.location}` : ""}
            ${p.theme_title ? ` • ${p.theme_title}` : ""}
          </div>
          <div class="card-body">
            ${p.notes_coach ? `<p class="meta">Notes: ${p.notes_coach}</p>` : ""}
            ${segHtml}
            ${mentorHtml}
          </div>
        </section>`;
    }).join("");

  return `<div class="list">${list || "<p>No practice plans yet.</p>"}</div>`;
}

// ---------- DRILLS ----------
export async function renderDrills() {
  const drills = await ensureDrillsLib();
  const tags = [...new Set((drills || []).flatMap(d => (d.tags || [])))];

  return `
    <div class="row" style="gap:8px; align-items:center;">
      <input id="q" class="input" placeholder="Search drills by name or tag…" aria-label="Search drills" />
      <button class="btn" data-action="clear-drill-search">Clear</button>
    </div>
    <div class="row" style="margin:8px 0;">
      ${tags.map(t => `<button class='btn' data-tag='${t}'>${t}</button>`).join("")}
    </div>
    <div class="list" id="drillList">${await renderDrillsList(drills)}</div>
  `;
}

async function renderDrillsList(rows) {
  const html = await Promise.all((rows || []).map(async d => {
    const diagramBlock = d.diagram
      ? (d.diagram_embed === false
          ? `<p class='meta'>Diagram: <a href="./diagrams/${d.diagram}" target="_blank" rel="noopener">${d.diagram}</a></p>`
          : `<figure class="figure"><img src="./diagrams/${d.diagram}" alt="${d.name || "Drill"} diagram" loading="lazy"></figure>`)
      : "";

    const tagRow = d.tags?.length ? `<div class='row'>${d.tags.map(t => `<span class='badge'>${t}</span>`).join("")}</div>` : "";

    const detailLines = [
      d.duration_min ? `Duration: ${d.duration_min} min` : "",
      d.reps ? `Reps: ${d.reps}` : "",
      d.sets ? `Sets: ${d.sets}` : "",
      d.equipment ? `Equipment: ${d.equipment}` : ""
    ].filter(Boolean).map(s => `<div class="meta">${s}</div>`).join("");

    const videoLink = d.video_url ? `<p><strong>Video:</strong> <a href="${d.video_url}" target="_blank" rel="noopener">${d.video_url}</a></p>` : "";

    return `
      <section class='card'>
        <div class="card-header">${d.name || ""}</div>
        <div class="card-body">
          ${tagRow}
          ${d.summary ? `<p class='meta'>${d.summary}</p>` : ""}
          ${detailLines}
          ${d.setup ? `<p><strong>Setup:</strong> ${d.setup}</p>` : ""}
          ${d.execution ? `<p><strong>Instructions:</strong> ${d.execution}</p>` : ""}
          ${d.player_cues ? `<p><strong>Player Cues:</strong> ${d.player_cues}</p>` : ""}
          ${d.coaching_points ? `<p><strong>Coaching Points:</strong> ${d.coaching_points}</p>` : ""}
          ${d.common_errors ? `<p><strong>Common Errors:</strong> ${d.common_errors}</p>` : ""}
          ${d.variations ? `<p><strong>Variations:</strong> ${d.variations}</p>` : ""}
          ${diagramBlock}
          ${videoLink}
        </div>
      </section>`;
  }));
  return html.join("");
}

// ---------- MENTORSHIP ----------
export async function renderMentorship() {
  const items = await loadJSON('./data/mentorship.json');
  return `<div class='list'>${(items || []).map(m => `
    <section class='card'>
      <div class="card-header alt">${m.theme_title || m.theme_id || ""}</div>
      <div class="card-body">
        ${m.story_title ? `<p><strong>${m.story_title}</strong></p>` : ""}
        ${m.script ? `<p>${m.script}</p>` : ""}
        ${m.questions ? `<p><em>Questions:</em> ${m.questions}</p>` : ""}
        ${
          m.video_url
            ? `<div class='row'><a class='badge' href='${m.video_url}' target='_blank' rel='noopener'>Video</a></div>
               <div class='qr' data-qr='${m.video_url}'></div>`
            : ""
        }
      </div>
    </section>`).join("")}</div>`;
}

// ---------- ROSTER ----------
export async function renderRoster() {
  const roster = await loadJSON('./data/roster.json');
  if (!(roster || []).length) return "<p>No roster yet.</p>";
  const mail = v => (v && /@/.test(v) ? `<a href="mailto:${v}">${v}</a>` : (v || ""));
  const tel  = v => v ? `<a href="tel:${v.toString().replace(/[^\d+]/g,'')}">${v}</a>` : "";

  return `
    <table class='table' id="rosterTable">
      <thead>
        <tr>
          <th data-sort="number">#</th>
          <th data-sort="first_name">First Name</th>
          <th data-sort="last_name">Last Name</th>
          <th data-sort="pos">Pos</th>
          <th data-sort="parent1_name">Parent 1 Name</th>
          <th data-sort="parent1_phone">Parent 1 Phone</th>
          <th data-sort="parent1_email">Parent 1 Email</th>
          <th data-sort="parent2_name">Parent 2 Name</th>
          <th data-sort="parent2_phone">Parent 2 Phone</th>
          <th data-sort="parent2_email">Parent 2 Email</th>
        </tr>
      </thead>
      <tbody>
        ${roster.map(r => `
          <tr>
            <td>${r.number ?? ""}</td>
            <td>${r.first_name ?? ""}</td>
            <td>${r.last_name ?? ""}</td>
            <td>${r.pos ?? ""}</td>
            <td>${r.parent1_name ?? ""}</td>
            <td>${tel(r.parent1_phone)}</td>
            <td>${mail(r.parent1_email)}</td>
            <td>${r.parent2_name ?? ""}</td>
            <td>${tel(r.parent2_phone)}</td>
            <td>${mail(r.parent2_email)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

// ---------- ABOUT ----------
export async function renderAbout() {
  return `
    <section class="card">
      <div class="card-header alt">About Jr Bucs Basketball</div>
      <div class="card-body">
        <p>This app helps coaches and players organize practice plans, drills, and team information.</p>
        <p>Version 1.0</p>
      </div>
    </section>`;
}


// ---------- Global UI hooks ----------
(function bootUI() {
  const app = document.getElementById("app");
  if (!app) return;

  // 1) QR generation for any [data-qr]
  const makeQRs = (root) => {
    if (!root) return;
    if (typeof QRCode === "undefined") return;
    root.querySelectorAll("[data-qr]").forEach(node => {
      if (node.getAttribute("data-qr-initialized")) return;
      const url = node.getAttribute("data-qr"); if (!url) return;
      node.setAttribute("data-qr-initialized", "1");
      try { new QRCode(node, { text: url, width: 120, height: 120 }); } catch {}
    });
  };

  // 2) Fill video placeholders in Practice view
  const fillVideos = async (root) => {
    const nodes = root.querySelectorAll("[data-video-id], [data-video-url]");
    if (!nodes.length) return;
    for (const n of nodes) {
      const direct = n.getAttribute("data-video-url");
      let url = direct || null;
      if (url) {
        n.outerHTML = `<p><strong>Video:</strong> <a href="${url}" target="_blank" rel="noopener">${url}</a></p>`;
      } else {
        n.remove();
      }
    }
  };

  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1) { makeQRs(n); fillVideos(n); }
      });
    }
  });
  mo.observe(app, { childList: true, subtree: true });

  setTimeout(() => { makeQRs(app); fillVideos(app); }, 0);

  // Drills search, tag filter, and clear
  document.addEventListener("click", async (ev) => {
    const tagBtn = ev.target.closest("[data-tag]");
    const clear = ev.target.closest('[data-action="clear-drill-search"]');
    if (tagBtn) {
      const t = tagBtn.getAttribute("data-tag");
      const q = document.getElementById("q");
      if (q) { q.value = t; q.dispatchEvent(new Event("input", { bubbles: true })); }
    }
    if (clear) {
      const q = document.getElementById("q");
      const list = document.getElementById("drillList");
      const drills = await ensureDrillsLib();
      if (q) q.value = "";
      if (list) list.innerHTML = await renderDrillsList(drills);
    }
  });

  document.addEventListener("input", async (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.id !== "q") return;
    const list = document.getElementById("drillList"); if (!list) return;
    const drills = await ensureDrillsLib();
    const term = (el.value || "").toLowerCase();
    const filtered = drills.filter(d =>
      (d.name || "").toLowerCase().includes(term) ||
      (d.tags || []).some(t => t.toLowerCase().includes(term))
    );
    list.innerHTML = await renderDrillsList(filtered);
  });

  // (Roster sorting retained from earlier version if you added it)
})();


