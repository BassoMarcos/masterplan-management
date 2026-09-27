import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import PizarraFlotante from "../components/PizarraFlotante";
import { AREAS_DEFAULT, areasVisibles, areasVisiblesEmpleado, empleadoNivelPanel, areaActivaEnProyecto, panelActivoEnProyecto } from "../config/appConfig";

// Entrada de las áreas que no tienen pantalla propia (hoy: Legales y Desarrollos y Obras).
// Administración y Comercial tienen su propia entrada (AdministracionHub / ComercialHub).
// Las tarjetas salen de AREAS_DEFAULT (appConfig.js): la misma lista que usan los permisos
// de Empleados y ⚙️ Configuración → Áreas y paneles, así nunca quedan desparejas.
const CON_PANTALLA_GENERICA = ["legales", "desarrollos"];

export default function AreaSecciones() {
  const { proyectoId, pilarId } = useParams();
  const { empresaData, empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();
  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);

  const area = CON_PANTALLA_GENERICA.includes(pilarId) ? AREAS_DEFAULT.find(a => a.id === pilarId) : null;
  const visibles = esEmpleado
    ? areasVisiblesEmpleado(empresaData, empleadoData, proyectoId)
    : areasVisibles(empresaData);
  const areaPermitida = visibles.some(a => a.id === pilarId);
  const nivelPanel = (panelId) => (esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, pilarId, panelId) : "editar");

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
  }, [proyectoId, empresaUid, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>Cargando...</div>;

  if (!area || !areaPermitida || !areaActivaEnProyecto(proyecto, pilarId)) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyWrap}>
          <p style={{ color: "var(--text2)" }}>Esta área no está disponible.</p>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}`)}>← Volver</button>
        </div>
      </div>
    );
  }

  // Solo los paneles que usa el proyecto y que la persona tiene permitidos.
  const secciones = area.paneles.filter(p => panelActivoEnProyecto(proyecto, pilarId, p.id) && nivelPanel(p.id) !== "ninguno");

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}`)}>← Volver</button>
          <div style={styles.areaInfo}>
            <span style={{ fontSize: "26px" }}>{area.icono}</span>
            <div>
              <h1 style={styles.headerTitle}>{area.nombre}</h1>
              <p style={styles.headerSub}>{proyecto?.nombre}</p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {secciones.length === 0 ? (
          <p style={{ color: "var(--text2)", fontSize: "14px" }}>No tenés secciones habilitadas en esta área.</p>
        ) : (
          <div style={styles.grid}>
            {secciones.map(s => (
              <div
                key={s.id}
                style={styles.card}
                onClick={() => navigate(`/proyecto/${proyectoId}/${pilarId}/${s.id}`)}
                onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-4px)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
              >
                <span style={styles.cardIcono}>{s.icono}</span>
                <h3 style={styles.cardNombre}>{s.nombre}</h3>
                <p style={styles.cardDesc}>{s.desc}</p>
                {nivelPanel(s.id) === "ver" && <p style={styles.soloVer}>👁️ Solo lectura</p>}
              </div>
            ))}
          </div>
        )}
      </main>

      <PizarraFlotante contextoId={`area_${proyectoId}_${pilarId}`} titulo={`${area.nombre} · ${proyecto?.nombre || ""}`} />
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  areaInfo: { display: "flex", alignItems: "center", gap: "12px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "20px" },
  card: { borderRadius: "12px", padding: "32px 24px", cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", position: "relative", background: "var(--card)", border: "1.5px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
  cardIcono: { fontSize: "40px", display: "block", marginBottom: "16px" },
  cardNombre: { fontSize: "17px", fontWeight: "700", color: "var(--text)", margin: "0 0 8px" },
  soloVer: { fontSize: "12px", color: "var(--text2)", margin: "10px 0 0" },
  cardDesc: { fontSize: "13px", color: "var(--text2)", margin: 0, lineHeight: "1.5" },
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "80px 24px" },
  emptyCard: { maxWidth: "480px", margin: "40px auto", textAlign: "center", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "48px 32px" },
  emptyTitle: { fontSize: "20px", fontWeight: "700", color: "var(--text)", margin: "16px 0 8px" },
  emptyText: { fontSize: "14px", color: "var(--text2)", lineHeight: "1.6", margin: 0 },
};
