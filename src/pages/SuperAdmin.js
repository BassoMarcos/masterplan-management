import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, getDocs, doc, updateDoc, orderBy, query } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { AREAS_DEFAULT } from "../config/appConfig";
import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE = "service_hitlzvt";
const EMAILJS_TEMPLATE = "template_nmympyf";
const EMAILJS_PUBLIC_KEY = "WjAT2u4juvwDfPndb";

const ESTADO_COLOR = {
  pendiente: { bg: "#fef9c3", color: "#854d0e", label: "Pendiente" },
  activo: { bg: "#dcfce7", color: "#166534", label: "Activo" },
  inactivo: { bg: "#fee2e2", color: "#991b1b", label: "Inactivo" },
};

export default function SuperAdmin() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [configEmpresa, setConfigEmpresa] = useState(null); // empresa cuyo modal de config está abierto
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  useEffect(() => {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    cargarEmpresas();
  }, []);

  async function cargarEmpresas() {
    setLoading(true);
    try {
      const q = query(collection(db, "empresas"), orderBy("creadoEn", "desc"));
      const snap = await getDocs(q);
      setEmpresas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function cambiarEstado(id, nuevoEstado, empresa) {
    await updateDoc(doc(db, "empresas", id), { estado: nuevoEstado });
    setEmpresas(prev => prev.map(e => e.id === id ? { ...e, estado: nuevoEstado } : e));

    if (nuevoEstado === "activo" && empresa.email) {
      try {
        await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
          to_email: empresa.email,
          empresa_nombre: empresa.nombre,
        });
      } catch (e) {
        console.error("Error enviando email:", e);
      }
    }
  }

  async function guardarConfig(empresaId, nuevaConfig) {
    setGuardandoConfig(true);
    try {
      await updateDoc(doc(db, "empresas", empresaId), { config: nuevaConfig });
      setEmpresas(prev => prev.map(e => e.id === empresaId ? { ...e, config: nuevaConfig } : e));
      setConfigEmpresa(prev => prev ? { ...prev, config: nuevaConfig } : prev);
    } catch (e) {
      console.error("Error guardando config:", e);
      alert("No se pudo guardar la configuración.");
    }
    setGuardandoConfig(false);
  }

  function togglePersonalizada(empresa) {
    const config = empresa.config || {};
    guardarConfig(empresa.id, { ...config, personalizada: !config.personalizada });
  }

  function toggleArea(empresa, areaId) {
    const config = empresa.config || {};
    const ocultas = Array.isArray(config.areasOcultas) ? config.areasOcultas : [];
    const nuevas = ocultas.includes(areaId)
      ? ocultas.filter(a => a !== areaId)
      : [...ocultas, areaId];
    guardarConfig(empresa.id, { ...config, areasOcultas: nuevas });
  }

  const empresasFiltradas = filtro === "todos" ? empresas : empresas.filter(e => e.estado === filtro);
  const counts = {
    todos: empresas.length,
    pendiente: empresas.filter(e => e.estado === "pendiente").length,
    activo: empresas.filter(e => e.estado === "activo").length,
    inactivo: empresas.filter(e => e.estado === "inactivo").length
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: "22px" }}>🏗️</span>
          <div>
            <h1 style={styles.headerTitle}>MasterPlan</h1>
            <p style={styles.headerSub}>Panel de Administración</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        <h2 style={styles.titulo}>Empresas Registradas</h2>

        <div style={styles.filtros}>
          {["todos", "pendiente", "activo", "inactivo"].map(f => (
            <button
              key={f}
              style={{ ...styles.filtroBtn, ...(filtro === f ? styles.filtroBtnActive : {}) }}
              onClick={() => setFiltro(f)}
            >
              {f === "todos" ? "Todos" : ESTADO_COLOR[f].label} ({counts[f]})
            </button>
          ))}
        </div>

        {loading ? (
          <p style={styles.cargando}>Cargando...</p>
        ) : empresasFiltradas.length === 0 ? (
          <p style={styles.cargando}>No hay empresas en esta categoría.</p>
        ) : (
          <div style={styles.tabla}>
            <div style={styles.tablaHeader}>
              <span>Empresa</span>
              <span>Email</span>
              <span>Registro</span>
              <span>Estado</span>
              <span>Acciones</span>
            </div>
            {empresasFiltradas.map(e => (
              <div key={e.id} style={styles.tablaFila}>
                <span style={{ color: "var(--text)", fontWeight: "600" }}>{e.nombre}</span>
                <span style={{ color: "var(--text2)" }}>{e.email}</span>
                <span style={{ color: "var(--text2)", fontSize: "13px" }}>
                  {e.creadoEn ? new Date(e.creadoEn).toLocaleDateString("es-AR") : "-"}
                </span>
                <span>
                  <span style={{ ...styles.estadoBadge, background: ESTADO_COLOR[e.estado]?.bg, color: ESTADO_COLOR[e.estado]?.color }}>
                    {ESTADO_COLOR[e.estado]?.label || e.estado}
                  </span>
                </span>
                <span style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {e.estado === "pendiente" && (
                    <button style={styles.btnAprobar} onClick={() => cambiarEstado(e.id, "activo", e)}>Aprobar</button>
                  )}
                  {e.estado === "activo" && (
                    <button style={styles.btnDesactivar} onClick={() => cambiarEstado(e.id, "inactivo", e)}>Desactivar</button>
                  )}
                  {e.estado === "inactivo" && (
                    <button style={styles.btnAprobar} onClick={() => cambiarEstado(e.id, "activo", e)}>Reactivar</button>
                  )}
                  <button style={styles.btnConfig} onClick={() => setConfigEmpresa(e)}>⚙️ Config</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {configEmpresa && (() => {
        const config = configEmpresa.config || {};
        const ocultas = Array.isArray(config.areasOcultas) ? config.areasOcultas : [];
        const personalizada = !!config.personalizada;
        return (
          <div style={styles.overlay} onClick={() => setConfigEmpresa(null)}>
            <div style={styles.modal} onClick={ev => ev.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div>
                  <h3 style={styles.modalTitulo}>Configuración</h3>
                  <p style={styles.modalSub}>{configEmpresa.nombre}</p>
                </div>
                <button style={styles.cerrarBtn} onClick={() => setConfigEmpresa(null)}>✕</button>
              </div>

              <div style={styles.modalBody}>
                <div style={styles.switchRow}>
                  <div>
                    <div style={styles.switchLabel}>Personalización activada</div>
                    <div style={styles.switchHint}>Habilitá esto cuando la empresa contrató una versión a medida.</div>
                  </div>
                  <button
                    style={{ ...styles.switch, background: personalizada ? "#16a34a" : "var(--border2)" }}
                    onClick={() => togglePersonalizada(configEmpresa)}
                    disabled={guardandoConfig}
                  >
                    <span style={{ ...styles.switchKnob, transform: personalizada ? "translateX(20px)" : "translateX(0)" }} />
                  </button>
                </div>

                <div style={styles.divider} />

                <div style={styles.seccionTitulo}>Áreas visibles para esta empresa</div>
                <p style={styles.switchHint}>Apagá un área para que esta empresa no la vea. Las demás empresas no se ven afectadas.</p>
                {AREAS_DEFAULT.map(area => {
                  const visible = !ocultas.includes(area.id);
                  return (
                    <div key={area.id} style={styles.areaRow}>
                      <span style={{ color: "var(--text)", fontSize: "14px" }}>{area.icono} {area.nombre}</span>
                      <button
                        style={{ ...styles.switch, background: visible ? "#16a34a" : "var(--border2)" }}
                        onClick={() => toggleArea(configEmpresa, area.id)}
                        disabled={guardandoConfig}
                      >
                        <span style={{ ...styles.switchKnob, transform: visible ? "translateX(20px)" : "translateX(0)" }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "12px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "#f59e0b" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" },
  titulo: { fontSize: "26px", fontWeight: "700", color: "var(--text)", margin: "0 0 24px" },
  filtros: { display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" },
  filtroBtn: { padding: "8px 16px", borderRadius: "20px", border: "1.5px solid var(--border2)", background: "var(--card)", cursor: "pointer", fontSize: "13px", fontWeight: "500", color: "var(--text2)" },
  filtroBtnActive: { background: "var(--acc)", color: "#fff", border: "1.5px solid var(--acc)" },
  cargando: { color: "var(--text2)" },
  tabla: { background: "var(--card)", borderRadius: "12px", border: "1.5px solid var(--border)", overflow: "hidden" },
  tablaHeader: { display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr", padding: "14px 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)", fontSize: "12px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase" },
  tablaFila: { display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr", padding: "16px 20px", borderBottom: "1px solid var(--border)", alignItems: "center", fontSize: "14px" },
  estadoBadge: { padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" },
  btnAprobar: { padding: "6px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  btnDesactivar: { padding: "6px 14px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  btnConfig: { padding: "6px 14px", background: "var(--hov)", color: "var(--text)", border: "1px solid var(--border2)", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
  modal: { background: "var(--surface)", borderRadius: "16px", width: "100%", maxWidth: "460px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" },
  modalHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "24px 24px 0" },
  modalTitulo: { margin: 0, fontSize: "19px", fontWeight: "700", color: "var(--text)" },
  modalSub: { margin: "2px 0 0", fontSize: "13px", color: "var(--text2)" },
  cerrarBtn: { background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "var(--text2)", padding: "4px 8px" },
  modalBody: { padding: "20px 24px 24px" },
  switchRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" },
  switchLabel: { fontSize: "14px", fontWeight: "600", color: "var(--text)" },
  switchHint: { fontSize: "12px", color: "var(--text2)", margin: "2px 0 0", lineHeight: "1.4" },
  switch: { width: "44px", height: "24px", borderRadius: "12px", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, padding: 0, transition: "background 0.2s" },
  switchKnob: { position: "absolute", top: "2px", left: "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "transform 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" },
  divider: { height: "1px", background: "var(--border)", margin: "20px 0" },
  seccionTitulo: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "4px" },
  areaRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" },
};
