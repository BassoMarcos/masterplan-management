import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { AREAS_DEFAULT, areasVisibles } from "../config/appConfig";

const NIVELES = [
  { id: "ninguno", label: "Sin acceso", color: "#94a3b8" },
  { id: "ver", label: "Solo ver", color: "#2563eb" },
  { id: "editar", label: "Ver y modificar", color: "#16a34a" },
];
const RANK = { ninguno: 0, ver: 1, editar: 2 };

export default function Empleados() {
  const { currentUser, empresaData, logout } = useAuth();
  const navigate = useNavigate();

  const [empleados, setEmpleados] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aprobando, setAprobando] = useState(null); // empleado en proceso de aprobación
  const [legajo, setLegajo] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [permisos, setPermisos] = useState({});
  const [accesoTotal, setAccesoTotal] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "empleados"), where("empresaId", "==", currentUser.uid));
      const snap = await getDocs(q);
      setEmpleados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      // Proyectos de la empresa (para asignar permisos por proyecto)
      const qp = query(collection(db, "proyectos"), where("empresaId", "==", currentUser.uid));
      const snapP = await getDocs(qp);
      setProyectos(snapP.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [currentUser.uid]);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirAprobacion(emp) {
    setAprobando(emp);
    setLegajo(emp.legajo || "");
    setNombre(emp.nombre || "");
    setApellido(emp.apellido || "");
    // permisos.proyectos[proyId][areaId] = { _area: nivel, <panelId>: nivel }
    const permIni = { proyectos: {} };
    const previos = emp.permisos?.proyectos || {};
    proyectos.forEach(proy => {
      permIni.proyectos[proy.id] = {};
      AREAS_DEFAULT.forEach(a => {
        const prevArea = previos[proy.id]?.[a.id];
        const obj = {};
        // Compatibilidad: formato viejo (string) -> se toma como atajo _area
        if (typeof prevArea === "string") {
          obj._area = prevArea;
        } else if (prevArea && typeof prevArea === "object") {
          obj._area = prevArea._area || "ninguno";
          (a.paneles || []).forEach(p => { obj[p.id] = prevArea[p.id] || "ninguno"; });
        } else {
          obj._area = "ninguno";
        }
        (a.paneles || []).forEach(p => { if (!(p.id in obj)) obj[p.id] = "ninguno"; });
        permIni.proyectos[proy.id][a.id] = obj;
      });
    });
    setPermisos(permIni);
    setAccesoTotal(!!emp.accesoTotal);
  }

  // Setea el atajo "toda el área"
  function setNivelArea(proyId, areaId, nivel) {
    setPermisos(prev => {
      const areaPrev = prev.proyectos?.[proyId]?.[areaId] || {};
      return {
        ...prev,
        proyectos: {
          ...prev.proyectos,
          [proyId]: { ...(prev.proyectos?.[proyId] || {}), [areaId]: { ...areaPrev, _area: nivel } },
        },
      };
    });
  }

  // Setea el nivel de un sub-panel puntual
  function setNivelPanel(proyId, areaId, panelId, nivel) {
    setPermisos(prev => {
      const areaPrev = prev.proyectos?.[proyId]?.[areaId] || {};
      return {
        ...prev,
        proyectos: {
          ...prev.proyectos,
          [proyId]: { ...(prev.proyectos?.[proyId] || {}), [areaId]: { ...areaPrev, [panelId]: nivel } },
        },
      };
    });
  }

  function cerrarAprobacion() {
    setAprobando(null);
    setLegajo(""); setNombre(""); setApellido(""); setPermisos({}); setAccesoTotal(false);
  }

  async function confirmarAprobacion() {
    if (!legajo.trim()) { alert("Ingresá un número de legajo."); return; }
    if (!nombre.trim() || !apellido.trim()) { alert("Completá nombre y apellido."); return; }
    setGuardando(true);
    try {
      await updateDoc(doc(db, "empleados", aprobando.id), {
        estado: "aprobado",
        legajo: legajo.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        permisos,
        accesoTotal,
        aprobadoEn: new Date().toISOString(),
      });
      cerrarAprobacion();
      cargar();
    } catch (e) {
      alert("Error al aprobar: " + e.message);
    }
    setGuardando(false);
  }

  async function rechazar(emp) {
    if (!window.confirm(`¿Rechazar la solicitud de ${emp.nombre} ${emp.apellido}? Se eliminará su solicitud.`)) return;
    try {
      await deleteDoc(doc(db, "empleados", emp.id));
      cargar();
    } catch (e) {
      alert("Error al rechazar: " + e.message);
    }
  }

  async function darDeBaja(emp) {
    if (!window.confirm(`¿Dar de baja a ${emp.nombre} ${emp.apellido}? Ya no podrá ingresar.`)) return;
    try {
      await updateDoc(doc(db, "empleados", emp.id), { estado: "baja" });
      cargar();
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  async function reactivar(emp) {
    try {
      await updateDoc(doc(db, "empleados", emp.id), { estado: "aprobado" });
      cargar();
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  const pendientes = empleados.filter(e => e.estado === "pendiente");
  const ordenarLegajo = (a, b) => {
    const na = parseInt(a.legajo, 10); const nb = parseInt(b.legajo, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb; // ambos numéricos
    return String(a.legajo || "").localeCompare(String(b.legajo || ""));
  };
  const aprobados = empleados.filter(e => e.estado === "aprobado").sort(ordenarLegajo);
  const bajas = empleados.filter(e => e.estado === "baja");

  if (loading) return <div style={{ padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>Cargando...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate("/proyectos")}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>👥 Empleados</h1>
            <p style={styles.headerSub}>{empresaData?.nombre || "Mi Empresa"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Pendientes */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>⏳ Solicitudes pendientes {pendientes.length > 0 && <span style={styles.badge}>{pendientes.length}</span>}</h2>
          {pendientes.length === 0 ? (
            <p style={styles.empty}>No hay solicitudes pendientes.</p>
          ) : (
            pendientes.map(emp => (
              <div key={emp.id} style={styles.cardPend}>
                <div>
                  <div style={styles.empNombre}>{emp.nombre} {emp.apellido}</div>
                  <div style={styles.empEmail}>{emp.email}</div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button style={styles.aprobarBtn} onClick={() => abrirAprobacion(emp)}>✓ Aprobar</button>
                  <button style={styles.rechazarBtn} onClick={() => rechazar(emp)}>✕ Rechazar</button>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Aprobados */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>✅ Empleados activos {aprobados.length > 0 && <span style={styles.badgeOk}>{aprobados.length}</span>}</h2>
          {aprobados.length === 0 ? (
            <p style={styles.empty}>Todavía no hay empleados activos.</p>
          ) : (
            <div style={styles.tabla}>
              <div style={styles.theadRow}>
                <div style={{ ...styles.th, flex: 0.6 }}>Legajo</div>
                <div style={{ ...styles.th, flex: 2 }}>Nombre y apellido</div>
                <div style={{ ...styles.th, flex: 1.4 }}>Acceso</div>
                <div style={{ ...styles.th, flex: 1, textAlign: "right" }}>Acciones</div>
              </div>
              {aprobados.map(emp => (
                <div key={emp.id} style={styles.trow}>
                  <div style={{ ...styles.td, flex: 0.6, fontWeight: 700 }}>{emp.legajo || "—"}</div>
                  <div style={{ ...styles.td, flex: 2 }}>
                    <div style={{ fontWeight: 600 }}>{emp.nombre} {emp.apellido}</div>
                    <div style={styles.empEmail}>{emp.email}</div>
                  </div>
                  <div style={{ ...styles.td, flex: 1.4, fontSize: "12px", color: "var(--text2)" }}>
                    {emp.accesoTotal ? "🔓 Acceso total" : resumenPermisos(emp.permisos)}
                  </div>
                  <div style={{ ...styles.td, flex: 1, justifyContent: "flex-end", gap: "6px" }}>
                    <button style={styles.smallBtn} onClick={() => abrirAprobacion(emp)}>✏️ Permisos</button>
                    <button style={styles.smallBtnRed} onClick={() => darDeBaja(emp)}>Baja</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Bajas */}
        {bajas.length > 0 && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>🚫 Dados de baja</h2>
            {bajas.map(emp => (
              <div key={emp.id} style={styles.cardBaja}>
                <div>
                  <div style={styles.empNombre}>{emp.nombre} {emp.apellido} <span style={styles.legajoTag}>Legajo {emp.legajo}</span></div>
                  <div style={styles.empEmail}>{emp.email}</div>
                </div>
                <button style={styles.reactivarBtn} onClick={() => reactivar(emp)}>↩ Reactivar</button>
              </div>
            ))}
          </section>
        )}
      </main>

      {/* Modal aprobar / editar permisos */}
      {aprobando && (
        <div style={styles.modalOverlay} onClick={() => !guardando && cerrarAprobacion()}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{aprobando.estado === "aprobado" ? "Editar permisos" : "Aprobar empleado"}</h2>

            <div style={styles.formRow}>
              <div style={{ flex: 0.6 }}>
                <label style={styles.label}>Legajo *</label>
                <input style={styles.input} value={legajo} onChange={e => setLegajo(e.target.value)} placeholder="Ej: 001" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Nombre *</label>
                <input style={styles.input} value={nombre} onChange={e => setNombre(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Apellido *</label>
                <input style={styles.input} value={apellido} onChange={e => setApellido(e.target.value)} />
              </div>
            </div>

            <label style={styles.accesoTotalRow}>
              <input type="checkbox" checked={accesoTotal} onChange={e => setAccesoTotal(e.target.checked)} style={{ width: 18, height: 18 }} />
              <div>
                <div style={{ fontWeight: 700 }}>🔓 Acceso total</div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>Ve y modifica todo, igual que un dueño.</div>
              </div>
            </label>

            {!accesoTotal && (
              <div>
                <div style={styles.permisosTitle}>Permisos por proyecto y área</div>
                {proyectos.length === 0 && <p style={styles.empty}>No hay proyectos creados todavía.</p>}
                {proyectos.map(proy => {
                  const permProy = permisos.proyectos?.[proy.id] || {};
                  const areasEmpresa = areasVisibles(empresaData);
                  return (
                    <div key={proy.id} style={styles.proyectoBox}>
                      <div style={styles.proyectoBoxTitle}>
                        {proy.logo ? <img src={proy.logo} alt="" style={styles.proyMini} /> : <span>{proy.icono || "📁"}</span>}
                        {proy.nombre}
                      </div>
                      {areasEmpresa.map(a => {
                        const permArea = permProy[a.id] || {};
                        const nivelArea = permArea._area || "ninguno";
                        const paneles = a.paneles || [];
                        return (
                          <div key={a.id} style={styles.areaBloque}>
                            {/* Fila del atajo: toda el área */}
                            <div style={styles.permisoRow}>
                              <div style={styles.permisoArea}>{a.icono} {a.nombre} <span style={styles.todaLabel}>(toda el área)</span></div>
                              <div style={styles.nivelesRow}>
                                {NIVELES.map(n => (
                                  <button
                                    key={n.id}
                                    onClick={() => setNivelArea(proy.id, a.id, n.id)}
                                    style={{
                                      ...styles.nivelBtn,
                                      ...(nivelArea === n.id ? { background: n.color, color: "#fff", borderColor: n.color } : {}),
                                    }}
                                  >
                                    {n.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Sub-paneles: solo se muestran/usan si el atajo NO da acceso total al área */}
                            {paneles.length > 0 && nivelArea !== "editar" && (
                              <div style={styles.panelesWrap}>
                                {paneles.map(p => {
                                  // nivel efectivo del panel = el mayor entre el atajo y el puntual
                                  const nivelPuntual = permArea[p.id] || "ninguno";
                                  const heredado = nivelArea !== "ninguno" && RANK[nivelArea] >= RANK[nivelPuntual];
                                  const nivelMostrar = heredado ? nivelArea : nivelPuntual;
                                  return (
                                    <div key={p.id} style={styles.panelRow}>
                                      <div style={styles.panelNombre}>↳ {p.nombre}{heredado && nivelArea !== "ninguno" && <span style={styles.heredaTag}>heredado</span>}</div>
                                      <div style={styles.nivelesRow}>
                                        {NIVELES.map(n => (
                                          <button
                                            key={n.id}
                                            onClick={() => setNivelPanel(proy.id, a.id, p.id, n.id)}
                                            style={{
                                              ...styles.nivelBtnSm,
                                              ...(nivelMostrar === n.id ? { background: n.color, color: "#fff", borderColor: n.color } : {}),
                                            }}
                                          >
                                            {n.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={cerrarAprobacion} disabled={guardando}>Cancelar</button>
              <button style={styles.confirmBtn} onClick={confirmarAprobacion} disabled={guardando}>
                {guardando ? "Guardando..." : aprobando.estado === "aprobado" ? "Guardar cambios" : "Aprobar e ingresar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function resumenPermisos(permisos) {
  const proys = permisos?.proyectos;
  if (!proys) return "Sin acceso";
  const tieneAcceso = (areaObj) => {
    if (!areaObj) return false;
    if (typeof areaObj === "string") return areaObj !== "ninguno"; // formato viejo
    return Object.values(areaObj).some(n => n && n !== "ninguno");
  };
  const conAcceso = Object.values(proys).filter(areas =>
    areas && Object.values(areas).some(tieneAcceso)
  ).length;
  if (conAcceso === 0) return "Sin acceso a proyectos";
  return conAcceso + " proyecto" + (conAcceso !== 1 ? "s" : "");
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "900px", margin: "0 auto", padding: "32px 24px" },
  section: { marginBottom: "32px" },
  sectionTitle: { fontSize: "16px", fontWeight: "700", color: "var(--text)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" },
  badge: { background: "#f59e0b", color: "#fff", borderRadius: "99px", padding: "2px 10px", fontSize: "12px", fontWeight: "800" },
  badgeOk: { background: "#16a34a", color: "#fff", borderRadius: "99px", padding: "2px 10px", fontSize: "12px", fontWeight: "800" },
  empty: { color: "var(--text2)", fontSize: "14px" },
  cardPend: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "10px" },
  cardBaja: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", opacity: 0.75 },
  empNombre: { fontWeight: 700, fontSize: "15px", color: "var(--text)" },
  empEmail: { fontSize: "12px", color: "var(--text2)" },
  legajoTag: { fontSize: "11px", background: "var(--surface)", padding: "2px 8px", borderRadius: "6px", color: "var(--text2)", marginLeft: "6px" },
  aprobarBtn: { background: "#16a34a", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "700" },
  rechazarBtn: { background: "transparent", border: "1.5px solid #fca5a5", color: "#dc2626", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  reactivarBtn: { background: "transparent", border: "1.5px solid var(--border2)", color: "var(--text2)", padding: "6px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" },
  tabla: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", overflow: "hidden" },
  theadRow: { display: "flex", padding: "12px 18px", background: "var(--nav)", borderBottom: "1.5px solid var(--border)" },
  th: { fontSize: "11px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.5px" },
  trow: { display: "flex", padding: "12px 18px", borderBottom: "1px solid var(--border)", alignItems: "center" },
  td: { display: "flex", flexDirection: "column", fontSize: "14px", color: "var(--text)" },
  smallBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
  smallBtnRed: { background: "transparent", border: "1px solid #fca5a5", color: "#dc2626", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
  modal: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "28px", maxWidth: "560px", width: "100%", maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { margin: "0 0 20px", fontSize: "18px", fontWeight: "700", color: "var(--text)" },
  formRow: { display: "flex", gap: "12px", marginBottom: "16px" },
  label: { display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text2)", marginBottom: "5px" },
  input: { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit" },
  accesoTotalRow: { display: "flex", alignItems: "center", gap: "12px", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "12px 16px", cursor: "pointer", marginBottom: "16px" },
  permisosBox: { background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "14px" },
  proyectoBox: { background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "14px", marginBottom: "12px" },
  proyectoBoxTitle: { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "10px", paddingBottom: "8px", borderBottom: "1.5px solid var(--border)" },
  proyMini: { width: "22px", height: "22px", borderRadius: "5px", objectFit: "cover" },
  permisosTitle: { fontSize: "13px", fontWeight: "700", color: "var(--text2)", marginBottom: "10px" },
  permisoRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" },
  permisoArea: { fontSize: "14px", fontWeight: "600", color: "var(--text)" },
  nivelesRow: { display: "flex", gap: "6px" },
  nivelBtn: { background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600" },
  nivelBtnSm: { background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "3px 8px", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: "600" },
  areaBloque: { padding: "8px 0", borderBottom: "1px solid var(--border)" },
  todaLabel: { fontSize: "11px", fontWeight: "400", color: "var(--text2)" },
  panelesWrap: { marginTop: "6px", marginLeft: "12px", paddingLeft: "10px", borderLeft: "2px solid var(--border)", display: "flex", flexDirection: "column", gap: "6px" },
  panelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" },
  panelNombre: { fontSize: "12.5px", color: "var(--text)", display: "flex", alignItems: "center", gap: "6px" },
  heredaTag: { fontSize: "10px", background: "var(--surface)", color: "var(--text2)", padding: "1px 6px", borderRadius: "20px", border: "1px solid var(--border)" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" },
  cancelBtn: { background: "transparent", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  confirmBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
};
