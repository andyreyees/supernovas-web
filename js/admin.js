// ═══════════════════════════════════════════════════════════════
// admin.js — Lógica del panel de administración
// ═══════════════════════════════════════════════════════════════

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── STATE ──────────────────────────────────────────────────────
let periodId    = null;
let periodData  = null;
let allMembers  = {};   // token → memberDoc
let allEvals    = [];   // array de evaluations
let baseUrl     = "";
let editCommId  = null;
let currentAdmin = null;

// ── LOGIN ──────────────────────────────────────────────────────
(function populateAdminSelect() {
  const sel = document.getElementById("login-who");
  ADMINS.forEach((a, i) => {
    sel.innerHTML += `<option value="${i}">${a.name}</option>`;
  });
})();

window.doLogin = function () {
  const idx = document.getElementById("login-who").value;
  const pwd = document.getElementById("login-pwd").value;
  const err = document.getElementById("login-error");

  if (idx === "") { err.textContent = "Selecciona tu nombre."; return; }
  const admin = ADMINS[parseInt(idx)];
  if (pwd !== admin.password) { err.textContent = "Contraseña incorrecta."; return; }

  currentAdmin = admin;
  hide("login-view");
  show("app-view");
  document.getElementById("nav-admin-lbl").textContent = `👤 ${admin.name}`;
  loadLatestPeriod();
};

window.logout = function () { location.reload(); };

// ── TABS ───────────────────────────────────────────────────────
document.querySelectorAll(".nav-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "comisiones")  renderCommissionsTab();
    if (btn.dataset.tab === "links")       renderLinksTab();
    if (btn.dataset.tab === "seguimiento") renderSeguimientoTab();
    if (btn.dataset.tab === "resultados")  renderResultsTab();
  });
});

// ── CARGAR PERÍODO ─────────────────────────────────────────────
async function loadLatestPeriod() {
  const stored = localStorage.getItem("sn_admin_period");
  if (stored) {
    const snap = await getDoc(doc(db, "periods", stored));
    if (snap.exists()) {
      periodId   = stored;
      periodData = snap.data();
      baseUrl    = periodData.baseUrl || "";
      await loadAllData();
      return;
    }
  }
  hide("period-overview");
  show("no-period-msg");
}

async function loadAllData() {
  const mSnap = await getDocs(query(collection(db, "members"), where("periodId", "==", periodId)));
  allMembers  = {};
  mSnap.forEach(d => { allMembers[d.id] = d.data(); });

  // Tiempo real
  onSnapshot(
    query(collection(db, "periods", periodId, "evaluations")),
    snap => {
      allEvals = [];
      snap.forEach(d => allEvals.push(d.data()));
      renderOverview();
      if (document.getElementById("tab-seguimiento").classList.contains("active")) renderSeguimientoTab();
    }
  );

  updateNavPeriod();
  renderOverview();
  renderCommissionsTab();
  populateFilters();
}

function updateNavPeriod() {
  document.getElementById("nav-period-lbl").textContent = periodData?.name || "";
}

// ── CREAR PERÍODO ──────────────────────────────────────────────
window.openNewPeriodModal = function () {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  document.getElementById("np-deadline").value = d.toISOString().slice(0, 16);
  document.getElementById("np-baseurl").value ="https://supernovas-web.vercel.app/index.html";
};

window.createPeriod = async function () {
  const name     = document.getElementById("np-name").value;
  const deadline = document.getElementById("np-deadline").value;
  const bUrl     = document.getElementById("np-baseurl").value.trim();
  if (!deadline) { alert("Elige una fecha límite"); return; }
  if (!bUrl)     { alert("Ingresa la URL base");    return; }

  periodId   = "period_" + Date.now();
  periodData = {
    name, deadline, baseUrl: bUrl,
    open: true,
    createdAt: Date.now(),
    commissions: Object.fromEntries(
      COMMISSIONS.map(c => [c.id, { name: c.name, color: c.color, members: [] }])
    ),
  };

  await setDoc(doc(db, "periods", periodId), periodData);
  baseUrl = bUrl;
  localStorage.setItem("sn_admin_period", periodId);
  closeModal("modal-period");
  await loadAllData();
  toast("Período creado ✓");
};

// ── ABRIR / CERRAR PERÍODO ─────────────────────────────────────
window.togglePeriod = async function () {
  if (!periodId) return;
  const newOpen = !periodData.open;
  await updateDoc(doc(db, "periods", periodId), { open: newOpen });
  periodData.open = newOpen;
  renderOverview();
  toast(newOpen ? "Período abierto ✓" : "Período cerrado ✓");
};

// ── OVERVIEW ───────────────────────────────────────────────────
function renderOverview() {
  if (!periodData) return;
  hide("no-period-msg");
  show("period-overview");

  document.getElementById("ov-title").textContent       = periodData.name;
  document.getElementById("ov-period-name").textContent = periodData.name;

  const dl = periodData.deadline ? new Date(periodData.deadline) : null;
  document.getElementById("ov-deadline").textContent = dl
    ? `Fecha límite: ${dl.toLocaleDateString("es-CR", { day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" })}`
    : "Sin fecha límite";

  const isOpen = periodData.open && (!dl || new Date() < dl);
  document.getElementById("ov-status").innerHTML = isOpen
    ? `<span class="status-open"><span class="dot"></span>Abierto</span>`
    : `<span class="status-closed"><span class="dot"></span>Cerrado</span>`;
  document.getElementById("btn-toggle-period").textContent = isOpen ? "Cerrar período" : "Reabrir período";

  // Métricas globales
  let totalExpected = 0;
  Object.values(allMembers).forEach(m => {
    const comm = periodData.commissions[m.commissionId];
    if (comm) totalExpected += Math.max(0, comm.members.length - 1);
  });
  const totalDone = allEvals.length;
  const pct = totalExpected > 0 ? Math.round(totalDone / totalExpected * 100) : 0;

  document.getElementById("ov-pct").textContent     = pct + "%";
  document.getElementById("ov-done").textContent    = totalDone;
  document.getElementById("ov-pending").textContent = Math.max(0, totalExpected - totalDone);

  // Grid por comisión
  let html = "";
  COMMISSIONS.forEach(meta => {
    const comm = periodData.commissions[meta.id];
    if (!comm || comm.members.length < 2) return;
    const exp  = comm.members.length * (comm.members.length - 1);
    const done = allEvals.filter(e => e.commissionId === meta.id).length;
    const p    = exp > 0 ? Math.round(done / exp * 100) : 0;
    html += `
      <div class="comm-card">
        <div class="comm-card-top">
          <div class="comm-name" style="color:${meta.color}">${meta.name}</div>
          <div class="comm-pct" style="color:${meta.color}">${p}%</div>
        </div>
        <div class="comm-meta">${comm.members.length} miembros · ${done}/${exp}</div>
        <div class="pbar"><div class="pbar-fill" style="width:${p}%;background:${meta.color}"></div></div>
      </div>`;
  });
  document.getElementById("ov-comm-grid").innerHTML = html
    || `<p style="color:var(--text3);font-size:14px">Agrega miembros a las comisiones para ver el progreso.</p>`;
}

// ── COMISIONES ─────────────────────────────────────────────────
window.renderCommissionsTab = function () {
  if (!periodData) {
    document.getElementById("comm-list").innerHTML = `<p style="color:var(--text3);font-size:14px">Crea un período primero.</p>`;
    return;
  }
  let html = "";
  COMMISSIONS.forEach(meta => {
    const comm    = periodData.commissions[meta.id];
    const members = comm?.members || [];
    const tags    = members.map(m =>
      `<span style="font-size:12px;padding:3px 10px;border-radius:20px;background:var(--surface);border:1px solid var(--border);color:var(--text2)">${m}</span>`
    ).join("");

    html += `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
          <div>
            <div style="font-size:14px;font-weight:700;color:${meta.color};margin-bottom:4px">${meta.name}</div>
            <div style="font-size:12px;color:var(--text3)">${members.length} miembro${members.length !== 1 ? "s" : ""}</div>
          </div>
          <button class="btn-tiny" onclick="openEditMembers('${meta.id}')">Editar miembros</button>
        </div>
        ${members.length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:1rem">${tags}</div>`
          : `<p style="font-size:12px;color:var(--text3);margin-top:1rem">Sin miembros — agrega para generar links.</p>`}
      </div>`;
  });
  document.getElementById("comm-list").innerHTML = html;
};

window.openEditMembers = function (commId) {
  editCommId = commId;
  const meta    = COMMISSIONS.find(c => c.id === commId);
  const current = periodData.commissions[commId]?.members?.join("\n") || "";
  document.getElementById("modal-members-title").textContent = `Miembros — ${meta.name}`;
  document.getElementById("modal-members-input").value = current;
  show("modal-members");
};

window.saveMembers = async function () {
  if (!editCommId || !periodId) return;
  const raw     = document.getElementById("modal-members-input").value.trim();
  const members = raw.split("\n").map(m => m.trim()).filter(m => m.length > 0);
  if (members.length < 2) { alert("Se necesitan al menos 2 miembros"); return; }

  periodData.commissions[editCommId].members = members;
  await updateDoc(doc(db, "periods", periodId), {
    [`commissions.${editCommId}.members`]: members,
  });

  // Generar tokens para miembros nuevos
  const existing = Object.entries(allMembers)
    .filter(([, m]) => m.commissionId === editCommId)
    .map(([token, m]) => ({ token, name: m.name }));

  for (const name of members) {
    if (!existing.find(e => e.name === name)) {
      const token = generateToken();
      const mDoc  = { token, name, commissionId: editCommId, periodId };
      await setDoc(doc(db, "members", token), mDoc);
      allMembers[token] = mDoc;
    }
  }

  closeModal("modal-members");
  renderCommissionsTab();
  populateFilters();
  renderLinksTab();
  toast("Miembros y links actualizados ✓");
};

// ── LINKS ──────────────────────────────────────────────────────
window.renderLinksTab = function () {
  const filter = document.getElementById("links-filter").value;
  const rows   = Object.entries(allMembers)
    .filter(([, m]) => !filter || m.commissionId === filter)
    .map(([token, m]) => {
      const commMeta = COMMISSIONS.find(c => c.id === m.commissionId);
      const comm     = periodData?.commissions[m.commissionId];
      const total    = comm ? comm.members.length - 1 : 0;
      const done     = allEvals.filter(e => e.evaluatorToken === token).length;
      const link     = `${baseUrl}?token=${token}`;
      const complete = done >= total && total > 0;
      return `
        <tr>
          <td><div style="display:flex;align-items:center;gap:10px">
            <div class="avatar">${initials(m.name)}</div>${m.name}
          </div></td>
          <td style="color:${commMeta?.color || "var(--text2)"}">${commMeta?.name || m.commissionId}</td>
          <td><span class="done-badge ${complete ? "yes" : "no"}">${done}/${total}</span></td>
          <td><span class="link-copy" onclick="copyLink('${link}')" title="Clic para copiar">${link}</span></td>
          <td><button class="btn-tiny" onclick="copyLink('${link}')">Copiar</button></td>
        </tr>`;
    }).join("");

  document.getElementById("links-tbody").innerHTML = rows
    || `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:2rem">Sin miembros configurados aún.</td></tr>`;
};

window.copyLink = function (link) {
  navigator.clipboard.writeText(link).then(() => toast("Link copiado ✓"));
};

window.copyAllLinks = function () {
  const filter = document.getElementById("links-filter").value;
  const lines  = Object.entries(allMembers)
    .filter(([, m]) => !filter || m.commissionId === filter)
    .map(([token, m]) => {
      const comm = COMMISSIONS.find(c => c.id === m.commissionId);
      return `${m.name} (${comm?.name}): ${baseUrl}?token=${token}`;
    }).join("\n");
  navigator.clipboard.writeText(lines).then(() => toast("Todos los links copiados ✓"));
};

// ── SEGUIMIENTO ────────────────────────────────────────────────
window.renderSeguimientoTab = function () {
  if (!periodData) {
    document.getElementById("seg-body").innerHTML = `<p style="color:var(--text3);font-size:14px">Crea un período primero.</p>`;
    return;
  }

  const filter       = document.getElementById("seg-filter").value;
  const commsToShow  = COMMISSIONS.filter(c => {
    const comm = periodData.commissions[c.id];
    return (!filter || c.id === filter) && comm?.members?.length >= 2;
  });

  if (!commsToShow.length) {
    document.getElementById("seg-body").innerHTML = `<p style="color:var(--text3);font-size:14px">No hay comisiones con miembros aún.</p>`;
    return;
  }

  // Resumen global
  let gTotal = 0, gDone = 0, gComplete = 0, gNotStarted = 0;
  commsToShow.forEach(meta => {
    const members = periodData.commissions[meta.id].members;
    members.forEach(ev => {
      const total = members.length - 1;
      const done  = allEvals.filter(e => e.evaluatorName === ev && e.commissionId === meta.id).length;
      gTotal += total; gDone += done;
      if (done >= total) gComplete++;
      else if (done === 0) gNotStarted++;
    });
  });

  let html = `
    <div class="seg-summary-cards">
      <div class="seg-card"><div class="seg-card-val" style="color:var(--accent)">${gTotal > 0 ? Math.round(gDone/gTotal*100) : 0}%</div><div class="seg-card-label">Avance global</div></div>
      <div class="seg-card"><div class="seg-card-val" style="color:var(--green)">${gDone}</div><div class="seg-card-label">Evaluaciones enviadas</div></div>
      <div class="seg-card"><div class="seg-card-val" style="color:var(--green)">${gComplete}</div><div class="seg-card-label">Personas completas</div></div>
      <div class="seg-card"><div class="seg-card-val" style="color:var(--red)">${gTotal - gDone}</div><div class="seg-card-label">Pendientes totales</div></div>
    </div>`;

  commsToShow.forEach(meta => {
    const members = periodData.commissions[meta.id].members;
    const exp     = members.length * (members.length - 1);
    const done    = allEvals.filter(e => e.commissionId === meta.id).length;
    const pct     = exp > 0 ? Math.round(done / exp * 100) : 0;

    // Set de pares completados: "evaluador→evaluado"
    const doneSet = new Set();
    allEvals.filter(e => e.commissionId === meta.id)
      .forEach(e => doneSet.add(`${e.evaluatorName}→${e.peerName}`));

    const colHeaders = members.map(m => `<th title="${m}">${m.split(" ")[0]}</th>`).join("");

    const rows = members.map(evaluator => {
      const evDone  = members.filter(p => p !== evaluator && doneSet.has(`${evaluator}→${p}`)).length;
      const evTotal = members.length - 1;
      const rowCls  = evDone >= evTotal ? "complete" : evDone > 0 ? "partial" : "empty";

      const cells = members.map(peer => {
        if (peer === evaluator) return `<td class="cell-self"></td>`;
        const isDone = doneSet.has(`${evaluator}→${peer}`);
        return `<td title="${evaluator} evaluó a ${peer}: ${isDone ? "✓" : "Pendiente"}">
          ${isDone ? `<span class="cell-done">✓</span>` : `<span class="cell-pending"></span>`}
        </td>`;
      }).join("");

      return `
        <tr>
          <td class="name-cell">
            <div class="member-row-summary">
              <span>${evaluator}</span>
              <span class="row-pct ${rowCls}">${evDone}/${evTotal}</span>
            </div>
          </td>
          ${cells}
        </tr>`;
    }).join("");

    // Listas detalladas
    const pendingItems = [], doneItems = [];
    members.forEach(ev => {
      members.forEach(peer => {
        if (peer === ev) return;
        if (doneSet.has(`${ev}→${peer}`)) doneItems.push({ ev, peer });
        else pendingItems.push({ ev, peer });
      });
    });

    html += `
      <div class="seg-section">
        <div class="seg-header">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${meta.color};margin-bottom:3px">COMISIÓN</div>
            <div style="font-size:18px;font-weight:800">${meta.name}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="height:6px;width:120px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${meta.color};border-radius:3px"></div>
            </div>
            <span style="font-size:12px;color:var(--text3)">${done}/${exp} · ${pct}%</span>
          </div>
        </div>

        <div class="card" style="padding:0;overflow:hidden;margin-bottom:1rem">
          <div class="matrix-wrap">
            <table class="matrix">
              <thead>
                <tr>
                  <th class="row-header">Evaluador ↓ / Evaluado →</th>
                  ${colHeaders}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>

        <div class="pending-lists">
          <div class="pending-list">
            <div class="pending-list-title">⏳ Pendientes (${pendingItems.length})</div>
            ${pendingItems.length === 0
              ? `<div style="font-size:13px;color:var(--green)">¡Todo completado! ✓</div>`
              : pendingItems.map(p => `
                  <div class="pending-item">
                    <span class="arrow-pending">✗</span>
                    <span><strong>${p.ev}</strong> → ${p.peer}</span>
                  </div>`).join("")}
          </div>
          <div class="pending-list">
            <div class="pending-list-title">✅ Completadas (${doneItems.length})</div>
            ${doneItems.length === 0
              ? `<div style="font-size:13px;color:var(--text3)">Sin evaluaciones aún.</div>`
              : doneItems.map(p => `
                  <div class="pending-item">
                    <span class="arrow-done">✓</span>
                    <span>${p.ev} → ${p.peer}</span>
                  </div>`).join("")}
          </div>
        </div>
      </div>`;
  });

  document.getElementById("seg-body").innerHTML = html;
};

// ── RESULTADOS ─────────────────────────────────────────────────
window.renderResultsTab = function () {
  if (!periodData) return;
  const filter      = document.getElementById("results-filter").value;
  const commsToShow = COMMISSIONS.filter(c => {
    const comm = periodData.commissions[c.id];
    return (!filter || c.id === filter) && comm?.members?.length >= 2;
  });

  if (!commsToShow.length) {
    document.getElementById("results-body").innerHTML = `<p style="color:var(--text3);font-size:14px">No hay comisiones con datos aún.</p>`;
    return;
  }

  let html = "";

  commsToShow.forEach(meta => {
    const comm  = periodData.commissions[meta.id];
    const evals = allEvals.filter(e => e.commissionId === meta.id);

    // Calcular puntajes por miembro
    const scores = {};
    comm.members.forEach(name => {
      scores[name] = {
        criteria:    Object.fromEntries(CRITERIA.map(cr => [cr.key, { sum: 0, count: 0 }])),
        total: 0, count: 0,
        strengths: [], improvements: [], evaluators: [],
      };
    });

    evals.forEach(ev => {
      const s = scores[ev.peerName];
      if (!s) return;
      CRITERIA.forEach(cr => {
        if (ev.criteria?.[cr.key]) { s.criteria[cr.key].sum += ev.criteria[cr.key]; s.criteria[cr.key].count++; }
      });
      const avg = CRITERIA.reduce((a, cr) => a + (ev.criteria?.[cr.key] || 0), 0) / CRITERIA.length;
      s.total += avg; s.count++;
      if (ev.strength)      s.strengths.push(ev.strength);
      if (ev.improve)       s.improvements.push(ev.improve);
      if (ev.evaluatorName) s.evaluators.push(ev.evaluatorName);
    });

    const ranked = comm.members
      .map(name => ({ name, s: scores[name], avg: scores[name].count > 0 ? scores[name].total / scores[name].count : null }))
      .sort((a, b) => (b.avg || 0) - (a.avg || 0));

    // Tabla resumen
    html += `
      <div style="margin-bottom:3rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;flex-wrap:wrap;gap:.5rem">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${meta.color};margin-bottom:3px">COMISIÓN</div>
            <div style="font-size:20px;font-weight:800">${meta.name}</div>
          </div>
          <div style="font-size:13px;color:var(--text3)">${evals.length} evaluaciones · ${comm.members.length} miembros</div>
        </div>

        <div class="card" style="padding:0;overflow:hidden;margin-bottom:1.5rem">
          <table class="result-table">
            <thead><tr>
              <th>#</th><th>Miembro</th>
              ${CRITERIA.map(cr => `<th>${cr.label.split(" ").slice(0,2).join(" ")}</th>`).join("")}
              <th>Promedio</th><th>Recibidas</th>
            </tr></thead>
            <tbody>
              ${ranked.map((r, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                return `
                  <tr>
                    <td style="color:var(--text3)">${medal || i + 1}</td>
                    <td><div style="display:flex;align-items:center;gap:10px">
                      <div class="avatar">${initials(r.name)}</div>${r.name}
                    </div></td>
                    ${CRITERIA.map(cr => {
                      const v   = r.s.criteria[cr.key];
                      const avg = v.count > 0 ? v.sum / v.count : null;
                      const col = scoreColor(avg);
                      return `<td><span class="score-pill" style="background:${col}20;color:${col}">${avg ? avg.toFixed(1) : "—"}</span></td>`;
                    }).join("")}
                    <td><span class="score-pill" style="background:${scoreColor(r.avg)}20;color:${scoreColor(r.avg)}">
                      ${r.avg !== null ? r.avg.toFixed(2) : "—"}
                    </span></td>
                    <td style="color:var(--text3)">${r.s.count}</td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>

        ${ranked.map(r => {
          if (r.s.count === 0) return "";
          return `
            <div class="card" style="margin-bottom:1rem">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem">
                <div class="avatar" style="width:44px;height:44px;font-size:15px">${initials(r.name)}</div>
                <div style="flex:1">
                  <div style="font-weight:700;font-size:16px">${r.name}</div>
                  <div style="font-size:12px;color:var(--text3)">Evaluado por: ${r.s.evaluators.join(", ")}</div>
                </div>
                <div style="font-size:28px;font-weight:800;color:${scoreColor(r.avg)}">${r.avg !== null ? r.avg.toFixed(2) : "—"}</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:1rem">
                ${CRITERIA.map(cr => {
                  const v   = r.s.criteria[cr.key];
                  const avg = v.count > 0 ? v.sum / v.count : null;
                  return `
                    <div style="background:var(--surface2);border-radius:9px;padding:10px 12px">
                      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">${cr.label}</div>
                      <div class="bar-wrap">
                        <div class="bar-bg"><div class="bar-fg" style="width:${avg ? avg/5*100 : 0}%;background:${scoreColor(avg)}"></div></div>
                        <div style="font-size:13px;font-weight:700;color:${scoreColor(avg)};min-width:28px">${avg ? avg.toFixed(1) : "—"}</div>
                      </div>
                    </div>`;
                }).join("")}
              </div>
              ${r.s.strengths.length > 0 || r.s.improvements.length > 0 ? `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  ${r.s.strengths.length > 0 ? `
                    <div style="background:var(--surface2);border-radius:9px;padding:10px 12px">
                      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">★ Fortalezas</div>
                      ${r.s.strengths.map(s => `<div style="font-size:13px;color:var(--text2);margin-bottom:4px">• ${s}</div>`).join("")}
                    </div>` : ""}
                  ${r.s.improvements.length > 0 ? `
                    <div style="background:var(--surface2);border-radius:9px;padding:10px 12px">
                      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">↑ Mejoras</div>
                      ${r.s.improvements.map(s => `<div style="font-size:13px;color:var(--text2);margin-bottom:4px">• ${s}</div>`).join("")}
                    </div>` : ""}
                </div>` : ""}
            </div>`;
        }).join("")}
      </div>`;
  });

  document.getElementById("results-body").innerHTML = html
    || `<p style="color:var(--text3);font-size:14px">Aún no hay evaluaciones enviadas.</p>`;
};

// ── FILTERS ────────────────────────────────────────────────────
function populateFilters() {
  const opts = COMMISSIONS
    .filter(m => (periodData?.commissions[m.id]?.members?.length || 0) >= 2)
    .map(m => `<option value="${m.id}">${m.name}</option>`)
    .join("");

  ["links-filter", "results-filter", "seg-filter"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = `<option value="">Todas las comisiones</option>` + opts;
  });
}

// ── HELPERS ────────────────────────────────────────────────────
function show(id)  { document.getElementById(id)?.classList.remove("hidden"); }
function hide(id)  { document.getElementById(id)?.classList.add("hidden"); }
window.closeModal  = (id) => document.getElementById(id).classList.add("hidden");

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}
window.toast = toast;
