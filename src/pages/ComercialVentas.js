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

// Recorrido del contacto: de conseguirlo hasta la firma.
// Los 3 primeros son automáticos (se derivan del pipeline). Del 4º en adelante los marca el vendedor.
const RECORRIDO = [
  { id: "contacto", label: "Contacto", icono: "📇", auto: true },
  { id: "filtro", label: "Filtro", icono: "🔍", auto: true },
  { id: "llamado", label: "Llamado", icono: "📞", auto: true },
  { id: "visita", label: "Visita programada", icono: "📅", auto: false },
  { id: "compra", label: "Compra confirmada", icono: "🤝", auto: false },
  { id: "reserva", label: "Reserva", icono: "📝", auto: false },
  { id: "firma_prog", label: "Firma programada", icono: "🗓️", auto: false },
  { id: "firma", label: "Firma / Venta", icono: "✅", auto: false },
];

// Calcula hasta qué paso automático llegó un dato según su estado del pipeline
function pasosAutomaticos(d) {
  const hechos = { contacto: true }; // si existe el dato, ya hay contacto
  const filtrado = (d.respuestasFiltro && Object.keys(d.respuestasFiltro).length > 0) || d.filtradoEn || d.estado === "filtrado" || d.estado === "en_venta" || d.estado === "vendido";
  if (filtrado) hechos.filtro = true;
  if (d.ventaEstado || d.vendedorUid) hechos.llamado = true;
  return hechos;
}

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
  const [plantillaWhats, setPlantillaWhats] = useState("Hola {nombre}, te confirmo la firma para el {fecha} a las {hora} hs. ¡Cualquier cosa avisame!");
  const [loading, setLoading] = useState(true);

  const [selMode, setSelMode] = useState(false);
  const [seleccionados, setSeleccionados] = useState({});
  const [asignarA, setAsignarA] = useState("");
  const [cantidad, setCantidad] = useState("");

  const [editando, setEditando] = useState(null);
  const [estadoV, setEstadoV] = useState("");
  const [nota, setNota] = useState("");
  const [seguimiento, setSeguimiento] = useState("");
  const [respFiltro, setRespFiltro] = useState({});
  const [marcandoPaso, setMarcandoPaso] = useState(null); // {datoId, pasoId}
  const [notaPaso, setNotaPaso] = useState("");
  const [fechaPaso, setFechaPaso] = useState("");
  const [horaPaso, setHoraPaso] = useState("");
  const [resultadoCompra, setResultadoCompra] = useState(""); // "gusto" / "rechazo"
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
      if (snapCfg.exists() && snapCfg.data().plantillaWhatsFirma) setPlantillaWhats(snapCfg.data().plantillaWhatsFirma);

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

  // Datos del vendedor: asignados a él, o filtrados/cargados por él sin vendedor asignado,
  // o contactos PROPIOS que él cargó (aunque estén crudos, sin filtrar)
  const misDatos = datos.filter(d =>
    (d.vendedorUid === currentUser.uid) ||
    ((d.filtradorUid === currentUser.uid || d.cargadoPorUid === currentUser.uid) && !d.vendedorUid &&
      ["filtrado", "en_venta", "vendido", "descartado", "crudo"].includes(d.estado))
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
    setRespFiltro(d.respuestasFiltro || {});
  }

  async function guardarReporte() {
    if (!estadoV) { alert("Elegí un estado del contacto."); return; }
    setGuardando(true);
    try {
      const nuevoEstado = estadoV === "vendido" ? "vendido" : (estadoV === "descartado" ? "descartado" : "en_venta");
      const update = {
        ventaEstado: estadoV,
        ventaNota: nota,
        ventaSeguimiento: seguimiento,
        estado: nuevoEstado,
        ventaReportadoEn: new Date().toISOString(),
      };
      // Si el vendedor completó el formulario (contacto propio sin filtrar), lo guardamos
      const sinFiltrar = !editando.respuestasFiltro || Object.keys(editando.respuestasFiltro).length === 0;
      if (sinFiltrar && Object.keys(respFiltro).length > 0) {
        update.respuestasFiltro = respFiltro;
        update.filtradoPorVendedor = true;
      }
      // Si era un contacto propio (sin vendedor asignado) y NO es admin, lo tomamos como suyo
      if (!editando.vendedorUid && !esAdmin) {
        update.vendedorUid = currentUser.uid;
        update.vendedorNombre = esEmpleado
          ? `${empleadoData?.nombre || ""} ${empleadoData?.apellido || ""}`.trim()
          : "Admin";
      }
      await updateDoc(doc(db, "comercial_datos", editando.id), update);
      setEditando(null); setEstadoV(""); setNota(""); setSeguimiento(""); setRespFiltro({});
      cargar();
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  // Marca un paso manual del recorrido
  async function confirmarPaso() {
    if (!marcandoPaso) return;
    const pasoId = marcandoPaso.pasoId;
    // Validaciones por etapa
    if ((pasoId === "visita" || pasoId === "firma_prog") && !fechaPaso) {
      alert("Poné la fecha."); return;
    }
    if (pasoId === "compra" && !resultadoCompra) {
      alert("Marcá si le gustó o no."); return;
    }
    setGuardando(true);
    try {
      const dato = datos.find(d => d.id === marcandoPaso.datoId);
      const recorrido = { ...(dato?.recorrido || {}) };
      const registro = {
        fecha: new Date().toISOString(),
        nota: notaPaso.trim(),
      };
      if (fechaPaso) registro.fechaEvento = fechaPaso;
      if (horaPaso) registro.horaEvento = horaPaso;
      if (pasoId === "compra") registro.resultado = resultadoCompra; // gusto / rechazo
      recorrido[pasoId] = registro;
      const update = { recorrido };
      // Firma final → vendido
      if (pasoId === "firma") { update.estado = "vendido"; update.ventaEstado = "vendido"; }
      // Compra rechazada → descartado
      if (pasoId === "compra" && resultadoCompra === "rechazo") { update.estado = "descartado"; update.ventaEstado = "no_interesado"; }
      await updateDoc(doc(db, "comercial_datos", marcandoPaso.datoId), update);
      setMarcandoPaso(null); setNotaPaso(""); setFechaPaso(""); setHoraPaso(""); setResultadoCompra("");
      if (editando && editando.id === marcandoPaso.datoId) setEditando({ ...editando, recorrido, ...update });
      cargar();
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  async function desmarcarPaso(dato, pasoId) {
    if (!window.confirm("¿Deshacer este paso?")) return;
    setGuardando(true);
    try {
      const recorrido = { ...(dato?.recorrido || {}) };
      delete recorrido[pasoId];
      await updateDoc(doc(db, "comercial_datos", dato.id), { recorrido });
      if (editando && editando.id === dato.id) setEditando({ ...editando, recorrido });
      cargar();
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  // Índice del último paso alcanzado por un dato (para saber cuál es "el siguiente")
  function ultimoPasoIdx(d) {
    const auto = pasosAutomaticos(d);
    const rec = d.recorrido || {};
    let idx = -1;
    RECORRIDO.forEach((p, i) => {
      if (p.auto ? auto[p.id] : rec[p.id]) idx = i;
    });
    return idx;
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
                  <div style={{ ...styles.th, flex: 1.2 }}></div>
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
                    <div style={{ flex: 1.2, textAlign: "right", display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <button style={styles.abrirBtn} onClick={() => abrirReporte(d)} title="Ver recorrido">Abrir</button>
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
              {/* Filtro: si ya está filtrado, se muestra como info; si no, el vendedor puede completarlo */}
              {(() => {
                const yaFiltrado = editando.respuestasFiltro && Object.keys(editando.respuestasFiltro).length > 0;
                if (formulario.length === 0) return null;
                if (yaFiltrado) {
                  // Solo lectura: info que cargó el filtrador
                  return (
                    <div style={styles.infoFiltro}>
                      <div style={styles.infoTitulo}>📋 Info del filtrado</div>
                      {formulario.map(p => {
                        const r = editando.respuestasFiltro?.[p.id];
                        if (r === undefined || r === "" || r === null) return null;
                        return (
                          <div key={p.id} style={styles.infoItem}>
                            <div style={styles.infoPreg}>{p.texto}</div>
                            <div style={styles.infoResp}>{String(r)}</div>
                          </div>
                        );
                      })}
                      {editando.filtradorNombre && <div style={styles.infoFiltrador}>Filtrado por: {editando.filtradorNombre}</div>}
                    </div>
                  );
                }
                // Editable: contacto propio sin filtrar, el vendedor puede completar mientras habla
                return (
                  <div style={styles.infoFiltro}>
                    <div style={styles.infoTitulo}>📝 Preguntas para el cliente (opcional)</div>
                    <div style={styles.infoHint}>Este contacto no fue filtrado. Podés hacer estas preguntas mientras hablás y quedan guardadas.</div>
                    {formulario.map(p => (
                      <div key={p.id} style={styles.campoFiltro}>
                        <label style={styles.campoFiltroLabel}>{p.texto}</label>
                        {p.tipo === "texto" && (
                          <textarea style={styles.campoFiltroInput} rows={2} value={respFiltro[p.id] || ""} onChange={e => setRespFiltro({ ...respFiltro, [p.id]: e.target.value })} />
                        )}
                        {p.tipo === "numero" && (
                          <input style={styles.campoFiltroInput} type="number" value={respFiltro[p.id] || ""} onChange={e => setRespFiltro({ ...respFiltro, [p.id]: e.target.value })} />
                        )}
                        {p.tipo === "sino" && (
                          <div style={styles.miniSinoRow}>
                            {["Sí", "No"].map(op => (
                              <button key={op} onClick={() => setRespFiltro({ ...respFiltro, [p.id]: op })}
                                style={{ ...styles.miniOpBtn, ...(respFiltro[p.id] === op ? styles.miniOpActivo : {}) }}>{op}</button>
                            ))}
                          </div>
                        )}
                        {p.tipo === "opciones" && (
                          <div style={styles.miniSinoRow}>
                            {(p.opciones || []).map(op => (
                              <button key={op} onClick={() => setRespFiltro({ ...respFiltro, [p.id]: op })}
                                style={{ ...styles.miniOpBtn, ...(respFiltro[p.id] === op ? styles.miniOpActivo : {}) }}>{op}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Recorrido del contacto */}
              <div style={styles.recorridoBox}>
                <div style={styles.recorridoTitulo}>🛤️ Recorrido del contacto</div>
                {(() => {
                  const auto = pasosAutomaticos(editando);
                  const rec = editando.recorrido || {};
                  const ultIdx = ultimoPasoIdx(editando);
                  return RECORRIDO.map((paso, i) => {
                    const hecho = paso.auto ? !!auto[paso.id] : !!rec[paso.id];
                    const info = rec[paso.id];
                    const esSiguiente = !hecho && i === ultIdx + 1 && !paso.auto;
                    const rechazado = paso.id === "compra" && info?.resultado === "rechazo";
                    return (
                      <div key={paso.id} style={styles.pasoRow}>
                        <div style={{ ...styles.pasoIcono, ...(hecho ? styles.pasoIconoHecho : {}), ...(rechazado ? { background: "#dc2626", borderColor: "#dc2626", color: "#fff" } : {}) }}>
                          {rechazado ? "✕" : hecho ? "✓" : paso.icono}
                        </div>
                        <div style={styles.pasoInfo}>
                          <div style={{ ...styles.pasoLabel, ...(hecho ? { color: "var(--text)", fontWeight: 700 } : {}) }}>{paso.label}{rechazado && " (rechazó)"}</div>
                          {info && (
                            <div style={styles.pasoDetalle}>
                              {info.fechaEvento ? `📅 ${new Date(info.fechaEvento + "T00:00").toLocaleDateString()}${info.horaEvento ? " " + info.horaEvento + "hs" : ""}` : new Date(info.fecha).toLocaleDateString()}
                              {info.nota && ` · ${info.nota}`}
                            </div>
                          )}
                        </div>
                        {puedeEditar && !paso.auto && (
                          hecho ? (
                            <button style={styles.pasoDeshacer} onClick={() => desmarcarPaso(editando, paso.id)} title="Deshacer">↩</button>
                          ) : esSiguiente ? (
                            <button style={styles.pasoMarcar} onClick={() => { setMarcandoPaso({ datoId: editando.id, pasoId: paso.id }); setNotaPaso(""); setFechaPaso(""); setHoraPaso(""); setResultadoCompra(""); }}>Marcar</button>
                          ) : null
                        )}
                      </div>
                    );
                  });
                })()}
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

      {/* Mini-modal: nota al marcar un paso del recorrido */}
      {marcandoPaso && (() => {
        const pasoId = marcandoPaso.pasoId;
        const paso = RECORRIDO.find(p => p.id === pasoId);
        const pideFechaHora = pasoId === "visita" || pasoId === "firma_prog";
        const esCompra = pasoId === "compra";
        // Para el WhatsApp de firma programada
        const dato = datos.find(d => d.id === marcandoPaso.datoId);
        const msgWhats = plantillaWhats
          .replace(/\{fecha\}/g, fechaPaso ? new Date(fechaPaso + "T00:00").toLocaleDateString() : "____")
          .replace(/\{hora\}/g, horaPaso || "____")
          .replace(/\{nombre\}/g, dato?.nombre || "");
        return (
        <div style={styles.pasoOverlay} onClick={() => !guardando && setMarcandoPaso(null)}>
          <div style={styles.pasoModal} onClick={e => e.stopPropagation()}>
            <div style={styles.pasoModalTitle}>{paso?.icono} {paso?.label}</div>

            {esCompra && (
              <div style={styles.compraRow}>
                <button style={{ ...styles.compraBtn, ...(resultadoCompra === "gusto" ? styles.compraGusto : {}) }} onClick={() => setResultadoCompra("gusto")}>👍 Le gustó</button>
                <button style={{ ...styles.compraBtn, ...(resultadoCompra === "rechazo" ? styles.compraRechazo : {}) }} onClick={() => setResultadoCompra("rechazo")}>👎 No le gustó</button>
              </div>
            )}

            {(pideFechaHora || (esCompra && resultadoCompra === "gusto")) && (
              <div style={styles.fechaHoraRow}>
                <div style={{ flex: 1 }}>
                  <label style={styles.miniCampoLabel}>{esCompra ? "Fecha de reserva" : "Fecha"}</label>
                  <input style={styles.miniCampoInput} type="date" value={fechaPaso} onChange={e => setFechaPaso(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.miniCampoLabel}>Horario</label>
                  <input style={styles.miniCampoInput} type="time" value={horaPaso} onChange={e => setHoraPaso(e.target.value)} />
                </div>
              </div>
            )}

            <label style={styles.miniCampoLabel}>Nota</label>
            <textarea style={styles.pasoModalInput} rows={3} value={notaPaso} onChange={e => setNotaPaso(e.target.value)} placeholder={esCompra ? "¿Qué dijo el cliente?" : "¿Qué pasó?"} />

            {pasoId === "firma_prog" && (
              <a
                style={{ ...styles.waEnviarBtn, ...((!fechaPaso) ? { opacity: 0.5, pointerEvents: "none" } : {}) }}
                href={`https://wa.me/${String(dato?.numero || "").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msgWhats)}`}
                target="_blank" rel="noreferrer"
              >💬 Enviar aviso por WhatsApp</a>
            )}

            {pasoId === "reserva" && (
              <div style={styles.reservaAviso}>📄 El formulario del boleto se habilita en el próximo paso del desarrollo.</div>
            )}
            {pasoId === "firma" && (
              <div style={styles.reservaAviso}>📎 La subida del boleto firmado se habilita más adelante.</div>
            )}

            <div style={styles.pasoModalActions}>
              <button style={styles.fsCancelBtn} onClick={() => setMarcandoPaso(null)} disabled={guardando}>Cancelar</button>
              <button style={styles.fsGuardarBtn} onClick={confirmarPaso} disabled={guardando}>{guardando ? "..." : "✓ Confirmar"}</button>
            </div>
          </div>
        </div>
        );
      })()}
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
  abrirBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "700" },
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
  infoHint: { fontSize: "12px", color: "var(--text2)", marginBottom: "14px", lineHeight: "1.4" },
  campoFiltro: { marginBottom: "14px" },
  campoFiltroLabel: { display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text)", marginBottom: "6px" },
  campoFiltroInput: { width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  miniSinoRow: { display: "flex", gap: "6px", flexWrap: "wrap" },
  miniOpBtn: { padding: "7px 14px", borderRadius: "7px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text2)", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  miniOpActivo: { background: "var(--acc)", color: "#fff", borderColor: "var(--acc)" },
  infoTitulo: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "12px" },
  infoItem: { marginBottom: "10px" },
  infoPreg: { fontSize: "12px", color: "var(--text2)", marginBottom: "2px" },
  infoResp: { fontSize: "15px", color: "var(--text)", fontWeight: "600" },
  infoFiltrador: { marginTop: "10px", fontSize: "11px", color: "var(--text2)", fontStyle: "italic" },
  reporteTitulo: { fontSize: "16px", fontWeight: "700", color: "var(--text)", marginBottom: "16px" },
  recorridoBox: { background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "24px" },
  recorridoTitulo: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "14px" },
  pasoRow: { display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--border)" },
  pasoIcono: { width: "34px", height: "34px", borderRadius: "50%", background: "var(--bg)", border: "1.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0 },
  pasoIconoHecho: { background: "#16a34a", borderColor: "#16a34a", color: "#fff", fontWeight: 700 },
  pasoInfo: { flex: 1 },
  pasoLabel: { fontSize: "14px", color: "var(--text2)" },
  pasoDetalle: { fontSize: "12px", color: "var(--text2)", marginTop: "2px" },
  pasoMarcar: { background: "var(--acc)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "700" },
  pasoDeshacer: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  pasoOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: "20px" },
  pasoModal: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "24px", maxWidth: "420px", width: "100%" },
  pasoModalTitle: { fontSize: "18px", fontWeight: "700", color: "var(--text)", marginBottom: "6px" },
  pasoModalFecha: { fontSize: "13px", color: "var(--text2)", marginBottom: "14px" },
  compraRow: { display: "flex", gap: "10px", marginBottom: "16px" },
  compraBtn: { flex: 1, padding: "14px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text2)", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
  compraGusto: { background: "#16a34a", color: "#fff", borderColor: "#16a34a" },
  compraRechazo: { background: "#dc2626", color: "#fff", borderColor: "#dc2626" },
  fechaHoraRow: { display: "flex", gap: "10px", marginBottom: "14px" },
  miniCampoLabel: { display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text2)", marginBottom: "5px" },
  miniCampoInput: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box" },
  waEnviarBtn: { display: "block", textAlign: "center", background: "#25d366", color: "#fff", textDecoration: "none", padding: "12px", borderRadius: "10px", fontSize: "14px", fontWeight: "700", marginTop: "12px" },
  reservaAviso: { fontSize: "12px", color: "var(--text2)", fontStyle: "italic", marginTop: "12px", padding: "10px", background: "var(--surface)", borderRadius: "8px" },
  pasoModalInput: { width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "15px", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  pasoModalActions: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" },
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
