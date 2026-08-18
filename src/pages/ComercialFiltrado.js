import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel } from "../config/appConfig";

// Panel de FILTRADO (Comercial).
// - Admin: reparte datos crudos a filtradores (a mano o por cantidad) y ve el progreso.
// - Filtrador: ve sus datos asignados (o los que cargó) y completa el formulario de filtro.
export default function ComercialFiltrado() {
  const { proyectoId } = useParams();
  const { currentUser, empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [datos, setDatos] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [formulario, setFormulario] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selMode, setSelMode] = useState(false);
  const [seleccionados, setSeleccionados] = useState({});
  const [asignarA, setAsignarA] = useState("");
  const [cantidad, setCantidad] = useState("");

  const [editando, setEditando] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [guardando, setGuardando] = useState(false);

  const esAdmin = !esEmpleado || empleadoData?.accesoTotal;
  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "comercial", "filtrado") : "editar";
  const puedeEditar = !esEmpleado || nivel === "editar";

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const snapP = await getDoc(doc(db, "proyectos", proyectoId));
      if (!snapP.exists() || snapP.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
      setProyecto({ id: snapP.id, ...snapP.data() });

      const snapCfg = await getDoc(doc(db, "comercial_config", `${empresaUid}_${proyectoId}`));
      setFormulario(snapCfg.exists() && Array.isArray(snapCfg.data().preguntasFiltro) ? snapCfg.data().preguntasFiltro : []);

      const q = query(collection(db, "comercial_datos"), where("empresaId", "==", empresaUid), where("proyectoId", "==", proyectoId));
      const snap = await getDocs(q);
      let lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => (b.creadoMs || 0) - (a.creadoMs || 0));
      setDatos(lista);

      if (esAdmin) {
        const qe = query(collection(db, "empleados"), where("empresaId", "==", empresaUid), where("estado", "==", "aprobado"));
        const snapE = await getDocs(qe);
        setEmpleados(snapE.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [proyectoId, empresaUid, esAdmin, navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  const misDatos = datos.filter(d =>
    (d.filtradorUid === currentUser.uid) ||
    (d.cargadoPorUid === currentUser.uid && !d.filtradorUid)
  );

  const crudosSinAsignar = datos.filter(d => d.estado === "crudo" && !d.filtradorUid);

  function toggleSel(id) {
    setSeleccionados(s => ({ ...s, [id]: !s[id] }));
  }

  async function asignarAMano() {
    const ids = Object.keys(seleccionados).filter(k => seleccionados[k]);
    if (!ids.length) { alert("Seleccioná al menos un dato."); return; }
    if (!asignarA) { alert("Elegí a quién asignar."); return; }
    const emp = empleados.find(e => e.id === asignarA);
    setGuardando(true);
    try {
      for (const id of ids) {
        await updateDoc(doc(db, "comercial_datos", id), {
          filtradorUid: asignarA,
          filtradorNombre: `${emp?.nombre || ""} ${emp?.apellido || ""}`.trim(),
          estado: "en_filtro",
        });
      }
      setSeleccionados({}); setSelMode(false); setAsignarA("");
      cargar();
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  async function asignarPorCantidad() {
    const n = parseInt(cantidad, 10);
    if (!n || n < 1) { alert("Poné una cantidad válida."); return; }
    if (!asignarA) { alert("Elegí a quién asignar."); return; }
    const emp = empleados.find(e => e.id === asignarA);
    const aAsignar = crudosSinAsignar.slice(0, n);
    if (!aAsignar.length) { alert("No hay datos crudos sin asignar."); return; }
    setGuardando(true);
    try {
      for (const d of aAsignar) {
        await updateDoc(doc(db, "comercial_datos", d.id), {
          filtradorUid: asignarA,
          filtradorNombre: `${emp?.nombre || ""} ${emp?.apellido || ""}`.trim(),
          estado: "en_filtro",
        });
      }
      setCantidad(""); setAsignarA("");
      cargar();
      alert(`${aAsignar.length} dato(s) asignados a ${emp?.nombre}.`);
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  async function desasignar(d) {
    if (!window.confirm(`¿Quitar la asignación de ${d.nombre}?`)) return;
    try {
      await updateDoc(doc(db, "comercial_datos", d.id), { filtradorUid: null, filtradorNombre: null, estado: "crudo" });
      cargar();
    } catch (e) { alert("Error: " + e.message); }
  }

  function abrirFiltro(d) {
    setEditando(d);
    setRespuestas(d.respuestasFiltro || {});
  }

  async function guardarFiltro() {
    for (const p of formulario) {
      if (p.obligatoria) {
        const r = respuestas[p.id];
        if (r === undefined || r === "" || r === null) {
          alert(`La pregunta "${p.texto}" es obligatoria.`); return;
        }
      }
    }
    setGuardando(true);
    try {
      await updateDoc(doc(db, "comercial_datos", editando.id), {
        respuestasFiltro: respuestas,
        estado: "filtrado",
        filtradoEn: new Date().toISOString(),
      });
      setEditando(null); setRespuestas({});
      cargar();
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  const resumen = {};
  datos.forEach(d => {
    if (d.filtradorUid) {
      if (!resumen[d.filtradorUid]) resumen[d.filtradorUid] = { nombre: d.filtradorNombre || "—", total: 0, filtrados: 0 };
      resumen[d.filtradorUid].total++;
      if (d.estado === "filtrado" || d.estado === "en_venta" || d.estado === "vendido") resumen[d.filtradorUid].filtrados++;
    }
  });

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/comercial`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>🔍 Filtrado</h1>
            <p style={styles.headerSub}>{proyecto?.nombre} · Comercial{esAdmin ? " · Admin" : (!puedeEditar ? " · 👁️ Solo lectura" : "")}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {formulario.length === 0 && (
          <div style={styles.avisoBox}>
            ⚠️ Todavía no hay un formulario de filtro configurado. {esAdmin && "Andá a “Configurar formulario de filtro” para armarlo."}
          </div>
        )}

        {esAdmin && (
          <>
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>📤 Repartir datos a filtradores</h2>
              <div style={styles.asignarBox}>
                <div style={styles.asignarRow}>
                  <label style={styles.miniLabel}>Filtrador:</label>
                  <select style={styles.select} value={asignarA} onChange={e => setAsignarA(e.target.value)}>
                    <option value="">Elegir…</option>
                    {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>)}
                  </select>
                </div>
                <div style={styles.asignarRow}>
                  <label style={styles.miniLabel}>Por cantidad:</label>
                  <input style={styles.inputMini} type="number" placeholder="Ej: 20" value={cantidad} onChange={e => setCantidad(e.target.value)} />
                  <button style={styles.asignarBtn} onClick={asignarPorCantidad} disabled={guardando}>Asignar {cantidad || "N"} sin asignar</button>
                </div>
                <div style={styles.hintTxt}>Hay {crudosSinAsignar.length} dato(s) crudos sin asignar.</div>
                <div style={styles.separador} />
                <div style={styles.asignarRow}>
                  <button style={styles.selBtn} onClick={() => { setSelMode(!selMode); setSeleccionados({}); }}>
                    {selMode ? "Cancelar selección" : "🖐️ Elegir datos a mano"}
                  </button>
                  {selMode && (
                    <button style={styles.asignarBtn} onClick={asignarAMano} disabled={guardando}>
                      Asignar seleccionados a este filtrador
                    </button>
                  )}
                </div>
              </div>
            </section>

            {Object.keys(resumen).length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>📊 Progreso por filtrador</h2>
                <div style={styles.tabla}>
                  {Object.values(resumen).map((r, i) => (
                    <div key={i} style={styles.trow}>
                      <div style={{ flex: 2, fontWeight: 600 }}>{r.nombre}</div>
                      <div style={{ flex: 1, color: "var(--text2)", fontSize: "13px" }}>{r.filtrados}/{r.total} filtrados</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Todos los datos ({datos.length})</h2>
              <div style={styles.tabla}>
                <div style={styles.theadRow}>
                  {selMode && <div style={{ ...styles.th, flex: 0.4 }}></div>}
                  <div style={{ ...styles.th, flex: 2 }}>Nombre</div>
                  <div style={{ ...styles.th, flex: 1.3 }}>Número</div>
                  <div style={{ ...styles.th, flex: 1 }}>Estado</div>
                  <div style={{ ...styles.th, flex: 1.5 }}>Filtrador</div>
                  <div style={{ ...styles.th, flex: 0.6 }}></div>
                </div>
                {datos.map(d => (
                  <div key={d.id} style={styles.trow}>
                    {selMode && (
                      <div style={{ flex: 0.4 }}>
                        {(d.estado === "crudo" && !d.filtradorUid) && (
                          <input type="checkbox" checked={!!seleccionados[d.id]} onChange={() => toggleSel(d.id)} />
                        )}
                      </div>
                    )}
                    <div style={{ flex: 2, fontWeight: 600 }}>{d.nombre}</div>
                    <div style={{ flex: 1.3 }}>{d.numero}</div>
                    <div style={{ flex: 1 }}><span style={styles.estadoTag}>{estadoLabel(d.estado)}</span></div>
                    <div style={{ flex: 1.5, fontSize: "12px", color: "var(--text2)" }}>{d.filtradorNombre || "—"}</div>
                    <div style={{ flex: 0.6, textAlign: "right" }}>
                      {d.filtradorUid && d.estado !== "filtrado" && d.estado !== "en_venta" && d.estado !== "vendido" && (
                        <button style={styles.miniBtn} onClick={() => desasignar(d)} title="Quitar asignación">↩</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {!esAdmin && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Mis datos para filtrar ({misDatos.length})</h2>
            {misDatos.length === 0 ? (
              <p style={styles.empty}>No tenés datos asignados para filtrar.</p>
            ) : (
              <div style={styles.tabla}>
                {misDatos.map(d => (
                  <div key={d.id} style={styles.trow}>
                    <div style={{ flex: 2, fontWeight: 600 }}>{d.nombre}</div>
                    <div style={{ flex: 1.3 }}>{d.numero}</div>
                    <div style={{ flex: 1 }}><span style={styles.estadoTag}>{estadoLabel(d.estado)}</span></div>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      {puedeEditar && (
                        <button style={styles.filtrarBtn} onClick={() => abrirFiltro(d)}>
                          {d.estado === "filtrado" ? "✏️ Editar" : "📝 Filtrar"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {editando && (
        <div style={styles.modalOverlay} onClick={() => !guardando && setEditando(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>📝 Filtrar: {editando.nombre}</h2>
            <p style={styles.modalSub}>{editando.numero}</p>

            {formulario.length === 0 ? (
              <p style={styles.empty}>No hay formulario configurado.</p>
            ) : (
              formulario.map(p => (
                <div key={p.id} style={styles.campoBox}>
                  <label style={styles.campoLabel}>{p.texto} {p.obligatoria && <span style={{ color: "#dc2626" }}>*</span>}</label>
                  {p.tipo === "texto" && (
                    <input style={styles.campoInput} value={respuestas[p.id] || ""} onChange={e => setRespuestas({ ...respuestas, [p.id]: e.target.value })} />
                  )}
                  {p.tipo === "numero" && (
                    <input style={styles.campoInput} type="number" value={respuestas[p.id] || ""} onChange={e => setRespuestas({ ...respuestas, [p.id]: e.target.value })} />
                  )}
                  {p.tipo === "sino" && (
                    <div style={styles.sinoRow}>
                      {["Sí", "No"].map(op => (
                        <button key={op} onClick={() => setRespuestas({ ...respuestas, [p.id]: op })}
                          style={{ ...styles.sinoBtn, ...(respuestas[p.id] === op ? styles.sinoBtnActivo : {}) }}>{op}</button>
                      ))}
                    </div>
                  )}
                  {p.tipo === "opciones" && (
                    <div style={styles.opcionesRow}>
                      {(p.opciones || []).map(op => (
                        <button key={op} onClick={() => setRespuestas({ ...respuestas, [p.id]: op })}
                          style={{ ...styles.opcionBtn, ...(respuestas[p.id] === op ? styles.opcionBtnActivo : {}) }}>{op}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
              <button style={styles.confirmBtn} onClick={guardarFiltro} disabled={guardando || formulario.length === 0}>
                {guardando ? "Guardando..." : "✓ Marcar filtrado"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function estadoLabel(e) {
  const m = { crudo: "Crudo", en_filtro: "En filtro", filtrado: "Filtrado", en_venta: "En venta", vendido: "Vendido", descartado: "Descartado" };
  return m[e] || e;
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
  main: { maxWidth: "900px", margin: "0 auto", padding: "32px 24px" },
  avisoBox: { background: "#fef3c7", color: "#92400e", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", marginBottom: "20px" },
  section: { marginBottom: "28px" },
  sectionTitle: { fontSize: "15px", fontWeight: "700", color: "var(--text)", marginBottom: "12px" },
  asignarBox: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "16px" },
  asignarRow: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" },
  miniLabel: { fontSize: "13px", fontWeight: "600", color: "var(--text2)", minWidth: "80px" },
  select: { padding: "8px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px" },
  inputMini: { padding: "8px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", width: "100px" },
  asignarBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "700" },
  selBtn: { background: "transparent", border: "1.5px solid var(--border2)", color: "var(--text)", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  hintTxt: { fontSize: "12px", color: "var(--text2)" },
  separador: { height: "1px", background: "var(--border)", margin: "12px 0" },
  tabla: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", overflow: "hidden" },
  theadRow: { display: "flex", padding: "10px 16px", background: "var(--nav)", borderBottom: "1.5px solid var(--border)" },
  th: { fontSize: "11px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.5px" },
  trow: { display: "flex", padding: "10px 16px", borderBottom: "1px solid var(--border)", alignItems: "center", fontSize: "14px", color: "var(--text)" },
  estadoTag: { fontSize: "11px", background: "var(--surface)", color: "var(--text2)", padding: "2px 10px", borderRadius: "20px", border: "1px solid var(--border)" },
  filtrarBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "700" },
  miniBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  empty: { color: "var(--text2)", fontSize: "14px" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
  modal: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "28px", maxWidth: "500px", width: "100%", maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { margin: "0 0 2px", fontSize: "18px", fontWeight: "700", color: "var(--text)" },
  modalSub: { margin: "0 0 20px", fontSize: "14px", color: "var(--text2)" },
  campoBox: { marginBottom: "16px" },
  campoLabel: { display: "block", fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "6px" },
  campoInput: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box" },
  sinoRow: { display: "flex", gap: "8px" },
  sinoBtn: { flex: 1, padding: "10px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text2)", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  sinoBtnActivo: { background: "var(--acc)", color: "#fff", borderColor: "var(--acc)" },
  opcionesRow: { display: "flex", gap: "8px", flexWrap: "wrap" },
  opcionBtn: { padding: "8px 14px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text2)", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  opcionBtnActivo: { background: "var(--acc)", color: "#fff", borderColor: "var(--acc)" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "20px" },
  cancelBtn: { background: "transparent", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  confirmBtn: { background: "#16a34a", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
};
