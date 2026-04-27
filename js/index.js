// ═══════════════════════════════════════════════════════════════
// index.js — Lógica de la página de evaluación (miembros)
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, setDoc, query, where, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── STATE ──────────────────────────────────────────────────────
let memberData = null;
let periodData = null;
let peers      = [];
let peerIdx    = 0;
let answers    = {};
let doneSet    = new Set();

// ── INIT ───────────────────────────────────────────────────────
const token = new URLSearchParams(location.search).get("token");

async function init() {
  if (!token) { showError(); return; }

  try {
    const mSnap = await getDoc(doc(db, "members", token));
    if (!mSnap.exists()) { showError(); return; }
    memberData = mSnap.data();

    const pSnap = await getDoc(doc(db, "periods", memberData.periodId));
    if (!pSnap.exists()) { showError(); return; }
    periodData = pSnap.data();

    // Verificar si el período está abierto
    const now      = new Date();
    const deadline = periodData.deadline ? new Date(periodData.deadline) : null;
    if (!periodData.open || (deadline && now > deadline)) {
      showClosed(deadline, periodData.open);
      return;
    }

    // Cargar evaluaciones ya enviadas
    const comm = periodData.commissions[memberData.commissionId];
    if (!comm) { showError(); return; }

    const evSnap = await getDocs(
      query(collection(db, "periods", memberData.periodId, "evaluations"),
            where("evaluatorToken", "==", token))
    );
    evSnap.forEach(d => doneSet.add(d.data().peerName));

    peers = comm.members.filter(m => m !== memberData.name);
    renderEvalPage(deadline);

  } catch (e) {
    console.error(e);
    showError();
  }
}

// ── VISTAS ─────────────────────────────────────────────────────
function showError() {
  hide("view-loading");
  show("view-error");
}

function showClosed(deadline, open) {
  hide("view-loading");
  show("view-closed");
  if (!open) {
    document.getElementById("closed-title").textContent = "Evaluación no disponible";
    document.getElementById("closed-msg").textContent   = "El administrador aún no ha abierto el período de evaluación.";
  } else if (deadline) {
    document.getElementById("closed-msg").textContent =
      `El período cerró el ${deadline.toLocaleDateString("es-CR", { day:"2-digit", month:"long", year:"numeric" })}. Ya no es posible enviar evaluaciones.`;
  }
}

function renderEvalPage(deadline) {
  hide("view-loading");
  show("view-eval");

  const commMeta = COMMISSIONS.find(c => c.id === memberData.commissionId);
  document.getElementById("topbar-period").textContent    = periodData.name;
  document.getElementById("member-name").textContent      = memberData.name;
  document.getElementById("member-commission").textContent = `Comisión de ${commMeta?.name || memberData.commissionId}`;
  document.getElementById("period-label").textContent     = `★ ${periodData.name}`;

  if (deadline) {
    const daysLeft = Math.ceil((new Date(deadline) - new Date()) / 86400000);
    const dl = document.getElementById("deadline-label");
    dl.textContent = `⏰ Cierra en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`;
    if (daysLeft <= 2) dl.classList.add("urgent");
  } else {
    hide("deadline-label");
  }

  updateProgress();
  renderNextPeer();
}

function updateProgress() {
  const total = peers.length;
  const done  = peers.filter(p => doneSet.has(p)).length;
  const pct   = total > 0 ? Math.round(done / total * 100) : 0;

  document.getElementById("prog-pct").textContent  = pct + "%";
  document.getElementById("prog-fill").style.width = pct + "%";

  const chips = peers.map(p => {
    const isDone = doneSet.has(p);
    return `<div class="peer-chip ${isDone ? "done" : ""}">
      <div class="peer-chip-dot"></div>
      ${p.split(" ")[0]}
    </div>`;
  }).join("");
  document.getElementById("prog-peers").innerHTML = chips;
}

// ── FORMULARIO POR COMPAÑERO ───────────────────────────────────
function renderNextPeer() {
  while (peerIdx < peers.length && doneSet.has(peers[peerIdx])) peerIdx++;

  if (peerIdx >= peers.length) {
    hide("view-eval");
    show("view-done");
    const commMeta = COMMISSIONS.find(c => c.id === memberData.commissionId);
    document.getElementById("done-text").textContent =
      `Evaluaste a tus ${peers.length} compañeros de la comisión de ${commMeta?.name}. ¡Gracias!`;
    return;
  }

  const peer     = peers[peerIdx];
  const existing = answers[peer] || {};
  const commMeta = COMMISSIONS.find(c => c.id === memberData.commissionId);

  // Indicador de pasos
  const stepsHtml = peers.map((p, i) => {
    const isDone = doneSet.has(p) || i < peerIdx;
    const isCur  = i === peerIdx;
    const cls    = isDone ? "done" : isCur ? "current" : "";
    const line   = isDone ? "done" : "";
    return `
      <div class="step-node ${cls}">${isDone ? "✓" : i + 1}</div>
      ${i < peers.length - 1 ? `<div class="step-line ${line}"></div>` : ""}`;
  }).join("");

  // Criterios con estrellas
  const criteriaHtml = CRITERIA.map(cr => {
    const val   = existing[cr.key] || 0;
    const stars = [1,2,3,4,5].map(n =>
      `<span class="star ${n <= val ? "lit" : ""}" data-key="${cr.key}" data-val="${n}">★</span>`
    ).join("");
    return `
      <div class="criterion">
        <div class="criterion-label">${cr.label}</div>
        <div class="criterion-desc">${cr.desc}</div>
        <div class="stars" id="stars-${cr.key}">${stars}</div>
        <div class="star-lbl" id="lbl-${cr.key}">${val ? STAR_LABELS[val - 1] : ""}</div>
      </div>`;
  }).join("");

  document.getElementById("eval-body").innerHTML = `
    <div class="steps">${stepsHtml}</div>
    <div class="peer-card">
      <div class="peer-head">
        <div class="avatar">${initials(peer)}</div>
        <div>
          <div class="peer-name">${peer}</div>
          <div class="peer-meta">Comisión de ${commMeta?.name || ""}</div>
        </div>
        <div class="peer-num">${peerIdx + 1} / ${peers.length}</div>
      </div>

      ${criteriaHtml}

      <div class="comment-group">
        <label>Fortaleza principal que observaste</label>
        <textarea id="inp-strength" rows="2" placeholder="Ej: Muy organizado y puntual con sus tareas…">${existing.strength || ""}</textarea>
      </div>
      <div class="comment-group" style="margin-top:1rem">
        <label>Área de mejora que le sugerirías</label>
        <textarea id="inp-improve" rows="2" placeholder="Ej: Podría comunicar avances con más anticipación…">${existing.improve || ""}</textarea>
      </div>

      <div class="nav-btns">
        <button class="btn-primary" id="btn-next" onclick="saveAndNext()">
          ${peerIdx < peers.length - 1 ? "Guardar y continuar →" : "Enviar evaluación ✓"}
        </button>
        ${peerIdx > 0 ? `<button class="btn-ghost" onclick="goBack()">← Anterior</button>` : ""}
      </div>
    </div>`;

  // Eventos de estrellas
  document.querySelectorAll(".star").forEach(s => {
    s.addEventListener("click", () => {
      const key = s.dataset.key;
      const val = parseInt(s.dataset.val);
      if (!answers[peer]) answers[peer] = {};
      answers[peer][key] = val;
      document.querySelectorAll(`#stars-${key} .star`).forEach((st, i) => {
        st.classList.toggle("lit", i < val);
      });
      document.getElementById(`lbl-${key}`).textContent = STAR_LABELS[val - 1];
    });
  });
}

// ── GUARDAR Y AVANZAR ──────────────────────────────────────────
window.saveAndNext = async function () {
  const peer    = peers[peerIdx];
  const a       = answers[peer] || {};
  const missing = CRITERIA.filter(cr => !a[cr.key]);

  if (missing.length > 0) {
    alert("Por favor califica todos los criterios:\n" + missing.map(m => "• " + m.label).join("\n"));
    return;
  }

  a.strength = document.getElementById("inp-strength").value.trim();
  a.improve  = document.getElementById("inp-improve").value.trim();
  answers[peer] = a;

  const btn = document.getElementById("btn-next");
  btn.disabled    = true;
  btn.textContent = "Guardando…";

  try {
    const evalId = `${token}_${peer.replace(/\s+/g, "_")}`;
    await setDoc(doc(db, "periods", memberData.periodId, "evaluations", evalId), {
      evaluatorToken: token,
      evaluatorName:  memberData.name,
      commissionId:   memberData.commissionId,
      peerName:       peer,
      criteria: {
        participation: a.participation,
        quality:       a.quality,
        teamwork:      a.teamwork,
        initiative:    a.initiative,
        communication: a.communication,
      },
      strength: a.strength,
      improve:  a.improve,
      ts:       Date.now(),
    });

    doneSet.add(peer);
    peerIdx++;
    updateProgress();
    renderNextPeer();

  } catch (e) {
    btn.disabled    = false;
    btn.textContent = "Reintentar";
    alert("Error al guardar. Verifica tu conexión e inténtalo de nuevo.");
  }
};

window.goBack = function () {
  if (peerIdx > 0) { peerIdx--; renderNextPeer(); }
};

// ── HELPERS ────────────────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.remove("hidden"); }
function hide(id) { document.getElementById(id)?.classList.add("hidden"); }

// Arrancar
init();
