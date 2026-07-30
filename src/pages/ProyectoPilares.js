import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";

const PILARES = [
  { id: "administracion", nombre: "Administración", icono: "📊", desc: "Cobro de cuotas, mora, balances", activo: true },
  { id: "comercial", nombre: "Comercial", icono: "🤝", desc: "Reservas, boletos, clientes", activo: false },
  { id: "legales", nombre: "Legales", icono: "⚖️", desc: "Contratos, escrituras, verificaciones", activo: false },
  { id: "desarrollos", nombre: "Desarrollos y Obras", icono: "🏗️", desc: "Etapas, lotes, avances de obra", activo: false },
];

export default function ProyectoPilares() {
  const { proyectoId } = useParams();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, "proyectos", proyectoId));
        if (snap.exists() && snap.data().empresaId === currentUser.uid) {
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
  }, [proyectoId, currentUser.uid, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>Cargando...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate("/proyectos")}>← Volver</button>
          <div style={styles.proyectoInfo}>
            {proyecto?.logo
              ? <img src={proyecto.logo} alt="" style={styles.proyectoLogo} />
              : <span style={{ fontSize: "28px" }}>{proyecto?.icono}</span>
            }
            <div>
              <h1 style={styles.headerTitle}>{proyecto?.nombre}</h1>
              <p style={styles.headerSub}>Seleccioná un área</p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>
            Salir
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.grid}>
          {PILARES.map(p => (
            <div
              key={p.id}
              style={{ ...styles.card, ...(p.activo ? styles.cardActivo : styles.cardInactivo) }}
              onClick={() => p.activo && navigate(`/proyecto/${proyectoId}/${p.id}`)}
              onMouseEnter={e => p.activo && (e.currentTarget.style.transform = "translateY(-4px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <span style={styles.cardIcono}>{p.icono}</span>
              <h3 style={styles.cardNombre}>{p.nombre}</h3>
              <p style={styles.cardDesc}>{p.desc}</p>
              {!p.activo && <span style={styles.proximamente}>Próximamente</span>}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: {
    background: "var(--nav)", color: "var(--text)", padding: "16px 32px",
    display: "flex", alignItems: "center", justifyContent: "space-between"
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: {
    background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)",
    padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px"
  },
  proyectoInfo: { display: "flex", alignItems: "center", gap: "12px" },
  proyectoLogo: { width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: {
    background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)",
    padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px"
  },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "20px" },
  card: {
    borderRadius: "12px", padding: "32px 24px", cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s", position: "relative"
  },
  cardActivo: {
    background: "var(--card)", border: "1.5px solid var(--border)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
  },
  cardInactivo: {
    background: "var(--surface)", border: "1.5px solid var(--border)",
    cursor: "default", opacity: 0.6
  },
  cardIcono: { fontSize: "40px", display: "block", marginBottom: "16px" },
  cardNombre: { fontSize: "17px", fontWeight: "700", color: "var(--text)", margin: "0 0 8px" },
  cardDesc: { fontSize: "13px", color: "var(--text2)", margin: 0, lineHeight: "1.5" },
  proximamente: {
    position: "absolute", top: "14px", right: "14px",
    background: "var(--hov)", color: "var(--text2)", fontSize: "11px",
    padding: "3px 8px", borderRadius: "20px", fontWeight: "600"
  }
};
