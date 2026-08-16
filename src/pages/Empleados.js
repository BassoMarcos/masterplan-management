import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { AREAS_DEFAULT } from "../config/appConfig";

const NIVELES = [
  { id: "ninguno", label: "Sin acceso", color: "#94a3b8" },
  { id: "ver", label: "Solo ver", color: "#2563eb" },
  { id: "editar", label: "Ver y modificar", color: "#16a34a" },
];

export default function Empleados() {
  const { currentUser, empresaData, logout } = useAuth();
  const navigate = useNavigate();

  const [empleados, setEmpleados] = useState([]);
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
    const permIni = {};
    AREAS_DEFAULT.forEach(a => { permIni[a.id] = (emp.permisos && emp.permisos[a.id]) || "ninguno"; });
    setPermisos(permIni);
    setAccesoTotal(!!emp.accesoTotal);
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
  const aprobados = empleados.filter(e => e.estado === "aprobado");
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
              <div style={styles.permisosBox}>
                <div style={styles.permisosTitle}>Permisos por área</div>
                {AREAS_DEFAULT.map(a => (
                  <div key={a.id} style={styles.permisoRow}>
                    <div style={styles.permisoArea}>{a.icono} {a.nombre}</div>
                    <div style={styles.nivelesRow}>
                      {NIVELES.map(n => (
                        <button
                          key={n.id}
                          onClick={() => setPermisos({ ...permisos, [a.id]: n.id })}
                          style={{
                            ...styles.nivelBtn,
                            ...(permisos[a.id] === n.id ? { background: n.color, color: "#fff", borderColor: n.color } : {}),
                          }}
                        >
                          {n.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
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
  if (!permisos) return "Sin permisos";
  const activos = AREAS_DEFAULT.filter(a => permisos[a.id] && permisos[a.id] !== "ninguno");
  if (activos.length === 0) return "Sin acceso a áreas";
  return activos.map(a => a.nombre).join(", ");
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
  permisosTitle: { fontSize: "13px", fontWeight: "700", color: "var(--text2)", marginBottom: "10px" },
  permisoRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" },
  permisoArea: { fontSize: "14px", fontWeight: "600", color: "var(--text)" },
  nivelesRow: { display: "flex", gap: "6px" },
  nivelBtn: { background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" },
  cancelBtn: { background: "transparent", border: "1.5px solid var(--border)", color: "var(--text2)", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  confirmBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
};
