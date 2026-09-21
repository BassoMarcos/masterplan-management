import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import Notificaciones from "../components/Notificaciones";
import { AREAS_DEFAULT, areasVisibles, areasVisiblesEmpleado, panelesVisiblesEmpleado, empleadoNivelPanel } from "../config/appConfig";
import { PANELES_ADMINISTRACION } from "./AdministracionPanel";

// Entrada del pilar Administración: 3 secciones que comparten los mismos datos.
// Lo que ve cada empleado depende de sus permisos por panel (ver Empleados).
export default function AdministracionHub() {
  const { proyectoId } = useParams();
  const { empresaData, empleadoData, empresaUid, esEmpleado, logout } = useAuth();
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

  const visibles = esEmpleado
    ? areasVisiblesEmpleado(empresaData, empleadoData, proyectoId)
    : areasVisibles(empresaData);
  const areaPermitida = visibles.some(a => a.id === "administracion");
  if (!areaPermitida) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyWrap}>
          <p style={{ color: "var(--text2)" }}>Esta área no está disponible.</p>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}`)}>← Volver</button>
        </div>
      </div>
    );
  }

  const area = AREAS_DEFAULT.find(a => a.id === "administracion");
  const paneles = esEmpleado
    ? panelesVisiblesEmpleado(empleadoData, proyectoId, "administracion")
    : area.paneles;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>📊 Administración</h1>
            <p style={styles.headerSub}>{proyecto?.nombre}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Notificaciones />
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {paneles.length === 0 ? (
          <p style={styles.empty}>No tenés secciones habilitadas en Administración.</p>
        ) : (
          <div style={styles.grid}>
            {paneles.map(p => {
              const info = PANELES_ADMINISTRACION[p.id] || { icono: "📋", desc: "" };
              const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "administracion", p.id) : "editar";
              return (
                <div
                  key={p.id}
                  style={styles.card}
                  onClick={() => navigate(`/proyecto/${proyectoId}/administracion/${p.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
                >
                  <div style={styles.cardIcon}>{info.icono}</div>
                  <div style={styles.cardNombre}>{p.nombre}</div>
                  <div style={styles.cardDesc}>{info.desc}</div>
                  {esEmpleado && nivel === "ver" && <div style={styles.soloVer}>👁️ Solo lectura</div>}
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
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" },
  card: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "28px 20px", cursor: "pointer", transition: "transform 0.2s", textAlign: "center" },
  cardIcon: { fontSize: "40px", marginBottom: "10px" },
  cardNombre: { fontSize: "17px", fontWeight: "700", color: "var(--text)", marginBottom: "6px" },
  cardDesc: { fontSize: "12.5px", color: "var(--text2)", lineHeight: "1.4" },
  soloVer: { marginTop: "10px", fontSize: "11px", color: "var(--text2)", background: "var(--surface)", padding: "3px 8px", borderRadius: "20px", display: "inline-block" },
  empty: { color: "var(--text2)", fontSize: "14px" },
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "80px 24px" },
};
