import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel, RECORRIDO_BASE } from "../config/appConfig";

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

  async function guardar() {
    setGuardando(true);
    try {
      const ref = doc(db, "comercial_config", `${empresaUid}_${proyectoId}`);
      await setDoc(ref, {
        empresaId: empresaUid,
        proyectoId,
        recorridoExtra: etapasExtra,
        plantillaWhatsFirma: plantillaWhats,
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
  guardarBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "12px 28px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
};
