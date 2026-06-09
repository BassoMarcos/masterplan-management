import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, getDocs, doc, updateDoc, orderBy, query } from "firebase/firestore";
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
        <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
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
                <span style={{ color: "#0f172a", fontWeight: "600" }}>{e.nombre}</span>
                <span style={{ color: "#64748b" }}>{e.email}</span>
                <span style={{ color: "#64748b", fontSize: "13px" }}>
                  {e.creadoEn ? new Date(e.creadoEn).toLocaleDateString("es-AR") : "-"}
                </span>
                <span>
                  <span style={{ ...styles.estadoBadge, background: ESTADO_COLOR[e.estado]?.bg, color: ESTADO_COLOR[e.estado]?.color }}>
                    {ESTADO_COLOR[e.estado]?.label || e.estado}
                  </span>
                </span>
                <span>
                  {e.estado === "pendiente" && (
                    <button style={styles.btnAprobar} onClick={() => cambiarEstado(e.id, "activo", e)}>Aprobar</button>
                  )}
                  {e.estado === "activo" && (
                    <button style={styles.btnDesactivar} onClick={() => cambiarEstado(e.id, "inactivo", e)}>Desactivar</button>
                  )}
                  {e.estado === "inactivo" && (
                    <button style={styles.btnAprobar} onClick={() => cambiarEstado(e.id, "activo", e)}>Reactivar</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "#0f172a", color: "#fff", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "12px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "#f59e0b" },
  logoutBtn: { background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" },
  titulo: { fontSize: "26px", fontWeight: "700", color: "#0f172a", margin: "0 0 24px" },
  filtros: { display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" },
  filtroBtn: { padding: "8px 16px", borderRadius: "20px", border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: "500", color: "#64748b" },
  filtroBtnActive: { background: "#0f172a", color: "#fff", border: "1.5px solid #0f172a" },
  cargando: { color: "#64748b" },
  tabla: { background: "#fff", borderRadius: "12px", border: "1.5px solid #e2e8f0", overflow: "hidden" },
  tablaHeader: { display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr", padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" },
  tablaFila: { display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr", padding: "16px 20px", borderBottom: "1px solid #f1f5f9", alignItems: "center", fontSize: "14px" },
  estadoBadge: { padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" },
  btnAprobar: { padding: "6px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  btnDesactivar: { padding: "6px 14px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
};
