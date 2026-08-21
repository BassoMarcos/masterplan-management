import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel } from "../config/appConfig";

// Etapas del recorrido del contacto (mismo orden que en Ventas)
const RECORRIDO = [
  { id: "contacto", label: "Contacto", auto: true },
  { id: "filtro", label: "Filtro", auto: true },
  { id: "llamado", label: "Llamado", auto: true },
  { id: "visita", label: "Visita programada", auto: false },
  { id: "compra", label: "Compra confirmada", auto: false },
  { id: "reserva", label: "Reserva", auto: false },
  { id: "firma_prog", label: "Firma programada", auto: false },
  { id: "firma", label: "Firma / Venta", auto: false },
];

function pasosAutomaticos(d) {
  const hechos = { contacto: true };
  const filtrado = (d.respuestasFiltro && Object.keys(d.respuestasFiltro).length > 0) || d.filtradoEn || ["filtrado", "en_venta", "vendido"].includes(d.estado);
  if (filtrado) hechos.filtro = true;
  if (d.ventaEstado || d.vendedorUid) hechos.llamado = true;
  return hechos;
}

// Índice de la etapa actual (última alcanzada) de un dato
function etapaActualIdx(d) {
  const auto = pasosAutomaticos(d);
  const rec = d.recorrido || {};
  let idx = 0;
  RECORRIDO.forEach((p, i) => {
    if (p.auto ? auto[p.id] : rec[p.id]) idx = i;
  });
  return idx;
}

// Panel de DATOS (Comercial): los dateros cargan contactos crudos (nombre + número).
// Cada dato guarda quién lo cargó. Estado inicial: "crudo".
export default function ComercialDatos() {
  const { proyectoId } = useParams();
  const { currentUser, empresaData, empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [numero, setNumero] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Filtros (admin)
  const [fMes, setFMes] = useState("");        // "2026-08" o ""
  const [fDatero, setFDatero] = useState("");  // uid o ""
  const [fVendedor, setFVendedor] = useState(""); // uid o ""
  const [fEtapa, setFEtapa] = useState("");    // id de etapa o ""
  const [fFiltrado, setFFiltrado] = useState(""); // "si" / "no" / ""
  const [orden, setOrden] = useState("fecha_desc"); // fecha_desc / fecha_asc
  const [expandido, setExpandido] = useState(null); // id del dato expandido
  const [etapaAbierta, setEtapaAbierta] = useState(null); // id de etapa con informe abierto

  // Permiso: si es empleado, ¿puede editar (cargar) o solo ver?
  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "comercial", "datos") : "editar";
  const puedeEditar = !esEmpleado || nivel === "editar";
  const esAdmin = !esEmpleado || empleadoData?.accesoTotal;

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const snapP = await getDoc(doc(db, "proyectos", proyectoId));
      if (snapP.exists() && snapP.data().empresaId === empresaUid) {
        setProyecto({ id: snapP.id, ...snapP.data() });
      } else {
        navigate("/proyectos");
        return;
      }
      const q = query(
        collection(db, "comercial_datos"),
        where("empresaId", "==", empresaUid),
        where("proyectoId", "==", proyectoId)
      );
      const snap = await getDocs(q);
      let lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Ordenar por fecha de carga (más nuevo primero)
      lista.sort((a, b) => (b.creadoMs || 0) - (a.creadoMs || 0));
      // Si es empleado NO admin: solo ve los datos que cargó él
      if (esEmpleado && !empleadoData?.accesoTotal) {
        lista = lista.filter(d => d.cargadoPorUid === currentUser.uid);
      }
      setDatos(lista);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [proyectoId, empresaUid, esEmpleado, empleadoData, currentUser, navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  async function agregar() {
    if (!nombre.trim() || !numero.trim()) { alert("Completá nombre y número."); return; }
    setGuardando(true);
    try {
      const nombreQuien = esEmpleado
        ? `${empleadoData?.nombre || ""} ${empleadoData?.apellido || ""}`.trim()
        : (empresaData?.nombre || "Admin");
      await addDoc(collection(db, "comercial_datos"), {
        empresaId: empresaUid,
        proyectoId,
        nombre: nombre.trim(),
        numero: numero.trim(),
        estado: "crudo",
        cargadoPorUid: currentUser.uid,
        cargadoPorNombre: nombreQuien,
        creadoEn: serverTimestamp(),
        creadoMs: Date.now(),
      });
      setNombre(""); setNumero("");
      cargar();
    } catch (e) {
      alert("Error al guardar: " + e.message);
    }
    setGuardando(false);
  }

  async function eliminar(d) {
    if (!window.confirm(`¿Eliminar el dato de ${d.nombre}?`)) return;
    try {
      await deleteDoc(doc(db, "comercial_datos", d.id));
      cargar();
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  // ── Listas para los selects (a partir de los datos) ──
  const dateros = [];
  const vendedores = [];
  const meses = [];
  datos.forEach(d => {
    if (d.cargadoPorUid && !dateros.find(x => x.uid === d.cargadoPorUid)) dateros.push({ uid: d.cargadoPorUid, nombre: d.cargadoPorNombre || "—" });
    if (d.vendedorUid && !vendedores.find(x => x.uid === d.vendedorUid)) vendedores.push({ uid: d.vendedorUid, nombre: d.vendedorNombre || "—" });
    if (d.creadoMs) {
      const dt = new Date(d.creadoMs);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (!meses.find(m => m.key === key)) meses.push({ key, label: dt.toLocaleDateString("es-AR", { month: "long", year: "numeric" }) });
    }
  });
  meses.sort((a, b) => b.key.localeCompare(a.key));

  // ── Aplicar filtros ──
  let datosFiltrados = esAdmin ? [...datos] : datos.filter(d => d.cargadoPorUid === currentUser.uid);
  if (fMes) datosFiltrados = datosFiltrados.filter(d => {
    if (!d.creadoMs) return false;
    const dt = new Date(d.creadoMs);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}` === fMes;
  });
  if (fDatero) datosFiltrados = datosFiltrados.filter(d => d.cargadoPorUid === fDatero);
  if (fVendedor) datosFiltrados = datosFiltrados.filter(d => d.vendedorUid === fVendedor);
  if (fFiltrado === "si") datosFiltrados = datosFiltrados.filter(d => pasosAutomaticos(d).filtro);
  if (fFiltrado === "no") datosFiltrados = datosFiltrados.filter(d => !pasosAutomaticos(d).filtro);
  if (fEtapa) datosFiltrados = datosFiltrados.filter(d => {
    const idxActual = etapaActualIdx(d);
    const idxEtapa = RECORRIDO.findIndex(p => p.id === fEtapa);
    return idxActual === idxEtapa;
  });
  // Orden
  datosFiltrados.sort((a, b) => orden === "fecha_asc" ? (a.creadoMs || 0) - (b.creadoMs || 0) : (b.creadoMs || 0) - (a.creadoMs || 0));

  const hayFiltro = fMes || fDatero || fVendedor || fEtapa || fFiltrado;
  function limpiarFiltros() { setFMes(""); setFDatero(""); setFVendedor(""); setFEtapa(""); setFFiltrado(""); }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/comercial`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>📇 Datos</h1>
            <p style={styles.headerSub}>{proyecto?.nombre} · Comercial{!puedeEditar && " · 👁️ Solo lectura"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {puedeEditar && (
          <div style={styles.cargaBox}>
            <div style={styles.cargaTitle}>➕ Cargar un dato</div>
            <div style={styles.cargaRow}>
              <input style={styles.input} placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
              <input style={styles.input} placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} onKeyDown={e => e.key === "Enter" && agregar()} />
              <button style={styles.addBtn} onClick={agregar} disabled={guardando}>{guardando ? "..." : "Agregar"}</button>
            </div>
          </div>
        )}

        {/* Filtros (admin) */}
        {esAdmin && (
          <div style={styles.filtrosBox}>
            <div style={styles.filtrosRow}>
              <select style={styles.filtroSelect} value={fMes} onChange={e => setFMes(e.target.value)}>
                <option value="">Todos los meses</option>
                {meses.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <select style={styles.filtroSelect} value={fDatero} onChange={e => setFDatero(e.target.value)}>
                <option value="">Todos los dateros</option>
                {dateros.map(d => <option key={d.uid} value={d.uid}>{d.nombre}</option>)}
              </select>
              <select style={styles.filtroSelect} value={fVendedor} onChange={e => setFVendedor(e.target.value)}>
                <option value="">Todos los vendedores</option>
                {vendedores.map(v => <option key={v.uid} value={v.uid}>{v.nombre}</option>)}
              </select>
              <select style={styles.filtroSelect} value={fFiltrado} onChange={e => setFFiltrado(e.target.value)}>
                <option value="">Filtrado: todos</option>
                <option value="si">Solo filtrados</option>
                <option value="no">Sin filtrar</option>
              </select>
              <select style={styles.filtroSelect} value={fEtapa} onChange={e => setFEtapa(e.target.value)}>
                <option value="">Todas las etapas</option>
                {RECORRIDO.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <select style={styles.filtroSelect} value={orden} onChange={e => setOrden(e.target.value)}>
                <option value="fecha_desc">Más nuevos primero</option>
                <option value="fecha_asc">Más viejos primero</option>
              </select>
              {hayFiltro && <button style={styles.limpiarBtn} onClick={limpiarFiltros}>✕ Limpiar</button>}
            </div>
          </div>
        )}

        <div style={styles.listaHeader}>
          <span style={styles.listaTitulo}>
            {hayFiltro ? "Resultado" : "Datos cargados"} ({datosFiltrados.length}{hayFiltro ? ` de ${esAdmin ? datos.length : datos.filter(d => d.cargadoPorUid === currentUser.uid).length}` : ""})
          </span>
        </div>

        {datosFiltrados.length === 0 ? (
          <p style={styles.empty}>{hayFiltro ? "No hay datos que coincidan con el filtro." : "Todavía no hay datos cargados."}</p>
        ) : (
          <div style={styles.tabla}>
            <div style={styles.theadRow}>
              <div style={{ ...styles.th, flex: 2 }}>Nombre</div>
              <div style={{ ...styles.th, flex: 1.5 }}>Número</div>
              <div style={{ ...styles.th, flex: 1 }}>Estado</div>
              {esAdmin && <div style={{ ...styles.th, flex: 1.5 }}>Cargado por</div>}
              <div style={{ ...styles.th, flex: 0.6, textAlign: "right" }}></div>
            </div>
            {datosFiltrados.map(d => {
              const abierto = expandido === d.id;
              const auto = pasosAutomaticos(d);
              const rec = d.recorrido || {};
              const idxActual = etapaActualIdx(d);
              return (
              <div key={d.id}>
                <div style={{ ...styles.trow, cursor: "pointer", ...(abierto ? { background: "var(--surface)" } : {}) }}
                  onClick={() => { setExpandido(abierto ? null : d.id); setEtapaAbierta(null); }}>
                  <div style={{ ...styles.td, flex: 2, fontWeight: 600 }}>
                    <span style={{ marginRight: "8px", color: "var(--text2)" }}>{abierto ? "▾" : "▸"}</span>{d.nombre}
                  </div>
                  <div style={{ ...styles.td, flex: 1.5 }}>{d.numero}</div>
                  <div style={{ ...styles.td, flex: 1 }}><span style={styles.estadoTag}>{RECORRIDO[idxActual]?.label || d.estado}</span></div>
                  {esAdmin && <div style={{ ...styles.td, flex: 1.5, color: "var(--text2)", fontSize: "12px" }}>{d.cargadoPorNombre}</div>}
                  <div style={{ ...styles.td, flex: 0.6, justifyContent: "flex-end" }}>
                    {(esAdmin || (puedeEditar && d.cargadoPorUid === currentUser.uid)) && d.estado === "crudo" && (
                      <button style={styles.delBtn} onClick={(e) => { e.stopPropagation(); eliminar(d); }} title="Eliminar">✕</button>
                    )}
                  </div>
                </div>

                {/* Barra de progreso desplegable */}
                {abierto && (
                  <div style={styles.progWrap}>
                    <div style={styles.progBarra}>
                      {RECORRIDO.map((paso, i) => {
                        const hecho = paso.auto ? !!auto[paso.id] : !!rec[paso.id];
                        const activa = etapaAbierta === paso.id;
                        return (
                          <div key={paso.id} style={styles.progPasoWrap}>
                            {i > 0 && <div style={{ ...styles.progLinea, ...(i <= idxActual ? styles.progLineaHecha : {}) }} />}
                            <button
                              style={{ ...styles.progPunto, ...(hecho ? styles.progPuntoHecho : {}), ...(activa ? styles.progPuntoActivo : {}) }}
                              onClick={() => setEtapaAbierta(activa ? null : paso.id)}
                              title={paso.label}
                            >
                              {hecho ? "✓" : i + 1}
                            </button>
                            <div style={styles.progLabel}>{paso.label}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Informe de la etapa abierta */}
                    {etapaAbierta && (() => {
                      const paso = RECORRIDO.find(p => p.id === etapaAbierta);
                      const info = rec[etapaAbierta];
                      const hecho = paso.auto ? !!auto[etapaAbierta] : !!info;
                      return (
                        <div style={styles.progInforme}>
                          <div style={styles.progInformeTitulo}>{paso.label}</div>
                          {!hecho ? (
                            <div style={styles.progInformeVacio}>Todavía no se llegó a esta etapa.</div>
                          ) : paso.auto ? (
                            <div style={styles.progInformeVacio}>
                              {etapaAbierta === "contacto" && `Contacto cargado por ${d.cargadoPorNombre || "—"}.`}
                              {etapaAbierta === "filtro" && (d.filtradorNombre ? `Filtrado por ${d.filtradorNombre}.` : "Filtrado.")}
                              {etapaAbierta === "llamado" && (d.vendedorNombre ? `En venta con ${d.vendedorNombre}.` : "Llamado por el vendedor.")}
                            </div>
                          ) : (
                            <div>
                              <div style={styles.progInformeFecha}>📅 {info.fecha ? new Date(info.fecha).toLocaleDateString() : "—"}</div>
                              {info.nota ? <div style={styles.progInformeNota}>{info.nota}</div> : <div style={styles.progInformeVacio}>Sin nota.</div>}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              );
            })}
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
  main: { maxWidth: "900px", margin: "0 auto", padding: "32px 24px" },
  cargaBox: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "18px", marginBottom: "24px" },
  cargaTitle: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "12px" },
  cargaRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
  input: { flex: 1, minWidth: "140px", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box" },
  addBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
  listaHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
  filtrosBox: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "14px", marginBottom: "16px" },
  filtrosRow: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  filtroSelect: { padding: "8px 10px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "13px", cursor: "pointer" },
  limpiarBtn: { background: "transparent", border: "1.5px solid var(--border2)", color: "var(--text2)", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  listaTitulo: { fontSize: "15px", fontWeight: "700", color: "var(--text)" },
  empty: { color: "var(--text2)", fontSize: "14px" },
  tabla: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", overflow: "hidden" },
  theadRow: { display: "flex", padding: "12px 18px", background: "var(--nav)", borderBottom: "1.5px solid var(--border)" },
  th: { fontSize: "11px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.5px" },
  trow: { display: "flex", padding: "12px 18px", borderBottom: "1px solid var(--border)", alignItems: "center" },
  progWrap: { padding: "18px 24px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" },
  progBarra: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", overflowX: "auto", paddingBottom: "8px" },
  progPasoWrap: { display: "flex", flexDirection: "column", alignItems: "center", position: "relative", flex: 1, minWidth: "70px" },
  progLinea: { position: "absolute", top: "16px", right: "50%", width: "100%", height: "3px", background: "var(--border)", zIndex: 0 },
  progLineaHecha: { background: "#16a34a" },
  progPunto: { width: "34px", height: "34px", borderRadius: "50%", border: "2px solid var(--border)", background: "var(--bg)", color: "var(--text2)", cursor: "pointer", fontSize: "13px", fontWeight: "700", zIndex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" },
  progPuntoHecho: { background: "#16a34a", borderColor: "#16a34a", color: "#fff" },
  progPuntoActivo: { boxShadow: "0 0 0 3px rgba(37,99,235,0.4)", borderColor: "#2563eb" },
  progLabel: { fontSize: "10.5px", color: "var(--text2)", textAlign: "center", marginTop: "6px", lineHeight: "1.2", maxWidth: "72px" },
  progInforme: { marginTop: "16px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "14px" },
  progInformeTitulo: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "8px" },
  progInformeFecha: { fontSize: "12px", color: "var(--text2)", marginBottom: "6px" },
  progInformeNota: { fontSize: "14px", color: "var(--text)", lineHeight: "1.5" },
  progInformeVacio: { fontSize: "13px", color: "var(--text2)", fontStyle: "italic" },
  td: { display: "flex", alignItems: "center", fontSize: "14px", color: "var(--text)" },
  estadoTag: { fontSize: "11px", background: "var(--surface)", color: "var(--text2)", padding: "2px 10px", borderRadius: "20px", border: "1px solid var(--border)", textTransform: "capitalize" },
  delBtn: { background: "transparent", border: "1px solid #fca5a5", color: "#dc2626", width: "26px", height: "26px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
};
