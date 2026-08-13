import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import {
  doc, getDoc, collection, query, orderBy,
  onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import PizarraFlotante from "../components/PizarraFlotante";

// ────────────────────────────────────────────────────────────
// Configuración de cada sección: título, ícono, campos del form,
// columnas de la tabla y cómo se renderiza cada fila.
// ────────────────────────────────────────────────────────────
const ESTADOS_OBRA = ["Planificado", "En curso", "Pausado", "Finalizado"];
const ESTADOS_SERVICIO = ["Sin iniciar", "En obra", "Habilitado"];
const ESTADOS_LEGAL = ["Pendiente", "En trámite", "Aprobado"];

const SECCIONES = {
  etapas: {
    nombre: "Etapas", icono: "📐", coleccion: "desarrollos_etapas",
    orden: "nombre",
    campos: [
      { id: "nombre", label: "Nombre de la etapa", tipo: "text", req: true, ph: "Ej: Etapa 1" },
      { id: "estado", label: "Estado", tipo: "select", opciones: ESTADOS_OBRA, def: "Planificado" },
      { id: "avance", label: "Avance (%)", tipo: "number", def: 0, min: 0, max: 100 },
      { id: "cantLotes", label: "Cantidad de lotes", tipo: "number", def: 0, min: 0 },
      { id: "fechaInicio", label: "Fecha de inicio", tipo: "date" },
      { id: "fechaFin", label: "Fecha estimada de fin", tipo: "date" },
      { id: "notas", label: "Notas", tipo: "textarea", ph: "Observaciones..." },
    ],
    columnas: [
      { id: "nombre", label: "Etapa", flex: 2 },
      { id: "estado", label: "Estado", tipo: "badge" },
      { id: "avance", label: "Avance", tipo: "progress" },
      { id: "cantLotes", label: "Lotes", flex: 1 },
    ],
  },
  lotes: {
    nombre: "Manzanas y lotes", icono: "🧩", coleccion: "desarrollos_manzanas",
    orden: "nombre",
    campos: [
      { id: "nombre", label: "Manzana", tipo: "text", req: true, ph: "Ej: Manzana A" },
      { id: "etapa", label: "Etapa", tipo: "text", ph: "Ej: Etapa 1" },
      { id: "totalLotes", label: "Lotes totales", tipo: "number", def: 0, min: 0 },
      { id: "vendidos", label: "Lotes vendidos", tipo: "number", def: 0, min: 0 },
      { id: "estado", label: "Estado", tipo: "select", opciones: ESTADOS_OBRA, def: "Planificado" },
      { id: "notas", label: "Notas", tipo: "textarea", ph: "Observaciones..." },
    ],
    columnas: [
      { id: "nombre", label: "Manzana", flex: 2 },
      { id: "etapa", label: "Etapa", flex: 1 },
      { id: "totalLotes", label: "Lotes", flex: 1 },
      { id: "vendidos", label: "Vendidos", flex: 1 },
      { id: "estado", label: "Estado", tipo: "badge" },
    ],
  },
  avance: {
    nombre: "Avance de obra", icono: "🚧", coleccion: "desarrollos_avance",
    orden: "nombre",
    campos: [
      { id: "nombre", label: "Tarea / hito", tipo: "text", req: true, ph: "Ej: Apertura de calles" },
      { id: "etapa", label: "Etapa", tipo: "text", ph: "Ej: Etapa 1" },
      { id: "avance", label: "Progreso (%)", tipo: "number", def: 0, min: 0, max: 100 },
      { id: "estado", label: "Estado", tipo: "select", opciones: ESTADOS_OBRA, def: "Planificado" },
      { id: "responsable", label: "Responsable", tipo: "text", ph: "Ej: Contratista X" },
      { id: "fechaFin", label: "Fecha estimada", tipo: "date" },
      { id: "notas", label: "Notas", tipo: "textarea", ph: "Observaciones..." },
    ],
    columnas: [
      { id: "nombre", label: "Tarea", flex: 2 },
      { id: "etapa", label: "Etapa", flex: 1 },
      { id: "avance", label: "Progreso", tipo: "progress" },
      { id: "estado", label: "Estado", tipo: "badge" },
    ],
  },
  infraestructura: {
    nombre: "Infraestructura", icono: "🔌", coleccion: "desarrollos_infra",
    orden: "nombre",
    campos: [
      { id: "nombre", label: "Servicio", tipo: "text", req: true, ph: "Ej: Red de agua" },
      { id: "etapa", label: "Etapa", tipo: "text", ph: "Ej: Etapa 1" },
      { id: "estado", label: "Estado", tipo: "select", opciones: ESTADOS_SERVICIO, def: "Sin iniciar" },
      { id: "avance", label: "Avance (%)", tipo: "number", def: 0, min: 0, max: 100 },
      { id: "proveedor", label: "Proveedor / empresa", tipo: "text", ph: "Ej: Cooperativa..." },
      { id: "notas", label: "Notas", tipo: "textarea", ph: "Observaciones..." },
    ],
    columnas: [
      { id: "nombre", label: "Servicio", flex: 2 },
      { id: "etapa", label: "Etapa", flex: 1 },
      { id: "avance", label: "Avance", tipo: "progress" },
      { id: "estado", label: "Estado", tipo: "badge" },
    ],
  },
  agrimensura: {
    nombre: "Agrimensura", icono: "📏", coleccion: "desarrollos_agrimensura",
    orden: "nombre",
    campos: [
      { id: "nombre", label: "Mensura / plano", tipo: "text", req: true, ph: "Ej: Mensura Etapa 1" },
      { id: "etapa", label: "Etapa", tipo: "text", ph: "Ej: Etapa 1" },
      { id: "estado", label: "Estado", tipo: "select", opciones: ESTADOS_LEGAL, def: "Pendiente" },
      { id: "agrimensor", label: "Agrimensor", tipo: "text", ph: "Nombre del agrimensor" },
      { id: "expediente", label: "N° de expediente", tipo: "text", ph: "Ej: 1234/25" },
      { id: "fechaFin", label: "Fecha de presentación", tipo: "date" },
      { id: "notas", label: "Notas", tipo: "textarea", ph: "Observaciones..." },
    ],
    columnas: [
      { id: "nombre", label: "Mensura", flex: 2 },
      { id: "etapa", label: "Etapa", flex: 1 },
      { id: "agrimensor", label: "Agrimensor", flex: 1 },
      { id: "estado", label: "Estado", tipo: "badge" },
    ],
  },
};

// Colores de badge según el texto del estado
function badgeColor(estado) {
  const e = (estado || "").toLowerCase();
  if (["finalizado", "habilitado", "aprobado"].includes(e)) return { bg: "#16a34a22", fg: "#16a34a" };
  if (["en curso", "en obra", "en trámite"].includes(e)) return { bg: "#2563eb22", fg: "#2563eb" };
  if (["pausado"].includes(e)) return { bg: "#f59e0b22", fg: "#f59e0b" };
  return { bg: "#64748b22", fg: "#64748b" }; // planificado / sin iniciar / pendiente
}

export default function DesarrollosSecciones() {
  const { proyectoId, seccionId } = useParams();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const cfg = SECCIONES[seccionId];

  const [proyecto, setProyecto] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Cargar proyecto y validar pertenencia
  useEffect(() => {
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, "proyectos", proyectoId));
        if (snap.exists() && snap.data().empresaId === currentUser.uid) {
          setProyecto({ id: snap.id, ...snap.data() });
        } else {
          navigate("/proyectos");
        }
      } catch {
        navigate("/proyectos");
      }
      setLoading(false);
    }
    cargar();
  }, [proyectoId, currentUser.uid, navigate]);

  // Suscripción en vivo a la colección de la sección
  useEffect(() => {
    if (!cfg) return;
    const ref = collection(db, "proyectos", proyectoId, cfg.coleccion);
    const q = query(ref, orderBy(cfg.orden || "nombre"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => setItems([]));
    return () => unsub();
  }, [proyectoId, cfg]);

  if (!cfg) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyWrap}>
          <p style={{ color: "var(--text2)" }}>Sección no encontrada.</p>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/desarrollos`)}>← Volver</button>
        </div>
      </div>
    );
  }

  function nuevoForm() {
    const f = {};
    cfg.campos.forEach(c => { f[c.id] = c.def !== undefined ? c.def : ""; });
    return f;
  }

  function abrirNuevo() {
    setEditId(null);
    setForm(nuevoForm());
    setModalOpen(true);
  }

  function abrirEditar(item) {
    setEditId(item.id);
    const f = {};
    cfg.campos.forEach(c => { f[c.id] = item[c.id] !== undefined ? item[c.id] : (c.def !== undefined ? c.def : ""); });
    setForm(f);
    setModalOpen(true);
  }

  async function guardar() {
    const reqFalta = cfg.campos.find(c => c.req && !String(form[c.id] || "").trim());
    if (reqFalta) { alert(`Completá: ${reqFalta.label}`); return; }
    setSaving(true);
    try {
      const data = {};
      cfg.campos.forEach(c => {
        let v = form[c.id];
        if (c.tipo === "number") v = Number(v) || 0;
        data[c.id] = v ?? "";
      });
      const ref = collection(db, "proyectos", proyectoId, cfg.coleccion);
      if (editId) {
        await updateDoc(doc(db, "proyectos", proyectoId, cfg.coleccion, editId), { ...data, actualizado: serverTimestamp() });
      } else {
        await addDoc(ref, { ...data, creado: serverTimestamp() });
      }
      setModalOpen(false);
    } catch (e) {
      alert("Error al guardar: " + e.message);
    }
    setSaving(false);
  }

  async function borrar(item) {
    if (!window.confirm(`¿Eliminar "${item.nombre}"?`)) return;
    try {
      await deleteDoc(doc(db, "proyectos", proyectoId, cfg.coleccion, item.id));
    } catch (e) {
      alert("Error al eliminar: " + e.message);
    }
  }

  if (loading) return <div style={{ padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>Cargando...</div>;

  // Resumen numérico arriba
  const totalItems = items.length;
  const avgAvance = cfg.campos.some(c => c.id === "avance")
    ? Math.round(items.reduce((a, i) => a + (Number(i.avance) || 0), 0) / (totalItems || 1))
    : null;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/desarrollos`)}>← Volver</button>
          <div style={styles.areaInfo}>
            <span style={{ fontSize: "26px" }}>{cfg.icono}</span>
            <div>
              <h1 style={styles.headerTitle}>{cfg.nombre}</h1>
              <p style={styles.headerSub}>{proyecto?.nombre} · Desarrollos y Obras</p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.toolbar}>
          <div style={styles.stats}>
            <div style={styles.stat}>
              <span style={styles.statNum}>{totalItems}</span>
              <span style={styles.statLbl}>Registros</span>
            </div>
            {avgAvance !== null && (
              <div style={styles.stat}>
                <span style={styles.statNum}>{avgAvance}%</span>
                <span style={styles.statLbl}>Avance promedio</span>
              </div>
            )}
          </div>
          <button style={styles.addBtn} onClick={abrirNuevo}>+ Agregar</button>
        </div>

        {items.length === 0 ? (
          <div style={styles.emptyCard}>
            <span style={{ fontSize: "42px" }}>{cfg.icono}</span>
            <p style={styles.emptyText}>Todavía no hay registros. Agregá el primero con el botón de arriba.</p>
          </div>
        ) : (
          <div style={styles.table}>
            <div style={styles.thead}>
              {cfg.columnas.map(col => (
                <div key={col.id} style={{ ...styles.th, flex: col.flex || 1.4 }}>{col.label}</div>
              ))}
              <div style={{ ...styles.th, flex: 0.8, textAlign: "right" }}>Acciones</div>
            </div>
            {items.map(item => (
              <div key={item.id} style={styles.tr}>
                {cfg.columnas.map(col => (
                  <div key={col.id} style={{ ...styles.td, flex: col.flex || 1.4 }}>
                    {col.tipo === "badge" ? (
                      <span style={{ ...styles.badge, background: badgeColor(item[col.id]).bg, color: badgeColor(item[col.id]).fg }}>
                        {item[col.id] || "—"}
                      </span>
                    ) : col.tipo === "progress" ? (
                      <div style={styles.progressWrap}>
                        <div style={styles.progressBar}>
                          <div style={{ ...styles.progressFill, width: `${Math.min(100, Number(item[col.id]) || 0)}%` }} />
                        </div>
                        <span style={styles.progressTxt}>{Number(item[col.id]) || 0}%</span>
                      </div>
                    ) : (
                      <span style={styles.cellTxt}>{item[col.id] || "—"}</span>
                    )}
                  </div>
                ))}
                <div style={{ ...styles.td, flex: 0.8, justifyContent: "flex-end", gap: "6px" }}>
                  <button style={styles.iconBtn} title="Editar" onClick={() => abrirEditar(item)}>✏️</button>
                  <button style={styles.iconBtn} title="Eliminar" onClick={() => borrar(item)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modalOpen && (
        <div style={styles.modalOverlay} onClick={() => !saving && setModalOpen(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editId ? "Editar" : "Nuevo"} · {cfg.nombre}</h2>
            <div style={styles.formGrid}>
              {cfg.campos.map(c => (
                <div key={c.id} style={{ gridColumn: c.tipo === "textarea" ? "1 / -1" : "auto" }}>
                  <label style={styles.label}>{c.label}{c.req && " *"}</label>
                  {c.tipo === "select" ? (
                    <select style={styles.input} value={form[c.id]} onChange={e => setForm({ ...form, [c.id]: e.target.value })}>
                      {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : c.tipo === "textarea" ? (
                    <textarea style={{ ...styles.input, minHeight: "70px", resize: "vertical" }} placeholder={c.ph || ""} value={form[c.id]} onChange={e => setForm({ ...form, [c.id]: e.target.value })} />
                  ) : (
                    <input
                      style={styles.input}
                      type={c.tipo}
                      placeholder={c.ph || ""}
                      min={c.min}
                      max={c.max}
                      value={form[c.id]}
                      onChange={e => setForm({ ...form, [c.id]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button>
              <button style={styles.saveBtn} onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      <PizarraFlotante contextoId={`desarrollos_${proyectoId}_${seccionId}`} titulo={`${cfg.nombre} · ${proyecto?.nombre || ""}`} />
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  areaInfo: { display: "flex", alignItems: "center", gap: "12px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" },
  toolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "16px" },
  stats: { display: "flex", gap: "16px" },
  stat: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "12px 20px", display: "flex", flexDirection: "column", minWidth: "90px" },
  statNum: { fontSize: "24px", fontWeight: "800", color: "var(--text)" },
  statLbl: { fontSize: "12px", color: "var(--text2)" },
  addBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "12px 22px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
  table: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", overflow: "hidden" },
  thead: { display: "flex", padding: "14px 20px", borderBottom: "1.5px solid var(--border)", background: "var(--nav)" },
  th: { fontSize: "12px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.5px" },
  tr: { display: "flex", padding: "14px 20px", borderBottom: "1px solid var(--border)", alignItems: "center" },
  td: { display: "flex", alignItems: "center", fontSize: "14px", color: "var(--text)" },
  cellTxt: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "700" },
  progressWrap: { display: "flex", alignItems: "center", gap: "8px", width: "100%" },
  progressBar: { flex: 1, height: "8px", background: "var(--border)", borderRadius: "4px", overflow: "hidden", maxWidth: "120px" },
  progressFill: { height: "100%", background: "var(--acc)", borderRadius: "4px", transition: "width 0.3s" },
  progressTxt: { fontSize: "12px", color: "var(--text2)", fontWeight: "600", minWidth: "34px" },
  iconBtn: { background: "transparent", border: "none", cursor: "pointer", fontSize: "16px", padding: "4px", borderRadius: "6px" },
  emptyCard: { textAlign: "center", background: "var(--card)", border: "1.5px dashed var(--border)", borderRadius: "16px", padding: "56px 32px" },
  emptyText: { fontSize: "14px", color: "var(--text2)", lineHeight: "1.6", margin: "12px 0 0" },
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "80px 24px" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
  modal: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "28px", maxWidth: "560px", width: "100%", maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { margin: "0 0 20px", fontSize: "18px", fontWeight: "700", color: "var(--text)" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" },
  label: { display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text2)", marginBottom: "6px" },
  input: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" },
  cancelBtn: { background: "transparent", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  saveBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
};
