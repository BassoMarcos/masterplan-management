import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { panelesVisiblesEmpleado, empleadoNivelPanel } from "../config/appConfig";

// Íconos y descripciones de cada panel de Comercial
const PANEL_INFO = {
  datos: { icono: "📇", desc: "Cargar y ver contactos crudos" },
  filtrado: { icono: "🔍", desc: "Primer llamado y formulario de filtro" },
  ventas: { icono: "💰", desc: "Trabajar datos filtrados y reportar" },
  config_filtro: { icono: "⚙️", desc: "Armar las preguntas del formulario de filtro" },
};

export default function ComercialHub() {
  const { proyectoId } = useParams();
  const { empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();
  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, "proyectos", proyectoId));
        if (snap.exists() && snap.data().empresaId === empresaUid) {
          setProyecto({ id: snap.id, ...snap.data() });
        } else {
          navigate("/proyectos");
        }
      } catch {
        navigate("/proyectos");
      }
      setLoading(false);
    }
    cargar();
  }, [proyectoId, empresaUid, navigate]);

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  // Paneles visibles según permisos del empleado (o todos si es dueño/admin)
  const paneles = esEmpleado
    ? panelesVisiblesEmpleado(empleadoData, proyectoId, "comercial")
    : [
        { id: "datos", nombre: "Datos" },
        { id: "filtrado", nombre: "Filtrado" },
        { id: "ventas", nombre: "Ventas" },
        { id: "config_filtro", nombre: "Configurar formulario de filtro" },
      ];

  function irAlPanel(panelId) {
    if (panelId === "datos") navigate(`/proyecto/${proyectoId}/comercial/datos`);
    else alert("Este panel se habilita en la próxima etapa.");
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>🤝 Comercial</h1>
            <p style={styles.headerSub}>{proyecto?.nombre}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.grid}>
          {paneles.map(p => {
            const info = PANEL_INFO[p.id] || { icono: "📋", desc: "" };
            const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "comercial", p.id) : "editar";
            return (
              <div key={p.id} style={styles.card} onClick={() => irAlPanel(p.id)}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                <div style={styles.cardIcon}>{info.icono}</div>
                <div style={styles.cardNombre}>{p.nombre}</div>
                <div style={styles.cardDesc}>{info.desc}</div>
                {esEmpleado && nivel === "ver" && <div style={styles.soloVer}>👁️ Solo lectura</div>}
              </div>
            );
          })}
        </div>
        {paneles.length === 0 && <p style={styles.empty}>No tenés paneles habilitados en Comercial.</p>}
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
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" },
  card: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "24px 20px", cursor: "pointer", transition: "transform 0.2s", textAlign: "center" },
  cardIcon: { fontSize: "40px", marginBottom: "10px" },
  cardNombre: { fontSize: "16px", fontWeight: "700", color: "var(--text)", marginBottom: "6px" },
  cardDesc: { fontSize: "12.5px", color: "var(--text2)", lineHeight: "1.4" },
  soloVer: { marginTop: "10px", fontSize: "11px", color: "var(--text2)", background: "var(--surface)", padding: "3px 8px", borderRadius: "20px", display: "inline-block" },
  empty: { color: "var(--text2)", fontSize: "14px" },
};
