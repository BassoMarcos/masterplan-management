import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel } from "../config/appConfig";

const ESTADOS_VENTA = [
  { id: "interesado", label: "Interesado", color: "#2563eb" },
  { id: "a_seguir", label: "A seguir", color: "#d97706" },
  { id: "no_interesado", label: "No interesado", color: "#64748b" },
  { id: "vendido", label: "Vendido", color: "#16a34a" },
  { id: "descartado", label: "Descartado", color: "#dc2626" },
];

// Panel de VENTAS (Comercial).
// - Admin: reparte datos FILTRADOS a vendedores y ve el progreso.
// - Vendedor: ve sus datos con toda la info del filtro, contacta y reporta el resultado.
export default function ComercialVentas() {
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
  const [estadoV, setEstadoV] = useState("");
  const [nota, setNota] = useState("");
  const [seguimiento, setSeguimiento] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esAdmin = !esEmpleado || empleadoData?.accesoTotal;
  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "comercial", "ventas") : "editar";
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

  // Solo se trabajan en Ventas los datos que ya están filtrados (o en venta / vendidos)
  const datosVenta = datos.filter(d => ["filtrado", "en_venta", "vendido", "descartado"].includes(d.estado));

  // Datos del vendedor: asignados a él, o filtrados por él mismo sin vendedor asignado
  const misDatos = datosVenta.filter(d =>
    (d.vendedorUid === currentUser.uid) ||
    ((d.filtradorUid === currentUser.uid || d.cargadoPorUid === currentUser.uid) && !d.vendedorUid)
  );

  // Para asignar: filtrados sin vendedor
  const filtradosSinAsignar = datosVenta.filter(d => d.estado === "filtrado" && !d.vendedorUid);

  function toggleSel(id) { setSeleccionados(s => ({ ...s, [id]: !s[id] })); }

  async function asignarAMano() {
    const ids = Object.keys(seleccionados).filter(k => seleccionados[k]);
    if (!ids.length) { alert("Seleccioná al menos un dato."); return; }
    if (!asignarA) { alert("Elegí a quién asignar."); return; }
    const emp = empleados.find(e => e.id === asignarA);
    setGuardando(true);
    try {
      for (const id of ids) {
        await updateDoc(doc(db, "comercial_datos", id), {
          vendedorUid: asignarA,
          vendedorNombre: `${emp?.nombre || ""} ${emp?.apellido || ""}`.trim(),
          estado: "en_venta",
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
    const aAsignar = filtradosSinAsignar.slice(0, n);
    if (!aAsignar.length) { alert("No hay datos filtrados sin asignar."); return; }
    setGuardando(true);
    try {
      for (const d of aAsignar) {
        await updateDoc(doc(db, "comercial_datos", d.id), {
          vendedorUid: asignarA,
          vendedorNombre: `${emp?.nombre || ""} ${emp?.apellido || ""}`.trim(),
          estado: "en_venta",
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
      await updateDoc(doc(db, "comercial_datos", d.id), { vendedorUid: null, vendedorNombre: null, estado: "filtrado" });
      cargar();
    } catch (e) { alert("Error: " + e.message); }
  }

  function abrirReporte(d) {
    setEditando(d);
    setEstadoV(d.ventaEstado || "");
    setNota(d.ventaNota || "");
    setSeguimiento(d.ventaSeguimiento || "");
  }

  async function guardarReporte() {
    if (!estadoV) { alert("Elegí un estado del contacto."); return; }
    setGuardando(true);
    try {
      const nuevoEstado = estadoV === "vendido" ? "vendido" : (estadoV === "descartado" ? "descartado" : "en_venta");
      await updateDoc(doc(db, "comercial_datos", editando.id), {
        ventaEstado: estadoV,
        ventaNota: nota,
        ventaSeguimiento: seguimiento,
        estado: nuevoEstado,
        ventaReportadoEn: new Date().toISOString(),
      });
      setEditando(null); setEstadoV(""); setNota(""); setSeguimiento("");
      cargar();
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  const resumen = {};
  datosVenta.forEach(d => {
    if (d.vendedorUid) {
      if (!resumen[d.vendedorUid]) resumen[d.vendedorUid] = { nombre: d.vendedorNombre || "—", total: 0, vendidos: 0, reportados: 0 };
      resumen[d.vendedorUid].total++;
      if (d.ventaEstado) resumen[d.vendedorUid].reportados++;
      if (d.estado === "vendido") resumen[d.vendedorUid].vendidos++;
    }
  });

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/comercial`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>💰 Ventas</h1>
            <p style={styles.headerSub}>{proyecto?.nombre} · Comercial{esAdmin ? " · Admin" : (!puedeEditar ? " · 👁️ Solo lectura" : "")}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {esAdmin && (
          <>
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>📤 Repartir datos filtrados a vendedores</h2>
              <div style={styles.asignarBox}>
                <div style={styles.asignarRow}>
                  <label style={styles.miniLabel}>Vendedor:</label>
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
                <div style={styles.hintTxt}>Hay {filtradosSinAsignar.length} dato(s) filtrados sin asignar.</div>
                <div style={styles.separador} />
                <div style={styles.asignarRow}>
                  <button style={styles.selBtn} onClick={() => { setSelMode(!selMode); setSeleccionados({}); }}>
                    {selMode ? "Cancelar selección" : "🖐️ Elegir datos a mano"}
                  </button>
                  {selMode && (
                    <button style={styles.asignarBtn} onClick={asignarAMano} disabled={guardando}>
                      Asignar seleccionados a este vendedor
                    </button>
                  )}
                </div>
              </div>
            </section>

            {Object.keys(resumen).length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>📊 Progreso por vendedor</h2>
                <div style={styles.tabla}>
                  {Object.values(resumen).map((r, i) => (
                    <div key={i} style={styles.trow}>
                      <div style={{ flex: 2, fontWeight: 600 }}>{r.nombre}</div>
                      <div style={{ flex: 1.4, color: "var(--text2)", fontSize: "13px" }}>{r.reportados}/{r.total} trabajados</div>
                      <div style={{ flex: 1, color: "#16a34a", fontSize: "13px", fontWeight: 700 }}>{r.vendidos} vendidos</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Datos filtrados ({datosVenta.length})</h2>
              <div style={styles.tabla}>
                <div style={styles.theadRow}>
                  {selMode && <div style={{ ...styles.th, flex: 0.4 }}></div>}
                  <div style={{ ...styles.th, flex: 2 }}>Nombre</div>
                  <div style={{ ...styles.th, flex: 1.3 }}>Número</div>
                  <div style={{ ...styles.th, flex: 1.2 }}>Estado</div>
                  <div style={{ ...styles.th, flex: 1.5 }}>Vendedor</div>
                  <div style={{ ...styles.th, flex: 0.6 }}></div>
                </div>
                {datosVenta.map(d => (
                  <div key={d.id} style={styles.trow}>
                    {selMode && (
                      <div style={{ flex: 0.4 }}>
                        {(d.estado === "filtrado" && !d.vendedorUid) && (
                          <input type="checkbox" checked={!!seleccionados[d.id]} onChange={() => toggleSel(d.id)} />
                        )}
                      </div>
                    )}
                    <div style={{ flex: 2, fontWeight: 600 }}>{d.nombre}</div>
                    <div style={{ flex: 1.3 }}>{d.numero}</div>
                    <div style={{ flex: 1.2 }}>
                      <span style={styles.estadoTag}>{d.ventaEstado ? estadoVentaLabel(d.ventaEstado) : estadoLabel(d.estado)}</span>
                    </div>
                    <div style={{ flex: 1.5, fontSize: "12px", color: "var(--text2)" }}>{d.vendedorNombre || "—"}</div>
                    <div style={{ flex: 0.6, textAlign: "right" }}>
                      {d.vendedorUid && d.estado !== "vendido" && (
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
            <h2 style={styles.sectionTitle}>Mis datos para vender ({misDatos.length})</h2>
            {misDatos.length === 0 ? (
              <p style={styles.empty}>No tenés datos asignados para vender.</p>
            ) : (
              <div style={styles.tabla}>
                {misDatos.map(d => (
                  <div key={d.id} style={styles.trow}>
                    <div style={{ flex: 2, fontWeight: 600 }}>{d.nombre}</div>
                    <div style={{ flex: 1.3 }}>{d.numero}</div>
                    <div style={{ flex: 1.2 }}><span style={styles.estadoTag}>{d.ventaEstado ? estadoVentaLabel(d.ventaEstado) : "Sin trabajar"}</span></div>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      {puedeEditar && (
                        <button style={styles.trabajarBtn} onClick={() => abrirReporte(d)}>
                          {d.ventaEstado ? "✏️ Editar" : "📋 Trabajar"}
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

      {/* Pantalla de trabajo del vendedor */}
      {editando && (
        <div style={styles.fsOverlay}>
          <div style={styles.fsHeader}>
            <div>
              <div style={styles.fsNombre}>{editando.nombre}</div>
              <div style={styles.fsNumero}>📱 {editando.numero}</div>
            </div>
            <div style={styles.fsContacto}>
              <a style={styles.llamarBtn} href={`tel:${editando.numero}`}>📞 Llamar</a>
              <a style={styles.waBtn} href={`https://wa.me/${String(editando.numero).replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
            </div>
          </div>

          <div style={styles.fsBody}>
            <div style={styles.fsInner}>
              {/* Info del filtrado */}
              <div style={styles.infoFiltro}>
                <div style={styles.infoTitulo}>📋 Info del filtrado</div>
                {formulario.length === 0 || !editando.respuestasFiltro ? (
                  <p style={styles.empty}>Sin datos de filtrado.</p>
                ) : (
                  formulario.map(p => {
                    const r = editando.respuestasFiltro?.[p.id];
                    if (r === undefined || r === "" || r === null) return null;
                    return (
                      <div key={p.id} style={styles.infoItem}>
                        <div style={styles.infoPreg}>{p.texto}</div>
                        <div style={styles.infoResp}>{String(r)}</div>
                      </div>
                    );
                  })
                )}
                {editando.filtradorNombre && <div style={styles.infoFiltrador}>Filtrado por: {editando.filtradorNombre}</div>}
              </div>

              {/* Reporte del vendedor */}
              <div style={styles.reporteTitulo}>Tu reporte</div>

              <div style={styles.fsCampo}>
                <label style={styles.fsLabel}>Estado del contacto *</label>
                <div style={styles.estadosRow}>
                  {ESTADOS_VENTA.map(es => (
                    <button key={es.id} onClick={() => setEstadoV(es.id)}
                      style={{ ...styles.estadoBtn, ...(estadoV === es.id ? { background: es.color, color: "#fff", borderColor: es.color } : {}) }}>
                      {es.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.fsCampo}>
                <label style={styles.fsLabel}>Nota</label>
                <textarea style={styles.fsTextarea} rows={3} value={nota} onChange={e => setNota(e.target.value)} placeholder="¿Qué pasó en el contacto?" />
              </div>

              <div style={styles.fsCampo}>
                <label style={styles.fsLabel}>Próximo paso / seguimiento</label>
                <input style={styles.fsInput} type="date" value={seguimiento} onChange={e => setSeguimiento(e.target.value)} />
              </div>
            </div>
          </div>

          <div style={styles.fsFooter}>
            <button style={styles.fsCancelBtn} onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
            <button style={styles.fsGuardarBtn} onClick={guardarReporte} disabled={guardando}>
              {guardando ? "Guardando..." : "✓ Guardar reporte"}
            </button>
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
function estadoVentaLabel(e) {
  const m = { interesado: "Interesado", a_seguir: "A seguir", no_interesado: "No interesado", vendido: "Vendido", descartado: "Descartado" };
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
  trabajarBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "700" },
  miniBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  empty: { color: "var(--text2)", fontSize: "14px" },
  fsOverlay: { position: "fixed", inset: 0, background: "var(--bg)", zIndex: 2000, display: "flex", flexDirection: "column" },
  fsHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px", borderBottom: "1.5px solid var(--border)", background: "var(--card)", flexWrap: "wrap", gap: "12px" },
  fsNombre: { fontSize: "24px", fontWeight: "800", color: "var(--text)" },
  fsNumero: { fontSize: "16px", color: "var(--text2)", marginTop: "2px" },
  fsContacto: { display: "flex", gap: "10px" },
  llamarBtn: { display: "inline-block", background: "#2563eb", color: "#fff", textDecoration: "none", padding: "12px 22px", borderRadius: "10px", fontSize: "15px", fontWeight: "700" },
  waBtn: { display: "inline-block", background: "#25d366", color: "#fff", textDecoration: "none", padding: "12px 22px", borderRadius: "10px", fontSize: "15px", fontWeight: "700" },
  fsBody: { flex: 1, overflowY: "auto", padding: "24px 28px" },
  fsInner: { maxWidth: "640px", margin: "0 auto" },
  infoFiltro: { background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "24px" },
  infoTitulo: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "12px" },
  infoItem: { marginBottom: "10px" },
  infoPreg: { fontSize: "12px", color: "var(--text2)", marginBottom: "2px" },
  infoResp: { fontSize: "15px", color: "var(--text)", fontWeight: "600" },
  infoFiltrador: { marginTop: "10px", fontSize: "11px", color: "var(--text2)", fontStyle: "italic" },
  reporteTitulo: { fontSize: "16px", fontWeight: "700", color: "var(--text)", marginBottom: "16px" },
  fsCampo: { marginBottom: "24px" },
  fsLabel: { display: "block", fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "10px" },
  estadosRow: { display: "flex", gap: "8px", flexWrap: "wrap" },
  estadoBtn: { padding: "10px 18px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text2)", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  fsTextarea: { width: "100%", padding: "14px 16px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "16px", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  fsInput: { width: "100%", padding: "14px 16px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "16px", boxSizing: "border-box" },
  fsFooter: { display: "flex", justifyContent: "flex-end", gap: "12px", padding: "16px 28px", borderTop: "1.5px solid var(--border)", background: "var(--card)" },
  fsCancelBtn: { background: "transparent", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "14px 28px", borderRadius: "10px", cursor: "pointer", fontSize: "15px", fontWeight: "600" },
  fsGuardarBtn: { background: "#16a34a", color: "#fff", border: "none", padding: "14px 36px", borderRadius: "10px", cursor: "pointer", fontSize: "15px", fontWeight: "700" },
};
