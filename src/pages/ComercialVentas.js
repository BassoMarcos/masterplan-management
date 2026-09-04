import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel, construirRecorrido } from "../config/appConfig";

const ESTADOS_VENTA = [
  { id: "interesado", label: "Interesado", color: "#2563eb" },
  { id: "a_seguir", label: "A seguir", color: "#d97706" },
  { id: "no_interesado", label: "No interesado", color: "#64748b" },
  { id: "vendido", label: "Vendido", color: "#16a34a" },
  { id: "descartado", label: "Descartado", color: "#dc2626" },
];

// Recorrido del contacto: de conseguirlo hasta la firma.
// Los 3 primeros son automáticos (se derivan del pipeline). Del 4º en adelante los marca el vendedor.
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
  const [formulario, setFormulario] = useState([]);
  const [disenoReserva, setDisenoReserva] = useState(null);
  const [respBoleto, setRespBoleto] = useState({});
  const [titularesReserva, setTitularesReserva] = useState([{}]); // datos de cada titular
  const [reservaFull, setReservaFull] = useState(null); // {datoId} cuando se abre la pantalla de reserva
  const [plantillaWhats, setPlantillaWhats] = useState("Hola {nombre}, te confirmo la firma para el {fecha} a las {hora} hs. ¡Cualquier cosa avisame!");
  const [RECORRIDO, setRECORRIDO] = useState(construirRecorrido([]));
  const [loading, setLoading] = useState(true);

  const selMode = false;
  const [seleccionados, setSeleccionados] = useState({});

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
  const [expandido, setExpandido] = useState(null); // contacto con recorrido desplegado
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [mesCalendario, setMesCalendario] = useState(() => { const h = new Date(); return { anio: h.getFullYear(), mes: h.getMonth() }; });
  const [diaSel, setDiaSel] = useState(null); // "YYYY-MM-DD"
  const [etapaAbierta, setEtapaAbierta] = useState(null); // {datoId, pasoId} de la etapa abierta en modal
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
      setDisenoReserva(snapCfg.exists() && snapCfg.data().disenoReservaV2 ? snapCfg.data().disenoReservaV2 : null);
      setRECORRIDO(construirRecorrido(snapCfg.exists() ? snapCfg.data().recorridoExtra : []));

      const q = query(collection(db, "comercial_datos"), where("empresaId", "==", empresaUid), where("proyectoId", "==", proyectoId));
      const snap = await getDocs(q);
      let lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => (b.creadoMs || 0) - (a.creadoMs || 0));
      setDatos(lista);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [proyectoId, empresaUid, navigate]);

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

  function toggleSel(id) { setSeleccionados(s => ({ ...s, [id]: !s[id] })); }


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
      setMarcandoPaso(null); setNotaPaso(""); setFechaPaso(""); setHoraPaso(""); setResultadoCompra(""); setRespBoleto({});
      if (editando && editando.id === marcandoPaso.datoId) setEditando({ ...editando, recorrido, ...update });
      cargar();
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  // Abre la pantalla de reserva (formulario diseñado)
  function abrirReserva(datoId) {
    const dato = datos.find(d => d.id === datoId);
    const rsv = dato?.recorrido?.reserva;
    setRespBoleto(rsv?.campos || {});
    setTitularesReserva(rsv?.titulares && rsv.titulares.length > 0 ? rsv.titulares : [{}]);
    setReservaFull({ datoId });
  }

  async function guardarReserva() {
    if (!reservaFull) return;
    setGuardando(true);
    try {
      const dato = datos.find(d => d.id === reservaFull.datoId);
      const recorrido = { ...(dato?.recorrido || {}) };
      recorrido.reserva = {
        fecha: new Date().toISOString(),
        nota: (recorrido.reserva?.nota) || "",
        campos: { ...respBoleto },
        titulares: titularesReserva,
      };
      await updateDoc(doc(db, "comercial_datos", reservaFull.datoId), { recorrido });
      setReservaFull(null); setRespBoleto({}); setTitularesReserva([{}]);
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

  // ── Eventos del calendario (visitas, firmas programadas, reservas) ──
  const fuenteCal = esAdmin ? datosVenta : misDatos;
  const eventosCal = {}; // { "YYYY-MM-DD": [{tipo, nombre, hora, color}] }
  function pushEvento(fecha, ev) {
    if (!fecha) return;
    const key = String(fecha).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    if (!eventosCal[key]) eventosCal[key] = [];
    eventosCal[key].push(ev);
  }
  fuenteCal.forEach(d => {
    const rec = d.recorrido || {};
    if (rec.visita?.fechaEvento) pushEvento(rec.visita.fechaEvento, { tipo: "Visita", nombre: d.nombre, numero: d.numero, hora: rec.visita.horaEvento, color: "#2563eb", vendedor: d.vendedorNombre });
    if (rec.firma_prog?.fechaEvento) pushEvento(rec.firma_prog.fechaEvento, { tipo: "Firma", nombre: d.nombre, numero: d.numero, hora: rec.firma_prog.horaEvento, color: "#16a34a", vendedor: d.vendedorNombre });
    if (rec.reserva?.fechaEvento) pushEvento(rec.reserva.fechaEvento, { tipo: "Reserva", nombre: d.nombre, numero: d.numero, hora: rec.reserva.horaEvento, color: "#d97706", vendedor: d.vendedorNombre });
  });

  const resumen = {};
  datosVenta.forEach(d => {
    if (d.vendedorUid) {
      if (!resumen[d.vendedorUid]) resumen[d.vendedorUid] = { nombre: d.vendedorNombre || "—", total: 0, vendidos: 0, reportados: 0 };
      resumen[d.vendedorUid].total++;
      if (d.ventaEstado) resumen[d.vendedorUid].reportados++;
      if (d.estado === "vendido") resumen[d.vendedorUid].vendidos++;
    }
  });

  // Fila de contacto con recorrido horizontal interactivo (misma estética que Datos)
  function filaContacto(d, opts = {}) {
    const abierto = expandido === d.id;
    const auto = pasosAutomaticos(d);
    const rec = d.recorrido || {};
    const ultIdx = ultimoPasoIdx(d);
    const idxActual = Math.max(0, ultIdx);
    return (
      <div key={d.id}>
        <div style={{ ...styles.trow, cursor: "pointer", ...(abierto ? { background: "var(--surface)" } : {}) }}
          onClick={() => { setExpandido(abierto ? null : d.id); setEtapaAbierta(null); }}>
          {opts.selMode && (
            <div style={{ flex: 0.4 }} onClick={e => e.stopPropagation()}>
              {(d.estado === "filtrado" && !d.vendedorUid) && (
                <input type="checkbox" checked={!!seleccionados[d.id]} onChange={() => toggleSel(d.id)} />
              )}
            </div>
          )}
          <div style={{ flex: 2, fontWeight: 600 }}>
            <span style={{ marginRight: "8px", color: "var(--text2)" }}>{abierto ? "▾" : "▸"}</span>{d.nombre}
          </div>
          <div style={{ flex: 1.3 }}>{d.numero}</div>
          <div style={{ flex: 1.2 }}>
            <span style={styles.estadoTag}>{RECORRIDO[idxActual]?.label || estadoLabel(d.estado)}</span>
            {(d.respuestasFiltro && Object.keys(d.respuestasFiltro).length > 0) && <span style={styles.filtradoBadge} title="Ya filtrado">🔍✓</span>}
          </div>
          {opts.mostrarVendedor && <div style={{ flex: 1.5, fontSize: "12px", color: "var(--text2)" }}>{d.vendedorNombre || "—"}</div>}
          {opts.accion && <div style={{ flex: 1.2, textAlign: "right", display: "flex", gap: "6px", justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>{opts.accion(d)}</div>}
        </div>

        {abierto && (
          <div style={styles.progWrap}>
            <div style={styles.progBarra}>
              {RECORRIDO.map((paso, i) => {
                const hecho = paso.auto ? !!auto[paso.id] : !!rec[paso.id];
                const rechazado = paso.id === "compra" && rec[paso.id]?.resultado === "rechazo";
                const activa = etapaAbierta && etapaAbierta.datoId === d.id && etapaAbierta.pasoId === paso.id;
                // El filtro, si aún no se hizo, se muestra atenuado (se completa dentro del llamado)
                const filtroPendiente = paso.id === "filtro" && !hecho;
                return (
                  <div key={paso.id} style={styles.progPasoWrap}>
                    {i > 0 && <div style={{ ...styles.progLinea, ...(i <= ultIdx ? styles.progLineaHecha : {}) }} />}
                    <button
                      style={{ ...styles.progPunto, ...(hecho ? styles.progPuntoHecho : {}), ...(filtroPendiente ? styles.progPuntoAtenuado : {}), ...(rechazado ? { background: "#dc2626", borderColor: "#dc2626", color: "#fff" } : {}), ...(activa ? styles.progPuntoActivo : {}) }}
                      onClick={() => setEtapaAbierta({ datoId: d.id, pasoId: paso.id })}
                      title={filtroPendiente ? "El filtro se completa dentro del llamado" : paso.label}
                    >
                      {rechazado ? "✕" : hecho ? "✓" : i + 1}
                    </button>
                    <div style={{ ...styles.progLabel, ...(filtroPendiente ? { opacity: 0.5 } : {}) }}>{paso.label}</div>
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>
    );
  }

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
        {/* Calendario de visitas/firmas/reservas */}
        <div style={styles.calToggleRow}>
          <button style={styles.calToggleBtn} onClick={() => setMostrarCalendario(!mostrarCalendario)}>
            📅 {mostrarCalendario ? "Ocultar calendario" : "Ver calendario de fechas"}
          </button>
        </div>
        {mostrarCalendario && (() => {
          const { anio, mes } = mesCalendario;
          const primerDia = new Date(anio, mes, 1);
          const finMes = new Date(anio, mes + 1, 0).getDate();
          const offset = (primerDia.getDay() + 6) % 7; // lunes=0
          const nombreMes = primerDia.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
          const celdas = [];
          for (let i = 0; i < offset; i++) celdas.push(null);
          for (let dia = 1; dia <= finMes; dia++) celdas.push(dia);
          const keyDe = (dia) => `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
          const hoyKey = new Date().toISOString().slice(0, 10);
          function cambiarMes(delta) {
            let m = mes + delta, a = anio;
            if (m < 0) { m = 11; a--; } if (m > 11) { m = 0; a++; }
            setMesCalendario({ anio: a, mes: m }); setDiaSel(null);
          }
          return (
            <div style={styles.calPanel}>
              <div style={styles.calHeader}>
                <button style={styles.calNav} onClick={() => cambiarMes(-1)}>‹</button>
                <div style={styles.calMes}>{nombreMes}</div>
                <button style={styles.calNav} onClick={() => cambiarMes(1)}>›</button>
              </div>
              <div style={styles.calGridDias}>
                {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map(d => <div key={d} style={styles.calDiaSemana}>{d}</div>)}
                {celdas.map((dia, i) => {
                  if (!dia) return <div key={i} />;
                  const key = keyDe(dia);
                  const evs = eventosCal[key] || [];
                  const esHoy = key === hoyKey;
                  const sel = diaSel === key;
                  return (
                    <div key={i} onClick={() => setDiaSel(sel ? null : key)}
                      style={{ ...styles.calCelda, ...(esHoy ? styles.calHoy : {}), ...(sel ? styles.calSel : {}) }}>
                      <span style={styles.calNum}>{dia}</span>
                      {evs.length > 0 && (
                        <div style={styles.calPuntos}>
                          {evs.slice(0, 4).map((e, j) => <span key={j} style={{ ...styles.calPunto, background: e.color }} />)}
                          {evs.length > 4 && <span style={styles.calMas}>+{evs.length - 4}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Detalle del día seleccionado */}
              {diaSel && (
                <div style={styles.calDetalle}>
                  <div style={styles.calDetalleTit}>{new Date(diaSel + "T00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</div>
                  {(eventosCal[diaSel] || []).length === 0 ? (
                    <div style={styles.calVacio}>No hay eventos este día.</div>
                  ) : (
                    (eventosCal[diaSel] || []).sort((a, b) => (a.hora || "").localeCompare(b.hora || "")).map((e, i) => (
                      <div key={i} style={styles.calEvento}>
                        <span style={{ ...styles.calEventoTipo, background: e.color }}>{e.tipo}</span>
                        <span style={styles.calEventoNombre}>{e.nombre}{e.hora ? ` · ${e.hora}hs` : ""}</span>
                        {esAdmin && e.vendedor && <span style={styles.calEventoVend}>{e.vendedor}</span>}
                      </div>
                    ))
                  )}
                </div>
              )}
              <div style={styles.calLeyenda}>
                <span><span style={{ ...styles.calPunto, background: "#2563eb" }} /> Visita</span>
                <span><span style={{ ...styles.calPunto, background: "#16a34a" }} /> Firma</span>
                <span><span style={{ ...styles.calPunto, background: "#d97706" }} /> Reserva</span>
              </div>
            </div>
          );
        })()}

        {esAdmin && (
          <>
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
                {datosVenta.map(d => filaContacto(d, {
                  selMode,
                  mostrarVendedor: true,
                  accion: (dd) => (dd.vendedorUid && dd.estado !== "vendido") ? <button style={styles.miniBtn} onClick={() => desasignar(dd)} title="Quitar asignación">↩</button> : null,
                }))}
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
                {misDatos.map(d => filaContacto(d, {}))}
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
                        const otro = editando.respuestasFiltro?.[p.id + "_otro"];
                        const esOtro = ["otro", "otros"].includes(String(r).trim().toLowerCase()) && otro;
                        return (
                          <div key={p.id} style={styles.infoItem}>
                            <div style={styles.infoPreg}>{p.texto}</div>
                            <div style={styles.infoResp}>{String(r)}{esOtro ? `: ${otro}` : ""}</div>
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
                            {["otro", "otros"].includes(String(respFiltro[p.id] || "").trim().toLowerCase()) && (
                              <input style={{ ...styles.campoFiltroInput, flexBasis: "100%", marginTop: "6px" }} value={respFiltro[p.id + "_otro"] || ""} onChange={e => setRespFiltro({ ...respFiltro, [p.id + "_otro"]: e.target.value })} placeholder="Aclarar…" />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

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

      {/* Modal profesional: ver/cargar una etapa del recorrido */}
      {etapaAbierta && (() => {
        const d = datos.find(x => x.id === etapaAbierta.datoId);
        if (!d) return null;
        const paso = RECORRIDO.find(p => p.id === etapaAbierta.pasoId);
        if (!paso) return null;
        const rec = d.recorrido || {};
        const auto = pasosAutomaticos(d);
        const info = rec[paso.id];
        const hecho = paso.auto ? !!auto[paso.id] : !!info;
        const ultIdxLocal = ultimoPasoIdx(d);
        const idxEtapa = RECORRIDO.findIndex(p => p.id === paso.id);
        const esSiguiente = !hecho && !paso.auto && idxEtapa === ultIdxLocal + 1;
        const cerrar = () => setEtapaAbierta(null);

        return (
          <div style={styles.etModalOverlay} onClick={cerrar}>
            <div style={styles.etModal} onClick={e => e.stopPropagation()}>
              <button style={styles.etModalX} onClick={cerrar}>✕</button>
              <div style={{ ...styles.etModalIcono, ...(hecho ? { background: "#16a34a22", borderColor: "#16a34a" } : esSiguiente ? { background: "#2563eb18", borderColor: "#2563eb" } : {}) }}>
                {paso.id === "compra" && info?.resultado === "rechazo" ? "❌" : hecho ? "✓" : paso.icono}
              </div>
              <div style={styles.etModalTitulo}>{paso.label}</div>
              <div style={styles.etModalContacto}>{d.nombre} · {d.numero}</div>

              {/* Llamado → abre el trabajo */}
              {paso.id === "llamado" ? (
                <div style={styles.etModalBody}>
                  <p style={styles.etModalTexto}>Acá hacés el llamado de venta: ves la info del filtro y cargás el reporte.</p>
                  {puedeEditar
                    ? <button style={styles.etModalBtnPrimary} onClick={() => { cerrar(); abrirReporte(d); }}>{d.ventaEstado ? "✏️ Abrir trabajo" : "📋 Trabajar contacto"}</button>
                    : <div style={styles.etModalNota}>{d.ventaEstado ? "Reporte cargado." : "Sin trabajar aún."}</div>}
                </div>
              ) : hecho ? (
                /* Etapa ya hecha → informe */
                <div style={styles.etModalBody}>
                  {paso.auto ? (
                    <div style={styles.etModalNota}>
                      {paso.id === "contacto" && `Contacto cargado por ${d.cargadoPorNombre || "—"}.`}
                      {paso.id === "filtro" && (d.filtradorNombre ? `Filtrado por ${d.filtradorNombre}.` : "Contacto filtrado.")}
                    </div>
                  ) : (
                    <>
                      <div style={styles.etModalDato}>
                        <span style={styles.etModalDatoLabel}>📅 Fecha</span>
                        <span style={styles.etModalDatoValor}>
                          {info.fechaEvento ? `${new Date(info.fechaEvento + "T00:00").toLocaleDateString()}${info.horaEvento ? " · " + info.horaEvento + "hs" : ""}` : new Date(info.fecha).toLocaleDateString()}
                        </span>
                      </div>
                      {info.resultado && (
                        <div style={styles.etModalDato}>
                          <span style={styles.etModalDatoLabel}>Resultado</span>
                          <span style={styles.etModalDatoValor}>{info.resultado === "gusto" ? "👍 Le gustó" : "❌ No le gustó"}</span>
                        </div>
                      )}
                      <div style={styles.etModalDato}>
                        <span style={styles.etModalDatoLabel}>📝 Nota</span>
                        <span style={styles.etModalDatoValor}>{info.nota || "Sin nota."}</span>
                      </div>
                      {puedeEditar && <button style={styles.etModalBtnGhost} onClick={() => { desmarcarPaso(d, paso.id); cerrar(); }}>↩ Deshacer esta etapa</button>}
                    </>
                  )}
                </div>
              ) : esSiguiente && puedeEditar ? (
                /* Etapa a cargar */
                <div style={styles.etModalBody}>
                  <p style={styles.etModalTexto}>Esta es la etapa que sigue. Cargá lo que pasó.</p>
                  {paso.id === "reserva" ? (
                    <button style={styles.etModalBtnPrimary} onClick={() => { cerrar(); abrirReserva(d.id); }}>📝 Completar formulario de reserva</button>
                  ) : (
                    <button style={styles.etModalBtnPrimary} onClick={() => { cerrar(); setMarcandoPaso({ datoId: d.id, pasoId: paso.id }); setNotaPaso(""); setFechaPaso(""); setHoraPaso(""); setResultadoCompra(""); }}>✏️ Completar {paso.label}</button>
                  )}
                </div>
              ) : (
                /* Bloqueada */
                <div style={styles.etModalBody}>
                  <div style={styles.etModalNota}>{paso.auto ? "Esta etapa se marca sola cuando corresponde." : "Primero completá las etapas anteriores del recorrido."}</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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

      {/* Pantalla de RESERVA: formulario diseñado + titulares + imprimir */}
      {reservaFull && (() => {
        const dato = datos.find(d => d.id === reservaFull.datoId);
        if (!dato) return null;
        const dis = disenoReserva;
        if (!dis || !Array.isArray(dis.secciones) || dis.secciones.length === 0) {
          return (
            <div style={styles.rsvOverlay}>
              <div style={styles.rsvVacio}>
                <p>📄 Todavía no hay un formulario de reserva diseñado.</p>
                <p style={{ fontSize: "13px", color: "var(--text2)" }}>El admin puede armarlo en ⚙️ Configuración → Formulario de reserva.</p>
                <button style={styles.fsCancelBtn} onClick={() => setReservaFull(null)}>Cerrar</button>
              </div>
            </div>
          );
        }
        const tituLabels = dis.titularLabels || [];
        const anchoFlex = (ancho) => ancho === "half" ? "1 1 calc(50% - 8px)" : ancho === "third" ? "1 1 calc(33.33% - 8px)" : "1 1 100%";

        function setCampoVal(id, v) { setRespBoleto({ ...respBoleto, [id]: v }); }
        function setTitVal(idx, label, v) {
          setTitularesReserva(titularesReserva.map((t, i) => i === idx ? { ...t, [label]: v } : t));
        }
        function agregarTitular() { setTitularesReserva([...titularesReserva, {}]); }
        function quitarTitular(idx) { if (titularesReserva.length > 1) setTitularesReserva(titularesReserva.filter((_, i) => i !== idx)); }

        // Reemplaza {campo} en el texto por el dato cargado
        function textoCompletado(texto) {
          if (!texto) return "";
          // Mapa label -> valor (campos de secciones)
          const mapa = {};
          (dis.secciones || []).forEach(s => {
            if (!s.esTitular) (s.campos || []).forEach(c => { mapa[c.label] = respBoleto[c.id] || ""; });
          });
          // Datos del primer titular (para {Titular: Campo} y también por label directo)
          const t0 = titularesReserva[0] || {};
          (dis.titularLabels || []).forEach(lb => { mapa[lb] = mapa[lb] || t0[lb] || ""; });
          return texto.replace(/\{([^}]+)\}/g, (m, nombre) => {
            const clave = nombre.trim().replace(/^Titular:\s*/i, "");
            const val = mapa[clave];
            return (val !== undefined && val !== "") ? val : "________";
          });
        }

        function renderCampo(c) {
          return (
            <div key={c.id} style={{ flex: anchoFlex(c.ancho), minWidth: "180px" }}>
              <label className="rsv-label" style={styles.rsvCampoLabel}>{c.label}</label>
              {c.tipo === "sino" ? (
                <select style={styles.rsvCampoInput} value={respBoleto[c.id] || ""} onChange={e => setCampoVal(c.id, e.target.value)} disabled={!puedeEditar}>
                  <option value="">—</option><option value="Sí">Sí</option><option value="No">No</option>
                </select>
              ) : c.tipo === "opciones" ? (
                <select style={styles.rsvCampoInput} value={respBoleto[c.id] || ""} onChange={e => setCampoVal(c.id, e.target.value)} disabled={!puedeEditar}>
                  <option value="">Elegir…</option>
                  {(c.opciones || []).map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              ) : c.tipo === "monto" ? (
                <input style={styles.rsvCampoInput} value={respBoleto[c.id] || ""} onChange={e => setCampoVal(c.id, formatearMonto(e.target.value))} disabled={!puedeEditar} placeholder="$" inputMode="numeric" />
              ) : (
                <input style={styles.rsvCampoInput} type={c.tipo === "fecha" ? "date" : c.tipo === "numero" ? "number" : "text"} value={respBoleto[c.id] || ""} onChange={e => setCampoVal(c.id, e.target.value)} disabled={!puedeEditar} />
              )}
            </div>
          );
        }

        return (
          <div style={styles.rsvOverlay}>
            <style>{`
              @media print {
                @page { size: A4; margin: 1.4cm; }
                body * { visibility: hidden !important; }
                #hoja-reserva, #hoja-reserva * { visibility: visible !important; }
                #hoja-reserva {
                  position: absolute !important; left: 0 !important; top: 0 !important;
                  width: 100% !important; max-width: 100% !important; color: #222 !important;
                }
                #hoja-reserva .rsv-titulo {
                  text-align: center !important; font-size: 22px !important; font-weight: 800 !important;
                  color: #111 !important; margin-bottom: 16px !important;
                }
                #hoja-reserva .rsv-texto {
                  color: #222 !important; font-size: 12px !important; line-height: 1.6 !important;
                  margin-bottom: 18px !important; text-align: justify !important;
                }
                #hoja-reserva .rsv-seccion {
                  background: #fff !important; border: 1px solid #bbb !important;
                  border-radius: 8px !important; padding: 12px 14px !important; margin-bottom: 10px !important;
                  page-break-inside: avoid !important;
                }
                #hoja-reserva .rsv-sectit {
                  color: #555 !important; border-bottom: none !important;
                  font-size: 11px !important; font-weight: 700 !important; letter-spacing: 0.5px !important;
                  margin-bottom: 10px !important; text-transform: uppercase !important;
                }
                #hoja-reserva .rsv-label { color: #666 !important; font-size: 10px !important; font-weight: 600 !important; }
                #hoja-reserva input, #hoja-reserva select {
                  border: 1px solid #bbb !important; border-radius: 6px !important;
                  background: transparent !important; color: #111 !important;
                  padding: 5px 8px !important; font-size: 12px !important;
                  -webkit-appearance: none; appearance: none;
                }
                #hoja-reserva .rsv-titular { background: #fff !important; border: 1px solid #ccc !important; border-radius: 8px !important; }
                #hoja-reserva .rsv-firmas { display: flex !important; gap: 40px !important; margin-top: 50px !important; page-break-inside: avoid !important; }
                #hoja-reserva .rsv-firma-linea { border-top: 1px solid #333 !important; }
                #hoja-reserva .rsv-firma-lbl { color: #333 !important; font-size: 11px !important; }
                #hoja-reserva button { display: none !important; }
              }
            `}</style>
            <div style={styles.rsvHeader}>
              <button style={styles.fsCancelBtn} onClick={() => setReservaFull(null)}>← Cerrar</button>
              <div style={styles.rsvTitulo}>Reserva · {dato.nombre}</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button style={styles.rsvImprimir} onClick={() => window.print()}>🖨️ Imprimir</button>
                {puedeEditar && <button style={styles.fsGuardarBtn} onClick={guardarReserva} disabled={guardando}>{guardando ? "..." : "✓ Guardar"}</button>}
              </div>
            </div>

            <div style={styles.rsvScroll}>
              <div id="hoja-reserva" style={styles.rsvHoja}>
                <div className="rsv-titulo" style={styles.rsvHojaTitulo}>{dis.titulo || "Contrato de Reserva"}</div>
                {dis.textoContrato && dis.textoContrato.trim() && (
                  <div className="rsv-texto" style={styles.rsvTexto}>{textoCompletado(dis.textoContrato)}</div>
                )}
                {dis.secciones.map(s => (
                  <div key={s.id} className="rsv-seccion" style={styles.rsvSeccion}>
                    {s.esTitular ? (
                      <>
                        {titularesReserva.map((tit, idx) => (
                          <div key={idx} className="rsv-titular" style={styles.rsvTitularBloque}>
                            <div className="rsv-sectit" style={styles.rsvSecTit}>{s.titulo} {idx + 1}
                              {puedeEditar && titularesReserva.length > 1 && <button style={styles.rsvTitQuitar} onClick={() => quitarTitular(idx)}>✕ quitar</button>}
                            </div>
                            <div style={styles.rsvCamposRow}>
                              {tituLabels.map((lb, li) => (
                                <div key={li} style={{ flex: "1 1 calc(50% - 8px)", minWidth: "180px" }}>
                                  <label className="rsv-label" style={styles.rsvCampoLabel}>{lb}</label>
                                  <input style={styles.rsvCampoInput} value={tit[lb] || ""} onChange={e => setTitVal(idx, lb, e.target.value)} disabled={!puedeEditar} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {puedeEditar && <button style={styles.rsvAddTitular} onClick={agregarTitular}>➕ Agregar titular</button>}
                      </>
                    ) : (
                      <>
                        <div className="rsv-sectit" style={styles.rsvSecTit}>{s.titulo}</div>
                        <div style={styles.rsvCamposRow}>
                          {s.campos.map(renderCampo)}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <div className="rsv-firmas" style={styles.rsvFirmas}>
                  <div style={styles.rsvFirmaCol}><div className="rsv-firma-linea" style={styles.rsvFirmaLinea} /><span className="rsv-firma-lbl" style={styles.rsvFirmaLbl}>{dis.firmaIzq || "En representación de"}</span></div>
                  <div style={styles.rsvFirmaCol}><div className="rsv-firma-linea" style={styles.rsvFirmaLinea} /><span className="rsv-firma-lbl" style={styles.rsvFirmaLbl}>{dis.firmaDer || "Firma del comprador"}</span></div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Formatea un monto: solo dígitos, con puntos cada 3 (18.360.000)
function formatearMonto(v) {
  const soloNum = String(v).replace(/[^\d]/g, "");
  if (!soloNum) return "";
  return "$ " + soloNum.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function estadoLabel(e) {
  const m = { crudo: "Crudo", en_filtro: "En filtro", filtrado: "Filtrado", en_venta: "En venta", vendido: "Vendido", descartado: "Descartado" };
  return m[e] || e;
}

const styles = {
  loading: { padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" },
  rsvOverlay: { position: "fixed", inset: 0, background: "var(--bg)", zIndex: 4000, display: "flex", flexDirection: "column" },
  rsvVacio: { margin: "auto", textAlign: "center", color: "var(--text)", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" },
  rsvHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1.5px solid var(--border)", background: "var(--card)", gap: "12px" },
  rsvTitulo: { fontSize: "16px", fontWeight: "700", color: "var(--text)" },
  rsvImprimir: { background: "var(--surface)", border: "1.5px solid var(--border2)", color: "var(--text)", padding: "9px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  rsvScroll: { flex: 1, overflow: "auto", padding: "20px", display: "flex", justifyContent: "center" },
  rsvHoja: { background: "transparent", color: "var(--text)", padding: "0", width: "100%", maxWidth: "680px", boxSizing: "border-box" },
  rsvHojaTitulo: { fontSize: "22px", fontWeight: "800", color: "var(--text)", marginBottom: "20px", paddingLeft: "2px" },
  rsvTexto: { fontSize: "13.5px", color: "var(--text)", lineHeight: "1.6", whiteSpace: "pre-wrap", marginBottom: "18px", padding: "0 2px" },
  rsvFirmas: { display: "flex", gap: "40px", marginTop: "44px", justifyContent: "space-between" },
  rsvFirmaCol: { flex: 1, textAlign: "center" },
  rsvFirmaLinea: { borderTop: "1px solid var(--text2)", marginBottom: "6px" },
  rsvFirmaLbl: { fontSize: "12px", color: "var(--text2)" },
  rsvSeccion: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "18px 20px", marginBottom: "14px" },
  rsvSecTit: { fontSize: "13px", fontWeight: "700", color: "var(--acc)", marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.4px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  rsvCamposRow: { display: "flex", flexWrap: "wrap", gap: "14px 16px" },
  rsvCampoLabel: { display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text2)", marginBottom: "5px" },
  rsvCampoInput: { width: "100%", border: "1.5px solid var(--border)", borderRadius: "9px", background: "var(--bg)", color: "var(--text)", fontSize: "14px", outline: "none", padding: "9px 11px", boxSizing: "border-box" },
  rsvTitularBloque: { border: "1.5px solid var(--border)", borderRadius: "10px", padding: "14px", marginBottom: "10px", background: "var(--surface)" },
  rsvTitQuitar: { background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "11px", fontWeight: "600" },
  rsvAddTitular: { background: "var(--acc)", color: "#fff", border: "none", padding: "9px 16px", borderRadius: "9px", cursor: "pointer", fontSize: "13px", fontWeight: "700", marginTop: "4px" },
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
  calToggleRow: { marginBottom: "16px" },
  calToggleBtn: { background: "var(--card)", border: "1.5px solid var(--border2)", color: "var(--text)", padding: "10px 18px", borderRadius: "10px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  calPanel: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "18px", marginBottom: "20px" },
  calHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" },
  calNav: { background: "var(--surface)", border: "1.5px solid var(--border)", color: "var(--text)", width: "36px", height: "36px", borderRadius: "8px", cursor: "pointer", fontSize: "18px" },
  calMes: { fontSize: "16px", fontWeight: "700", color: "var(--text)", textTransform: "capitalize" },
  calGridDias: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" },
  calDiaSemana: { textAlign: "center", fontSize: "11px", fontWeight: "700", color: "var(--text2)", padding: "4px 0" },
  calCelda: { minHeight: "48px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", padding: "4px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" },
  calHoy: { borderColor: "var(--acc)", borderWidth: "2px" },
  calSel: { background: "var(--surface)", borderColor: "var(--acc)" },
  calNum: { fontSize: "13px", color: "var(--text)", fontWeight: "600" },
  calPuntos: { display: "flex", gap: "3px", marginTop: "4px", flexWrap: "wrap", justifyContent: "center", alignItems: "center" },
  calMas: { fontSize: "9px", color: "var(--text2)", fontWeight: "700" },
  calPunto: { width: "7px", height: "7px", borderRadius: "50%", display: "inline-block" },
  calDetalle: { marginTop: "16px", background: "var(--surface)", borderRadius: "10px", padding: "14px" },
  calDetalleTit: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "10px", textTransform: "capitalize" },
  calVacio: { fontSize: "13px", color: "var(--text2)", fontStyle: "italic" },
  calEvento: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", flexWrap: "wrap" },
  calEventoTipo: { fontSize: "11px", color: "#fff", padding: "2px 8px", borderRadius: "12px", fontWeight: "700" },
  calEventoNombre: { fontSize: "14px", color: "var(--text)" },
  calEventoVend: { fontSize: "12px", color: "var(--text2)", marginLeft: "auto" },
  calLeyenda: { display: "flex", gap: "16px", marginTop: "14px", fontSize: "12px", color: "var(--text2)", justifyContent: "center", flexWrap: "wrap" },
  filtradoBadge: { fontSize: "11px", marginLeft: "6px", color: "#16a34a", fontWeight: "700" },
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
  etModalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: "20px" },
  etModal: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "18px", padding: "28px", maxWidth: "440px", width: "100%", position: "relative", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" },
  etModalX: { position: "absolute", top: "16px", right: "16px", background: "transparent", border: "none", color: "var(--text2)", fontSize: "18px", cursor: "pointer", lineHeight: 1 },
  etModalIcono: { width: "72px", height: "72px", borderRadius: "50%", background: "var(--surface)", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "34px", margin: "0 auto 16px" },
  etModalTitulo: { fontSize: "20px", fontWeight: "800", color: "var(--text)", marginBottom: "4px" },
  etModalContacto: { fontSize: "13px", color: "var(--text2)", marginBottom: "20px" },
  etModalBody: { textAlign: "left" },
  etModalTexto: { fontSize: "14px", color: "var(--text2)", textAlign: "center", marginBottom: "18px", lineHeight: "1.5" },
  etModalNota: { fontSize: "14px", color: "var(--text2)", textAlign: "center", background: "var(--surface)", padding: "14px", borderRadius: "10px", lineHeight: "1.5" },
  etModalDato: { display: "flex", flexDirection: "column", gap: "3px", padding: "12px 0", borderBottom: "1px solid var(--border)" },
  etModalDatoLabel: { fontSize: "12px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.3px" },
  etModalDatoValor: { fontSize: "15px", color: "var(--text)", lineHeight: "1.4" },
  etModalBtnPrimary: { display: "block", width: "100%", background: "var(--acc)", color: "#fff", border: "none", padding: "14px", borderRadius: "10px", cursor: "pointer", fontSize: "15px", fontWeight: "700", marginTop: "8px" },
  etModalBtnGhost: { display: "block", width: "100%", background: "transparent", color: "var(--text2)", border: "1.5px solid var(--border2)", padding: "11px", borderRadius: "10px", cursor: "pointer", fontSize: "13px", fontWeight: "600", marginTop: "18px" },
  recorridoTitulo: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "14px" },
  progBarra: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", overflowX: "auto", paddingBottom: "8px" },
  progPasoWrap: { display: "flex", flexDirection: "column", alignItems: "center", position: "relative", flex: 1, minWidth: "72px" },
  progLinea: { position: "absolute", top: "18px", right: "50%", width: "100%", height: "3px", background: "var(--border)", zIndex: 0 },
  progLineaHecha: { background: "#16a34a" },
  progPunto: { width: "38px", height: "38px", borderRadius: "50%", border: "2px solid var(--border)", background: "var(--bg)", color: "var(--text2)", fontSize: "14px", fontWeight: "700", zIndex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" },
  progPuntoHecho: { background: "#16a34a", borderColor: "#16a34a", color: "#fff" },
  progPuntoAtenuado: { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text2)", borderStyle: "dashed", opacity: 0.6 },
  progPuntoActivo: { boxShadow: "0 0 0 3px rgba(37,99,235,0.4)", borderColor: "#2563eb" },
  progPuntoSiguiente: { borderColor: "#2563eb", borderStyle: "dashed", color: "#2563eb", boxShadow: "0 0 0 3px rgba(37,99,235,0.15)" },
  progLabel: { fontSize: "10.5px", color: "var(--text2)", textAlign: "center", marginTop: "6px", lineHeight: "1.2", maxWidth: "74px" },
  etapaInforme: { marginTop: "16px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "14px" },
  etapaInformeTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
  etapaInformeTitulo: { fontSize: "14px", fontWeight: "700", color: "var(--text)" },
  etapaInformeFecha: { fontSize: "12.5px", color: "var(--text2)", marginBottom: "6px" },
  etapaInformeNota: { fontSize: "14px", color: "var(--text)", lineHeight: "1.5" },
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
  boletoForm: { marginTop: "12px", maxHeight: "300px", overflowY: "auto" },
  boletoFormTit: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "10px" },
  boletoCampo: { marginBottom: "12px" },
  boletoSino: { display: "flex", gap: "8px" },
  boletoSinoBtn: { flex: 1, padding: "9px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text2)", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  boletoSinoActivo: { background: "var(--acc)", borderColor: "var(--acc)", color: "#fff" },
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
