import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel } from "../config/appConfig";

// Tamaño de la grilla (imán) en px
const GRID = 20;
// Ancho de la hoja de diseño (px). La altura se ajusta al contenido.
const HOJA_W = 760;

const TIPOS_CAMPO = [
  { id: "texto", label: "Texto", icono: "✏️" },
  { id: "numero", label: "Número", icono: "🔢" },
  { id: "monto", label: "Monto ($)", icono: "💲" },
  { id: "fecha", label: "Fecha", icono: "📅" },
  { id: "opciones", label: "Opciones", icono: "🔘" },
  { id: "sino", label: "Sí / No", icono: "✅" },
];

const snap = (v) => Math.round(v / GRID) * GRID;

export default function ComercialDisenoReserva() {
  const { proyectoId } = useParams();
  const { empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  // titulo del formulario
  const [titulo, setTitulo] = useState("Datos de Cliente");
  // campos: [{ id, label, tipo, x, y, w, opciones }]
  const [campos, setCampos] = useState([]);
  // bloque de titular repetible: campos que forman "datos personales"
  const [tituladoresLabels, setTituladoresLabels] = useState(["Apellido y Nombre", "DNI", "Nacionalidad", "Estado civil", "Domicilio", "N°", "Localidad", "Partido", "Contacto"]);
  const [seleccionado, setSeleccionado] = useState(null);

  const hojaRef = useRef(null);
  const drag = useRef(null); // { id, offsetX, offsetY }

  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "comercial", "ventas") : "editar";
  const puedeEditar = !esEmpleado || nivel === "editar";

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const snapP = await getDoc(doc(db, "proyectos", proyectoId));
      if (!snapP.exists() || snapP.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
      setProyecto({ id: snapP.id, ...snapP.data() });
      const s = await getDoc(doc(db, "comercial_config", `${empresaUid}_${proyectoId}`));
      if (s.exists() && s.data().disenoReserva) {
        const dr = s.data().disenoReserva;
        if (dr.titulo) setTitulo(dr.titulo);
        if (Array.isArray(dr.campos)) setCampos(dr.campos);
        if (Array.isArray(dr.tituladoresLabels)) setTituladoresLabels(dr.tituladoresLabels);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [proyectoId, empresaUid, navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Agregar / editar / borrar campos ──
  function agregarCampo(tipo) {
    const id = "cp_" + Date.now();
    // Ubicarlo en un lugar libre (abajo del todo)
    const maxY = campos.reduce((m, c) => Math.max(m, c.y + 60), 20);
    setCampos([...campos, { id, label: "Nuevo campo", tipo, x: 20, y: snap(maxY), w: 340, opciones: [] }]);
    setSeleccionado(id);
  }
  function agregarBloqueTitular() {
    // Evitar más de un bloque de titular (se repite en el llenado, no en el diseño)
    if (campos.some(c => c.tipo === "titular")) { alert("Ya hay un bloque de titular. Al llenar el formulario se puede repetir con el botón 'Agregar titular'."); return; }
    const id = "tit_" + Date.now();
    const maxY = campos.reduce((m, c) => Math.max(m, c.y + 60), 20);
    setCampos([...campos, { id, label: "Datos del titular", tipo: "titular", x: 20, y: snap(maxY), w: 480, opciones: [] }]);
    setSeleccionado(id);
  }
  function actualizarCampo(id, patch) {
    setCampos(campos.map(c => c.id === id ? { ...c, ...patch } : c));
  }
  function borrarCampo(id) {
    setCampos(campos.filter(c => c.id !== id));
    if (seleccionado === id) setSeleccionado(null);
  }

  // ── Drag con snap a grilla ──
  function onDragStart(e, campo) {
    if (!puedeEditar) return;
    const rect = hojaRef.current.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    drag.current = { id: campo.id, offsetX: px - campo.x, offsetY: py - campo.y };
    setSeleccionado(campo.id);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
    window.addEventListener("touchmove", onDragMove, { passive: false });
    window.addEventListener("touchend", onDragEnd);
  }
  function onDragMove(e) {
    if (!drag.current || !hojaRef.current) return;
    if (e.cancelable) e.preventDefault();
    const rect = hojaRef.current.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    let nx = snap(px - drag.current.offsetX);
    let ny = snap(py - drag.current.offsetY);
    nx = Math.max(0, Math.min(nx, HOJA_W - 100));
    ny = Math.max(0, ny);
    setCampos(prev => prev.map(c => c.id === drag.current.id ? { ...c, x: nx, y: ny } : c));
  }
  function onDragEnd() {
    drag.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    window.removeEventListener("touchmove", onDragMove);
    window.removeEventListener("touchend", onDragEnd);
  }

  // Alto de la hoja según el campo más abajo
  const hojaAlto = Math.max(400, campos.reduce((m, c) => Math.max(m, c.y + 70), 0) + 40);

  async function guardar() {
    setGuardando(true);
    try {
      const ref = doc(db, "comercial_config", `${empresaUid}_${proyectoId}`);
      await setDoc(ref, {
        empresaId: empresaUid,
        proyectoId,
        disenoReserva: { titulo, campos, tituladoresLabels },
        actualizadoEn: new Date().toISOString(),
      }, { merge: true });
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e) { alert("Error al guardar: " + e.message); }
    setGuardando(false);
  }

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  const campoSel = campos.find(c => c.id === seleccionado);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/comercial/config_estrategia`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>🎨 Diseño del formulario de reserva</h1>
            <p style={styles.headerSub}>{proyecto?.nombre}{!puedeEditar && " · 👁️ Solo lectura"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          {puedeEditar && <button style={styles.guardarBtn} onClick={guardar} disabled={guardando}>{guardando ? "..." : guardadoOk ? "✓ Guardado" : "💾 Guardar"}</button>}
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <div style={styles.body}>
        {/* Panel izquierdo: agregar campos y editar el seleccionado */}
        {puedeEditar && (
          <aside style={styles.panel}>
            <div style={styles.panelTit}>Agregar campo</div>
            <div style={styles.tipoGrid}>
              {TIPOS_CAMPO.map(t => (
                <button key={t.id} style={styles.tipoBtn} onClick={() => agregarCampo(t.id)}>{t.icono} {t.label}</button>
              ))}
            </div>
            <button style={styles.titularBtn} onClick={agregarBloqueTitular}>👤 Bloque de titular (repetible)</button>

            <div style={styles.sep} />

            {campoSel ? (
              <>
                <div style={styles.panelTit}>Editar {campoSel.tipo === "titular" ? "bloque titular" : "campo"}</div>
                {campoSel.tipo !== "titular" && (
                  <>
                    <label style={styles.lbl}>Etiqueta</label>
                    <input style={styles.inp} value={campoSel.label} onChange={e => actualizarCampo(campoSel.id, { label: e.target.value })} />

                    <label style={styles.lbl}>Tipo</label>
                    <select style={styles.inp} value={campoSel.tipo} onChange={e => actualizarCampo(campoSel.id, { tipo: e.target.value })}>
                      {TIPOS_CAMPO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </>
                )}

                <label style={styles.lbl}>Ancho</label>
                <div style={styles.anchoRow}>
                  <button style={styles.anchoBtn} onClick={() => actualizarCampo(campoSel.id, { w: Math.max(120, campoSel.w - GRID) })}>−</button>
                  <span style={styles.anchoVal}>{campoSel.w}px</span>
                  <button style={styles.anchoBtn} onClick={() => actualizarCampo(campoSel.id, { w: Math.min(HOJA_W, campoSel.w + GRID) })}>+</button>
                </div>

                {campoSel.tipo === "opciones" && (
                  <>
                    <label style={styles.lbl}>Opciones (una por línea)</label>
                    <textarea style={{ ...styles.inp, minHeight: "70px" }} value={(campoSel.opciones || []).join("\n")} onChange={e => actualizarCampo(campoSel.id, { opciones: e.target.value.split("\n").filter(Boolean) })} />
                  </>
                )}

                <button style={styles.borrarBtn} onClick={() => borrarCampo(campoSel.id)}>🗑️ Borrar campo</button>
              </>
            ) : (
              <div style={styles.hint}>Tocá un campo en la hoja para editarlo. Arrastralos para moverlos — se acomodan solos a la grilla.</div>
            )}
          </aside>
        )}

        {/* Hoja de diseño */}
        <main style={styles.hojaWrap}>
          <div ref={hojaRef} style={{ ...styles.hoja, width: HOJA_W, height: hojaAlto }}>
            <input style={styles.tituloInput} value={titulo} onChange={e => puedeEditar && setTitulo(e.target.value)} disabled={!puedeEditar} />
            {campos.map(c => (
              <div
                key={c.id}
                style={{ ...styles.campo, left: c.x, top: c.y, width: c.w, ...(c.tipo === "titular" ? styles.campoTitular : {}), ...(seleccionado === c.id ? styles.campoSel : {}) }}
                onMouseDown={e => onDragStart(e, c)}
                onTouchStart={e => onDragStart(e, c)}
              >
                {c.tipo === "titular" ? (
                  <div style={{ width: "100%" }}>
                    <div style={styles.titularHead}>👤 Titular <span style={styles.titularHint}>(se repite al llenar)</span></div>
                    <div style={styles.titularGrid}>
                      {tituladoresLabels.map((lb, i) => (
                        <div key={i} style={styles.titularCampo}>
                          <span style={styles.campoLabel}>{lb}:</span>
                          <span style={styles.campoLineaMini} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <span style={styles.campoLabel}>{c.label}:</span>
                    <span style={styles.campoLinea}>{tipoPlaceholder(c.tipo)}</span>
                  </>
                )}
              </div>
            ))}
            {campos.length === 0 && <div style={styles.hojaVacia}>Agregá campos desde el panel de la izquierda y acomodalos acá.</div>}
          </div>
        </main>
      </div>
    </div>
  );
}

function tipoPlaceholder(tipo) {
  if (tipo === "monto") return "$";
  if (tipo === "fecha") return "__/__/____";
  if (tipo === "sino") return "Sí / No";
  return "";
}

const styles = {
  loading: { padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" },
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  headerTitle: { margin: 0, fontSize: "17px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "12px", color: "var(--text2)" },
  guardarBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "700" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  body: { display: "flex", gap: "16px", padding: "16px 24px", alignItems: "flex-start", flexWrap: "wrap" },
  panel: { width: "260px", flexShrink: 0, background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "16px", position: "sticky", top: "16px" },
  panelTit: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "10px" },
  tipoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" },
  tipoBtn: { background: "var(--surface)", border: "1.5px solid var(--border)", color: "var(--text)", padding: "8px 6px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "600" },
  sep: { height: "1px", background: "var(--border)", margin: "16px 0" },
  lbl: { display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text2)", margin: "10px 0 4px" },
  inp: { width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "13px", boxSizing: "border-box", fontFamily: "inherit" },
  anchoRow: { display: "flex", alignItems: "center", gap: "8px" },
  anchoBtn: { width: "32px", height: "32px", borderRadius: "6px", border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", fontSize: "16px" },
  anchoVal: { fontSize: "13px", color: "var(--text2)", minWidth: "50px", textAlign: "center" },
  borrarBtn: { width: "100%", marginTop: "16px", background: "transparent", border: "1.5px solid #dc2626", color: "#dc2626", padding: "9px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  hint: { fontSize: "12.5px", color: "var(--text2)", lineHeight: "1.5", background: "var(--surface)", padding: "12px", borderRadius: "8px" },
  hojaWrap: { flex: 1, minWidth: "320px", overflowX: "auto", display: "flex", justifyContent: "center" },
  hoja: { position: "relative", background: "#ffffff", color: "#111", borderRadius: "4px", boxShadow: "0 4px 24px rgba(0,0,0,0.25)", backgroundImage: "radial-gradient(circle, #e5e5e5 1px, transparent 1px)", backgroundSize: `${GRID}px ${GRID}px`, flexShrink: 0 },
  tituloInput: { position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", textAlign: "center", fontSize: "20px", fontWeight: "800", border: "none", borderBottom: "1px dashed transparent", background: "transparent", color: "#111", width: "70%", outline: "none" },
  campo: { position: "absolute", display: "flex", alignItems: "baseline", gap: "6px", cursor: "grab", padding: "6px 8px", borderRadius: "4px", userSelect: "none", fontSize: "13px", marginTop: "50px" },
  campoSel: { outline: "2px solid #2563eb", background: "rgba(37,99,235,0.06)" },
  campoLabel: { fontWeight: "700", color: "#111", whiteSpace: "nowrap" },
  campoLinea: { flex: 1, color: "#999", borderBottom: "1px solid #333", minWidth: "60px", minHeight: "18px", paddingLeft: "4px", fontSize: "12px" },
  titularBtn: { width: "100%", marginTop: "8px", background: "var(--surface)", border: "1.5px solid var(--acc)", color: "var(--text)", padding: "9px", borderRadius: "8px", cursor: "pointer", fontSize: "12.5px", fontWeight: "700" },
  campoTitular: { border: "1.5px dashed #888", borderRadius: "6px", padding: "10px", background: "rgba(0,0,0,0.02)" },
  titularHead: { fontSize: "13px", fontWeight: "800", color: "#111", marginBottom: "8px" },
  titularHint: { fontSize: "10px", fontWeight: "400", color: "#999" },
  titularGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" },
  titularCampo: { display: "flex", alignItems: "baseline", gap: "4px", fontSize: "12px" },
  campoLineaMini: { flex: 1, borderBottom: "1px solid #333", minWidth: "30px", minHeight: "14px" },
  hojaVacia: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "#aaa", fontSize: "14px", textAlign: "center", width: "80%" },
};
