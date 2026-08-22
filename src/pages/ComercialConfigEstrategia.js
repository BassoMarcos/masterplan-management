import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel, RECORRIDO_BASE } from "../config/appConfig";

const TIPOS = [
  { id: "texto", label: "Texto libre", icono: "✏️" },
  { id: "opciones", label: "Opciones (elegir una)", icono: "🔘" },
  { id: "sino", label: "Sí / No", icono: "✅" },
  { id: "numero", label: "Número", icono: "🔢" },
];

// Configuración de la Estrategia de Ventas: etapas del recorrido + mensaje de WhatsApp.
export default function ComercialConfigEstrategia() {
  const { proyectoId } = useParams();
  const { empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [etapasExtra, setEtapasExtra] = useState([]);
  const [nuevaEtapa, setNuevaEtapa] = useState("");
  const [plantillaWhats, setPlantillaWhats] = useState("Hola {nombre}, te confirmo la firma para el {fecha} a las {hora} hs. ¡Cualquier cosa avisame!");
  const [boletoCampos, setBoletoCampos] = useState([]);
  const [nuevaOpcion, setNuevaOpcion] = useState({});

  // La config de estrategia la puede editar quien tenga edición en ventas (o admin)
  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "comercial", "ventas") : "editar";
  const puedeEditar = !esEmpleado || nivel === "editar";

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const snapP = await getDoc(doc(db, "proyectos", proyectoId));
      if (!snapP.exists() || snapP.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
      setProyecto({ id: snapP.id, ...snapP.data() });
      const snap = await getDoc(doc(db, "comercial_config", `${empresaUid}_${proyectoId}`));
      if (snap.exists()) {
        if (Array.isArray(snap.data().recorridoExtra)) setEtapasExtra(snap.data().recorridoExtra);
        if (snap.data().plantillaWhatsFirma) setPlantillaWhats(snap.data().plantillaWhatsFirma);
        if (Array.isArray(snap.data().boletoCampos)) setBoletoCampos(snap.data().boletoCampos);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [proyectoId, empresaUid, navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  function agregarEtapa() {
    const t = nuevaEtapa.trim();
    if (!t) return;
    setEtapasExtra([...etapasExtra, { id: "et_" + Date.now(), label: t, icono: "📌" }]);
    setNuevaEtapa("");
  }
  function quitarEtapa(id) {
    setEtapasExtra(etapasExtra.filter(e => e.id !== id));
  }

  // ── Campos del boleto ──
  function nuevoCampo() {
    setBoletoCampos([...boletoCampos, { id: "bc_" + Date.now(), texto: "", tipo: "texto", opciones: [], obligatoria: false }]);
  }
  function actualizarCampo(idx, campo, valor) {
    setBoletoCampos(boletoCampos.map((c, i) => i === idx ? { ...c, [campo]: valor } : c));
  }
  function eliminarCampo(idx) {
    setBoletoCampos(boletoCampos.filter((_, i) => i !== idx));
  }
  function moverCampo(idx, dir) {
    const nueva = [...boletoCampos];
    const destino = idx + dir;
    if (destino < 0 || destino >= nueva.length) return;
    [nueva[idx], nueva[destino]] = [nueva[destino], nueva[idx]];
    setBoletoCampos(nueva);
  }
  function agregarOpcionBoleto(idx, texto) {
    const t = (texto || "").trim();
    if (!t) return;
    const opciones = [...(boletoCampos[idx].opciones || []), t];
    actualizarCampo(idx, "opciones", opciones);
  }
  function quitarOpcionBoleto(idx, opIdx) {
    const opciones = (boletoCampos[idx].opciones || []).filter((_, i) => i !== opIdx);
    actualizarCampo(idx, "opciones", opciones);
  }

  async function guardar() {
    // Validar campos del boleto de tipo opciones
    for (const c of boletoCampos) {
      if (c.tipo === "opciones" && (!c.opciones || c.opciones.length < 2)) {
        alert(`El campo "${c.texto || "sin nombre"}" es de opciones: cargá al menos 2 opciones.`); return;
      }
    }
    setGuardando(true);
    try {
      const ref = doc(db, "comercial_config", `${empresaUid}_${proyectoId}`);
      await setDoc(ref, {
        empresaId: empresaUid,
        proyectoId,
        recorridoExtra: etapasExtra,
        plantillaWhatsFirma: plantillaWhats,
        boletoCampos: boletoCampos,
        actualizadoEn: new Date().toISOString(),
      }, { merge: true });
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e) { alert("Error al guardar: " + e.message); }
    setGuardando(false);
  }

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/comercial`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>⚙️ Configuración · Estrategia de Ventas</h1>
            <p style={styles.headerSub}>{proyecto?.nombre} · Comercial{!puedeEditar && " · 👁️ Solo lectura"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Etapas del recorrido */}
        <div style={styles.bloque}>
          <div style={styles.bloqueTitulo}>🛤️ Etapas del recorrido</div>
          <div style={styles.bloqueHint}>Las 8 etapas base vienen fijas. Podés agregar etapas propias al final (piden fecha/hora y nota al marcarlas).</div>
          <div style={styles.etapasBase}>
            {RECORRIDO_BASE.map(p => <span key={p.id} style={styles.etapaBaseTag}>{p.icono} {p.label}</span>)}
          </div>
          {etapasExtra.length > 0 && (
            <div style={styles.etapasExtraLista}>
              {etapasExtra.map(e => (
                <div key={e.id} style={styles.etapaExtraItem}>
                  <span>📌 {e.label}</span>
                  {puedeEditar && <button style={styles.etapaQuitar} onClick={() => quitarEtapa(e.id)}>✕</button>}
                </div>
              ))}
            </div>
          )}
          {puedeEditar && (
            <div style={styles.etapaAgregarRow}>
              <input style={styles.etapaInput} placeholder="Nueva etapa (ej: Seguimiento post-venta)" value={nuevaEtapa} onChange={e => setNuevaEtapa(e.target.value)} onKeyDown={e => e.key === "Enter" && agregarEtapa()} />
              <button style={styles.etapaAddBtn} onClick={agregarEtapa}>Agregar etapa</button>
            </div>
          )}
        </div>

        {/* Plantilla de WhatsApp */}
        <div style={styles.bloque}>
          <div style={styles.bloqueTitulo}>💬 Mensaje de WhatsApp (firma programada)</div>
          <div style={styles.bloqueHint}>Se envía al confirmar la firma. Usá {"{nombre}"}, {"{fecha}"} y {"{hora}"} — se reemplazan solos.</div>
          <textarea style={styles.whatsInput} rows={3} value={plantillaWhats} onChange={e => setPlantillaWhats(e.target.value)} disabled={!puedeEditar} />
        </div>

        {/* Formulario del boleto (etapa Reserva) */}
        <div style={styles.bloque}>
          <div style={styles.bloqueTitulo}>📝 Formulario del boleto (Reserva)</div>
          <div style={styles.bloqueHint}>Estos son los campos que el vendedor completa al marcar la etapa Reserva. Después se usan para armar el boleto.</div>

          {boletoCampos.length === 0 && <div style={styles.boletoVacio}>Todavía no hay campos. Agregá el primero abajo.</div>}

          {boletoCampos.map((c, idx) => (
            <div key={c.id} style={styles.campoBox}>
              <div style={styles.campoHead}>
                <span style={styles.campoNum}>#{idx + 1}</span>
                {puedeEditar && (
                  <div style={styles.campoControls}>
                    <button style={styles.iconBtn} onClick={() => moverCampo(idx, -1)} disabled={idx === 0} title="Subir">↑</button>
                    <button style={styles.iconBtn} onClick={() => moverCampo(idx, 1)} disabled={idx === boletoCampos.length - 1} title="Bajar">↓</button>
                    <button style={styles.iconBtnRed} onClick={() => eliminarCampo(idx)} title="Eliminar">✕</button>
                  </div>
                )}
              </div>

              <input style={styles.inputCampo} placeholder="Nombre del campo (ej: Nombre del comprador, Lote, Monto)" value={c.texto} onChange={e => actualizarCampo(idx, "texto", e.target.value)} disabled={!puedeEditar} />

              <div style={styles.tipoRow}>
                {TIPOS.map(t => (
                  <button key={t.id} onClick={() => puedeEditar && actualizarCampo(idx, "tipo", t.id)} style={{ ...styles.tipoBtn, ...(c.tipo === t.id ? styles.tipoBtnActivo : {}) }} disabled={!puedeEditar}>
                    {t.icono} {t.label}
                  </button>
                ))}
              </div>

              {c.tipo === "opciones" && (
                <div style={styles.opcionesBox}>
                  <div style={styles.opcionesLabel}>Opciones para elegir:</div>
                  {(c.opciones || []).map((op, opIdx) => (
                    <div key={opIdx} style={styles.opcionItem}>
                      <span style={styles.opcionTexto}>• {op}</span>
                      {puedeEditar && <button style={styles.opcionQuitar} onClick={() => quitarOpcionBoleto(idx, opIdx)} title="Quitar">✕</button>}
                    </div>
                  ))}
                  {puedeEditar && (
                    <div style={styles.opcionAgregarRow}>
                      <input style={styles.opcionInput} placeholder="Escribí una opción y tocá Agregar (o Enter)" value={nuevaOpcion[c.id] || ""} onChange={e => setNuevaOpcion({ ...nuevaOpcion, [c.id]: e.target.value })}
                        onKeyDown={e => { if (e.key === "Enter") { agregarOpcionBoleto(idx, nuevaOpcion[c.id]); setNuevaOpcion({ ...nuevaOpcion, [c.id]: "" }); } }} />
                      <button style={styles.opcionAddBtn} onClick={() => { agregarOpcionBoleto(idx, nuevaOpcion[c.id]); setNuevaOpcion({ ...nuevaOpcion, [c.id]: "" }); }}>Agregar</button>
                    </div>
                  )}
                  {(c.opciones || []).length < 2 && <div style={styles.opcionAviso}>Cargá al menos 2 opciones.</div>}
                </div>
              )}

              <label style={styles.obligLabel}>
                <input type="checkbox" checked={!!c.obligatoria} onChange={e => actualizarCampo(idx, "obligatoria", e.target.checked)} disabled={!puedeEditar} />
                Obligatorio
              </label>
            </div>
          ))}

          {puedeEditar && <button style={styles.addCampoBtn} onClick={nuevoCampo}>➕ Agregar campo al boleto</button>}
        </div>

        {puedeEditar && (
          <div style={styles.acciones}>
            <button style={styles.guardarBtn} onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando..." : guardadoOk ? "✓ Guardado" : "💾 Guardar"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  loading: { padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" },
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  headerTitle: { margin: 0, fontSize: "18px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "700px", margin: "0 auto", padding: "32px 24px" },
  bloque: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "18px" },
  bloqueTitulo: { fontSize: "15px", fontWeight: "700", color: "var(--text)", marginBottom: "6px" },
  bloqueHint: { fontSize: "12px", color: "var(--text2)", marginBottom: "12px", lineHeight: "1.4" },
  etapasBase: { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" },
  etapaBaseTag: { fontSize: "12px", background: "var(--surface)", color: "var(--text2)", padding: "4px 10px", borderRadius: "20px", border: "1px solid var(--border)" },
  etapasExtraLista: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" },
  etapaExtraItem: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", color: "var(--text)" },
  etapaQuitar: { background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "13px" },
  etapaAgregarRow: { display: "flex", gap: "8px" },
  etapaInput: { flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "13px", boxSizing: "border-box" },
  etapaAddBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "9px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  whatsInput: { width: "100%", padding: "12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  acciones: { display: "flex", justifyContent: "flex-end" },
  boletoVacio: { fontSize: "13px", color: "var(--text2)", fontStyle: "italic", padding: "8px 0" },
  campoBox: { background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "14px", marginBottom: "12px" },
  campoHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
  campoNum: { fontSize: "13px", fontWeight: "700", color: "var(--text2)" },
  campoControls: { display: "flex", gap: "6px" },
  iconBtn: { background: "var(--bg)", border: "1px solid var(--border2)", color: "var(--text2)", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  iconBtnRed: { background: "var(--bg)", border: "1px solid #dc2626", color: "#dc2626", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  inputCampo: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box", marginBottom: "10px" },
  tipoRow: { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" },
  tipoBtn: { background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "6px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" },
  tipoBtnActivo: { background: "var(--acc)", borderColor: "var(--acc)", color: "#fff", fontWeight: "700" },
  opcionesBox: { background: "var(--bg)", borderRadius: "8px", padding: "10px", marginBottom: "10px" },
  opcionesLabel: { fontSize: "12px", fontWeight: "600", color: "var(--text2)", marginBottom: "8px" },
  opcionItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" },
  opcionTexto: { fontSize: "13px", color: "var(--text)" },
  opcionQuitar: { background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "12px" },
  opcionAgregarRow: { display: "flex", gap: "6px", marginTop: "6px" },
  opcionInput: { flex: 1, padding: "7px 10px", borderRadius: "6px", border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "13px", boxSizing: "border-box" },
  opcionAddBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "7px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  opcionAviso: { fontSize: "11px", color: "#d97706", marginTop: "6px" },
  obligLabel: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text2)", cursor: "pointer" },
  addCampoBtn: { background: "transparent", border: "1.5px dashed var(--border2)", color: "var(--text)", padding: "10px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", width: "100%" },
  guardarBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "12px 28px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
};
