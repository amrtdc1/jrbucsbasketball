/** js/ui.js — views, theme helpers, and utilities
 * Exports:
 *  - loadJSON, loadSettings
 *  - applyTheme, setTheme (alias), initThemeFromSettings, toggleTheme
 *  - renderHome, renderPractice, renderDrills, renderMentorship, renderRoster, renderAbout
 */

/* ---------------- Fetch helpers ---------------- */
const cacheBust = () => `?v=${globalThis.crypto?.randomUUID?.() || Date.now()}`;

async function fetchJSON(url, fallback) {
  try {
    const res = await fetch(url + cacheBust(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch {
    return fallback;
  }
}

export async function loadJSON(path) { return fetchJSON(path, []); }
export async function loadSettings() { return fetchJSON("./data/settings.json", { team_name: "Team Hub", theme: "auto" }); }

/* ---------------- Theme helpers ---------------- */
export function applyTheme(mode = "auto") {
  if (mode === "auto") {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "light dark";
  } else {
    document.documentElement.setAttribute("data-theme", mode);
    document.documentElement.style.colorScheme = mode;
  }
  try { localStorage.setItem("theme", mode); } catch {}
}
export const setTheme = applyTheme; // alias

export function initThemeFromSettings(settings = {}) {
  const saved = localStorage.getItem("theme");
  const mode = saved || settings.theme || "auto";
  applyTheme(mode);
  return mode;
}
export function toggleTheme() {
  const current = localStorage.getItem("theme") || "auto";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/* ---------------- Formatting ---------------- */
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch { return iso; }
};

/* ---------------- Data caches ---------------- */
let drillsLibCache = null;
async function ensureDrillsLib() {
  if (!drillsLibCache) drillsLibCache = await loadJSON("./data/drills.json");
  return drillsLibCache;
}

/* ---------------- File existence helper (diagrams) ---------------- */
const _existsCache = new Map();
/** Checks if a file exists. Uses Cache Storage first (offline-friendly), then HEAD fetch. */
async function fileExists(url) {
  if (_existsCache.has(url)) return _existsCache.get(url);
  try {
    if ("caches" in window) {
      const hit = await caches.match(url);
      if (hit) { _existsCache.set(url, true); return true; }
    }
  } catch {}
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    const ok = res.ok;
    _existsCache.set(url, ok);
    return ok;
  } catch {
    _existsCache.set(url, false);
    return false;
  }
}

/* ---------------- Helpers: next practice & ordering ---------------- */
function getNextPractice(plans, now = new Date()) {
  const today = new Date(now); today.setHours(0,0,0,0);
  return (plans || [])
    .filter(p => Number.isFinite(new Date(p.date).getTime()))
    .filter(p => new Date(p.date).setHours(0,0,0,0) >= today.getTime())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}
function orderPractices(plans, now = new Date()) {
  const d0 = new Date(now); d0.setHours(0,0,0,0);
  const valid = (plans || []).filter(p => Number.isFinite(new Date(p.date).getTime()));
  const future = valid.filter(p => new Date(p.date).setHours(0,0,0,0) >= d0.getTime())
                      .sort((a,b) => new Date(a.date) - new Date(b.date));
  const past   = valid.filter(p => new Date(p.date).setHours(0,0,0,0) <  d0.getTime())
                      .sort((a,b) => new Date(a.date) - new Date(b.date));
  return [...future, ...past];
}

/* ---------------- Persisted <details> state ---------------- */
function getPersistedOpen(key, def = false) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return def;
    return v === "1";
  } catch { return def; }
}
function setPersistedOpen(key, isOpen) {
  try { localStorage.setItem(key, isOpen ? "1" : "0"); } catch {}
}

/* ---------------- Views ---------------- */
export async function renderHome() {
  const [settings, ann, plans] = await Promise.all([
    loadSettings(),
    loadJSON("./data/announcements.json"),
    loadJSON("./data/practice_plans.json"),
  ]);

  const next = getNextPractice(plans);

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
                ${next.theme_title ? ` • ${next.theme_title}` : ""}
              </div>
              ${next.notes_coach ? `<p>${next.notes_coach}</p>` : ""}
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
          <p class="meta">Edit announcements in <code>/data/announcements.json</code></p>
        </div>
      </div>
    </section>
  `;
}

/* ---------- Practice Plans (segments now individually collapsible) ---------- */
export async function renderPractice() {
  const plansRaw = await loadJSON("./data/practice_plans.json");
  const plans = orderPractices(plansRaw);

  const plansHtml = await Promise.all(plans.map(async (p, pIdx) => {
    const segs = (p.items || []).filter(i => i.type === "segment");
    const mentors = (p.items || []).filter(i => i.type === "mentorship");

    const baseKey = p.id || p.practice_id || `p${pIdx}`;
    const planKey = `pp_open_${baseKey}`;
    const isPlanOpen = getPersistedOpen(planKey, pIdx === 0); // nearest upcoming open

    // Build each segment as its own <details class="card">
    const segBlocks = await Promise.all(segs.map(async (seg, sIdx) => {
      const segKey = `pp_seg_${baseKey}_${seg.segment_order ?? sIdx}`;
      const isSegOpen = getPersistedOpen(segKey, true);

      const drillsHtml = (await Promise.all(
        (seg.drills || [])
          .sort((a,b) => (a.drill_order||0) - (b.drill_order||0))
          .map(async (d) => {
            const tags = (d.drill_category || "").split(/[|,]/).map(s => s.trim()).filter(Boolean);
            const prose = [
              d.setup ? `<p><strong>Setup:</strong> ${d.setup}</p>` : "",
              d.execution ? `<p><strong>Instructions:</strong> ${d.execution}</p>` : "",
              d.coaching_points ? `<p><strong>Coaching Points:</strong> ${d.coaching_points}</p>` : "",
              d.common_errors ? `<p><strong>Common Errors:</strong> ${d.common_errors}</p>` : "",
              d.variations ? `<p><strong>Variations:</strong> ${d.variations}</p>` : "",
            ].join("");

            // Show diagram only if file exists
            let diagramBlock = "";
            if (d.diagram) {
              const url = `./diagrams/${d.diagram}`;
              if (await fileExists(url)) {
                diagramBlock = d.diagram_embed === false
                  ? `<p class="meta">Diagram: <a href="${url}" target="_blank" rel="noopener">${d.diagram}</a></p>`
                  : `<figure class="figure"><img src="${url}" alt="${d.drill_name || "Diagram"}" loading="lazy"></figure>`;
              }
            }

            const videoLink = (d.video_url || "").trim()
              ? `<p><strong>Video:</strong> <a href="${d.video_url}" target="_blank" rel="noopener">${d.video_url}</a></p>`
              : "";

            return `
              <li class="card">
                <div class="card-body">
                  ${d.drill_name ? `<div class="meta"><strong>${d.drill_name}</strong></div>` : ""}
                  ${tags.length ? `<div class="row">${tags.map(t => `<span class="badge">${t}</span>`).join("")}</div>` : ""}
                  ${prose}
                  ${diagramBlock}
                  ${videoLink}
                </div>
              </li>
            `;
          })
      )).join("");

      const segTitle = `${seg.segment_name || "Segment"}${seg.duration_min ? ` - ${seg.duration_min} min` : ""}`;

      return `
        <details class="card" data-persist="${segKey}" ${isSegOpen ? "open" : ""}>
          <summary class="card-header">
            ${segTitle}
            <span class="chev" aria-hidden="true">›</span>
          </summary>
          <div class="card-body">
            ${seg.objective ? `<p><strong>Objective:</strong> ${seg.objective}</p>` : ""}
            ${seg.cues_headline ? `<p><strong>Cues:</strong> ${seg.cues_headline}</p>` : ""}
            ${drillsHtml ? `<ol class="list">${drillsHtml}</ol>` : `<p class="meta">No drills listed.</p>`}
          </div>
        </details>
      `;
    }));

    const mentorHtml = mentors.map(m => `
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
      <details class="card" data-persist="${planKey}" ${isPlanOpen ? "open" : ""}>
        <summary class="card-header alt">
          ${fmtDate(p.date)}${p.location ? ` • ${p.location}` : ""}${p.theme_title ? ` • ${p.theme_title}` : ""}
          <span class="chev" aria-hidden="true">›</span>
        </summary>
        <div class="card-body">
          ${p.notes_coach ? `<p class="meta">Notes: ${p.notes_coach}</p>` : ""}
          <div class="list">
            ${segBlocks.join("") || `<p class="meta">No segments.</p>`}
          </div>
          ${mentorHtml}
        </div>
      </details>
    `;
  }));

  return `<div class="list">${plansHtml.join("") || "<p>No practice plans yet.</p>"}</div>`;
}

/* ---------- Drills (collapsible + diagram existence check) ---------- */
export async function renderDrills() {
  const drills = await ensureDrillsLib();
  const tags = [...new Set((drills || []).flatMap(d => d.tags || []))];

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
    // Only show diagram if the file actually exists
    let diagramBlock = "";
    if (d.diagram) {
      const url = `./diagrams/${d.diagram}`;
      if (await fileExists(url)) {
        diagramBlock = d.diagram_embed === false
          ? `<p class='meta'>Diagram: <a href="${url}" target="_blank" rel="noopener">${d.diagram}</a></p>`
          : `<figure class="figure"><img src="${url}" alt="${d.name || "Drill"} diagram" loading="lazy"></figure>`;
      }
    }

    const tagRow = d.tags?.length ? `<div class='row'>${d.tags.map(t => `<span class='badge'>${t}</span>`).join("")}</div>` : "";

    const detailLines = [
      d.duration_min ? `Duration: ${d.duration_min} min` : "",
      d.reps ? `Reps: ${d.reps}` : "",
      d.sets ? `Sets: ${d.sets}` : "",
      d.equipment ? `Equipment: ${d.equipment}` : ""
    ].filter(Boolean).map(s => `<div class="meta">${s}</div>`).join("");

    const videoLink = d.video_url ? `<p><strong>Video:</strong> <a href="${d.video_url}" target="_blank" rel="noopener">${d.video_url}</a></p>` : "";

    return `
      <details class='card'>
        <summary class="card-header alt">
          ${d.name || ""}
          <span class="chev" aria-hidden="true">›</span>
        </summary>
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
      </details>`;
  }));
  return html.join("");
}

/* ---------- Mentorship (collapsible) ---------- */
export async function renderMentorship() {
  const items = await loadJSON("./data/mentorship.json");
  return `<div class='list'>${(items || []).map(m => `
    <details class='card'>
      <summary class="card-header alt">
        ${m.theme_title || m.theme_id || m.title || 'Mentorship'}
        <span class="chev" aria-hidden="true">›</span>
      </summary>
      <div class="card-body">
        ${m.story_title ? `<p><strong>${m.story_title}</strong></p>` : ""}
        ${m.script ? `<p>${m.script}</p>` : (m.story ? `<p>${m.story}</p>` : "")}
        ${m.questions ? `<p><em>Questions:</em> ${m.questions}</p>` : ""}
        ${
          m.video_url
            ? `<div class='row'><a class='badge' href='${m.video_url}' target='_blank' rel='noopener'>Watch</a></div>
               <div class='qr' data-qr='${m.video_url}' aria-label='QR to mentorship video'></div>`
            : ""
        }
      </div>
    </details>
  `).join("")}</div>`;
}

/* ---------- Roster ---------- */
export async function renderRoster() {
  const roster = await loadJSON("./data/roster.json");
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

/* ---------- About ---------- */
export async function renderAbout() {
  const s = await loadSettings();
  return `
    <section class='card'>
      <div class="card-header">About</div>
      <div class="card-body">
        <p>Team: ${s.team_name || ""}</p>
        ${s.season ? `<p>Season: ${s.season}</p>` : ""}
        ${s.coach_email ? `<p>Coach: <a href='mailto:${s.coach_email}'>${s.coach_email}</a></p>` : ""}
        <p class='meta'>Edit <code>/data/settings.json</code> to update branding, theme, and links.</p>
      </div>
    </section>`;
}

/* ---------------- Global UI hooks (run once) ---------------- */
(function bootUI() {
  const app = document.getElementById("app");
  if (!app) return;

  // Persist <details> open/closed state (including per-segment)
  document.addEventListener("toggle", (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLDetailsElement)) return;
    const key = el.getAttribute("data-persist");
    if (!key) return;
    setPersistedOpen(key, el.open);
  }, true);

  // Auto-generate QR codes for [data-qr]
  const makeQRs = (root) => {
    if (!root) return;
    // eslint-disable-next-line no-undef
    if (typeof QRCode === "undefined") return;
    root.querySelectorAll("[data-qr]").forEach(node => {
      if (node.getAttribute("data-qr-initialized")) return;
      const url = node.getAttribute("data-qr"); if (!url) return;
      node.setAttribute("data-qr-initialized", "1");
      try { /* eslint-disable no-undef */ new QRCode(node, { text: url, width: 120, height: 120 }); /* eslint-enable */ }
      catch {}
    });
  };

  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => { if (n.nodeType === 1) makeQRs(n); });
    }
  });
  mo.observe(app, { childList: true, subtree: true });
  setTimeout(() => makeQRs(app), 0);

  // Drill search / tag filter / clear
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
})();
