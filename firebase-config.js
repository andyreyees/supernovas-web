// ═══════════════════════════════════════════════════════════════════════
// firebase-config.js — Configuración compartida
// ═══════════════════════════════════════════════════════════════════════

// 🔥 Pega aquí tus credenciales de Firebase
const firebaseConfig = {
  apiKey:            "TU_API_KEY_AQUI",
  authDomain:        "TU_PROYECTO.firebaseapp.com",
  projectId:         "TU_PROYECTO",
  storageBucket:     "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID"
};

// 👥 Los 3 admins — cambia nombres y contraseñas
const ADMINS = [
  { name: "Andy",    password: "andy2025"    },
  { name: "Admin 2", password: "admin2_2025" },
  { name: "Admin 3", password: "admin3_2025" },
];

// Comisiones del club
const COMMISSIONS = [
  { id: "eventos",    name: "Eventos",                     color: "#22d3a0" },
  { id: "promocion",  name: "Promoción del Emprendimiento", color: "#f59e0b" },
  { id: "networking", name: "Networking y Alianzas",        color: "#3b82f6" },
  { id: "liderazgo",  name: "Liderazgo",                    color: "#ec4899" },
  { id: "mentores",   name: "Mentores",                     color: "#8b5cf6" },
  { id: "junta",      name: "Junta Directiva",              color: "#ef4444" },
];

// Criterios de evaluación — escala 1 a 5
const CRITERIA = [
  { key: "participation", label: "Participación y asistencia",
    desc: "¿Qué tan consistente fue su asistencia y participación en reuniones?" },
  { key: "quality",       label: "Calidad del trabajo",
    desc: "¿Cómo evalúas la calidad y cumplimiento de sus tareas y entregables?" },
  { key: "teamwork",      label: "Trabajo en equipo",
    desc: "¿Qué tan bien colaboró, apoyó y se integró con los demás miembros?" },
  { key: "initiative",    label: "Iniciativa y proactividad",
    desc: "¿Buscó activamente aportar más allá de sus responsabilidades?" },
  { key: "communication", label: "Comunicación",
    desc: "¿Comunicó avances, problemas y logros de forma clara y oportuna?" },
];

const STAR_LABELS = [
  "Necesita mejorar",
  "Por debajo de lo esperado",
  "Cumple las expectativas",
  "Por encima de lo esperado",
  "Desempeño excepcional",
];

// Utilidades
function generateToken() {
  return Math.random().toString(36).substring(2, 8) +
         Math.random().toString(36).substring(2, 8);
}
function initials(name) {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
}
function scoreColor(v) {
  if (!v) return "#6b7280";
  if (v >= 4.5) return "#22d3a0";
  if (v >= 3.5) return "#f59e0b";
  if (v >= 2.5) return "#3b82f6";
  return "#ef4444";
}
