import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel } from "../config/appConfig";

const TIPOS = [
  { id: "texto", label: "Texto libre", icono: "✏️" },
  { id: "opciones", label: "Opciones (elegir una)", icono: "🔘" },
  { id: "sino", label: "Sí / No", icono: "✅" },
  { id: "numero", label: "Número", icono: "🔢" },
];

// Configurador del FORMULARIO DE FILTRO (Comercial).
// El admin arma las preguntas que el filtrador completará sobre cada dato.
export default function ComercialConfigFiltro() {
  const { proyectoId } = useParams();
  const { empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [preguntas, setPreguntas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [nuevaOpcion, setNuevaOpcion] = useState({});

  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "comercial", "filtrado") : "editar";
  const puedeEditar = !esEmpleado || nivel === "editar";

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const snapP = await getDoc(doc(db, "proyectos", proyectoId));
      if (!snapP.exists() || snapP.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
      setProyecto({ id: snapP.id, ...snapP.data() });
      // El formulario se guarda en comercial_config/{empresaUid}_{proyectoId}
      const ref = doc(db, "comercial_config", `${empresaUid}_${proyectoId}`);
      const snap = await getDoc(ref);
      if (snap.exists() && Array.isArray(snap.data().preguntasFiltro)) {
        setPreguntas(snap.data().preguntasFiltro);
      } else {
        setPreguntas([]);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [proyectoId, empresaUid, navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  function nuevaPregunta() {
    setPreguntas([...preguntas, {
      id: "p_" + Date.now(),
      texto: "",
      tipo: "texto",
      obligatoria: false,
      opciones: [],
    }]);
  }

  function actualizar(idx, campo, valor) {
    setPreguntas(preguntas.map((p, i) => i === idx ? { ...p, [campo]: valor } : p));
  }

  function eliminar(idx) {
    setPreguntas(preguntas.filter((_, i) => i !== idx));
  }

  function mover(idx, dir) {
    const nueva = [...preguntas];
    const destino = idx + dir;
    if (destino < 0 || destino >= nueva.length) return;
    [nueva[idx], nueva[destino]] = [nueva[destino], nueva[idx]];
    setPreguntas(nueva);
  }

  function agregarOpcion(idx, texto) {
    const t = (texto || "").trim();
    if (!t) return;
    const p = preguntas[idx];
    const opciones = [...(p.opciones || []), t];
    actualizar(idx, "opciones", opciones);
  }

  function quitarOpcion(idx, opIdx) {
    const p = preguntas[idx];
    const opciones = (p.opciones || []).filter((_, i) => i !== opIdx);
    actualizar(idx, "opciones", opciones);
  }

  async function guardar() {
    // Validar
    for (const p of preguntas) {
      if (!p.texto.trim()) { alert("Todas las preguntas tienen que tener un texto."); return; }
      if (p.tipo === "opciones" && (!p.opciones || p.opciones.length < 2)) {
        alert(`La pregunta "${p.texto}" es de opciones: cargá al menos 2 opciones separadas por coma.`); return;
      }
    }
    setGuardando(true);
    try {
      const ref = doc(db, "comercial_config", `${empresaUid}_${proyectoId}`);
      await setDoc(ref, {
        empresaId: empresaUid,
        proyectoId,
        preguntasFiltro: preguntas,
        actualizadoEn: new Date().toISOString(),
      }, { merge: true });
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e) {
      alert("Error al guardar: " + e.message);
    }
    setGuardando(false);
  }

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/comercial`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>⚙️ Formulario de filtro</h1>
            <p style={styles.headerSub}>{proyecto?.nombre} · Comercial{!puedeEditar && " · 👁️ Solo lectura"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        <p style={styles.intro}>
          Estas son las preguntas que el filtrador va a completar sobre cada dato en el primer llamado.
          Armá el formulario a tu gusto.
        </p>

        {preguntas.length === 0 && <p style={styles.empty}>Todavía no hay preguntas. Agregá la primera.</p>}

        {preguntas.map((p, idx) => (
          <div key={p.id} style={styles.pregBox}>
            <div style={styles.pregHead}>
              <span style={styles.pregNum}>#{idx + 1}</span>
              {puedeEditar && (
                <div style={styles.pregControls}>
                  <button style={styles.iconBtn} onClick={() => mover(idx, -1)} disabled={idx === 0} title="Subir">↑</button>
                  <button style={styles.iconBtn} onClick={() => mover(idx, 1)} disabled={idx === preguntas.length - 1} title="Bajar">↓</button>
                  <button style={styles.iconBtnRed} onClick={() => eliminar(idx)} title="Eliminar">✕</button>
                </div>
              )}
            </div>

            <input
              style={styles.inputPreg}
              placeholder="Escribí la pregunta (ej: ¿Tiene lote propio?)"
              value={p.texto}
              onChange={e => actualizar(idx, "texto", e.target.value)}
              disabled={!puedeEditar}
            />

            <div style={styles.tipoRow}>
              {TIPOS.map(t => (
                <button
                  key={t.id}
                  onClick={() => puedeEditar && actualizar(idx, "tipo", t.id)}
                  style={{ ...styles.tipoBtn, ...(p.tipo === t.id ? styles.tipoBtnActivo : {}) }}
                  disabled={!puedeEditar}
                >
                  {t.icono} {t.label}
                </button>
              ))}
            </div>

            {p.tipo === "opciones" && (
              <div style={styles.opcionesBox}>
                <div style={styles.opcionesLabel}>Opciones para elegir:</div>
                {(p.opciones || []).map((op, opIdx) => (
                  <div key={opIdx} style={styles.opcionItem}>
                    <span style={styles.opcionTexto}>• {op}</span>
                    {puedeEditar && (
                      <button style={styles.opcionQuitar} onClick={() => quitarOpcion(idx, opIdx)} title="Quitar">✕</button>
                    )}
                  </div>
                ))}
                {puedeEditar && (
                  <div style={styles.opcionAgregarRow}>
                    <input
                      style={styles.opcionInput}
                      placeholder="Escribí una opción y tocá Agregar (o Enter)"
                      value={nuevaOpcion[p.id] || ""}
                      onChange={e => setNuevaOpcion({ ...nuevaOpcion, [p.id]: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          agregarOpcion(idx, nuevaOpcion[p.id]);
                          setNuevaOpcion({ ...nuevaOpcion, [p.id]: "" });
                        }
                      }}
                    />
                    <button
                      style={styles.opcionAddBtn}
                      onClick={() => { agregarOpcion(idx, nuevaOpcion[p.id]); setNuevaOpcion({ ...nuevaOpcion, [p.id]: "" }); }}
                    >
                      Agregar
                    </button>
                  </div>
                )}
                {(p.opciones || []).length < 2 && <div style={styles.opcionAviso}>Cargá al menos 2 opciones.</div>}
              </div>
            )}

            <label style={styles.obligLabel}>
              <input type="checkbox" checked={!!p.obligatoria} onChange={e => actualizar(idx, "obligatoria", e.target.checked)} disabled={!puedeEditar} />
              Obligatoria
            </label>
          </div>
        ))}

        {puedeEditar && (
          <div style={styles.acciones}>
            <button style={styles.addBtn} onClick={nuevaPregunta}>➕ Agregar pregunta</button>
            <button style={styles.guardarBtn} onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando..." : guardadoOk ? "✓ Guardado" : "💾 Guardar formulario"}
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
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "700px", margin: "0 auto", padding: "32px 24px" },
  intro: { fontSize: "14px", color: "var(--text2)", lineHeight: "1.5", marginBottom: "20px" },
  empty: { color: "var(--text2)", fontSize: "14px" },
  pregBox: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "14px" },
  pregHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
  pregNum: { fontSize: "13px", fontWeight: "700", color: "var(--text2)" },
  pregControls: { display: "flex", gap: "6px" },
  iconBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  iconBtnRed: { background: "transparent", border: "1px solid #fca5a5", color: "#dc2626", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
  inputPreg: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box", marginBottom: "10px", fontWeight: "600" },
  tipoRow: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" },
  tipoBtn: { background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600" },
  tipoBtnActivo: { background: "var(--acc)", color: "#fff", borderColor: "var(--acc)" },
  opcionesBox: { background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "8px", padding: "12px", marginBottom: "10px" },
  opcionesLabel: { fontSize: "12px", fontWeight: "700", color: "var(--text2)", marginBottom: "8px" },
  opcionItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: "var(--bg)", borderRadius: "6px", marginBottom: "5px" },
  opcionTexto: { fontSize: "13px", color: "var(--text)" },
  opcionQuitar: { background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "12px" },
  opcionAgregarRow: { display: "flex", gap: "6px", marginTop: "6px" },
  opcionInput: { flex: 1, padding: "8px 10px", borderRadius: "6px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "13px", boxSizing: "border-box" },
  opcionAddBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  opcionAviso: { fontSize: "11px", color: "#d97706", marginTop: "6px" },
  obligLabel: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text)", cursor: "pointer" },
  acciones: { display: "flex", justifyContent: "space-between", gap: "12px", marginTop: "20px", flexWrap: "wrap" },
  addBtn: { background: "transparent", border: "1.5px dashed var(--border2)", color: "var(--text)", padding: "12px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  guardarBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
};
