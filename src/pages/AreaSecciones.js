import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import PizarraFlotante from "../components/PizarraFlotante";

// Definición de cada área y sus secciones
const AREAS = {
  administracion: {
    nombre: "Administración", icono: "📊",
    vacia: true, // se integrará con FJ App
    secciones: [],
  },
  comercial: {
    nombre: "Comercial", icono: "🤝",
    secciones: [
      { id: "reservas", nombre: "Reservas", icono: "📝", desc: "Señas y reservas de lotes" },
      { id: "boletos", nombre: "Boletos de compraventa", icono: "📄", desc: "Boletos firmados" },
      { id: "interesados", nombre: "Clientes / interesados", icono: "👥", desc: "Base de contactos y seguimiento" },
      { id: "disponibles", nombre: "Lotes disponibles", icono: "🗺️", desc: "Stock a la venta" },
      { id: "vendedores", nombre: "Vendedores y comisiones", icono: "💼", desc: "Equipo comercial y comisiones" },
    ],
  },
  legales: {
    nombre: "Legales", icono: "⚖️",
    secciones: [
      { id: "contratos", nombre: "Contratos", icono: "📑", desc: "Contratos y adendas" },
      { id: "escrituras", nombre: "Escrituras", icono: "🖋️", desc: "Escrituración de lotes" },
      { id: "documentacion", nombre: "Documentación de clientes", icono: "🗂️", desc: "Documentos por cliente" },
      { id: "verificaciones", nombre: "Verificaciones", icono: "✅", desc: "Chequeos y validaciones" },
      { id: "estados", nombre: "Estados legales de lotes", icono: "🏷️", desc: "Situación legal de cada lote" },
    ],
  },
  desarrollos: {
    nombre: "Desarrollos y Obras", icono: "🏗️",
    secciones: [
      { id: "etapas", nombre: "Etapas", icono: "📐", desc: "Etapas del desarrollo" },
      { id: "lotes", nombre: "Manzanas y lotes", icono: "🧩", desc: "Estructura de manzanas y lotes" },
      { id: "avance", nombre: "Avance de obra", icono: "🚧", desc: "Progreso de la obra" },
      { id: "infraestructura", nombre: "Infraestructura", icono: "🔌", desc: "Agua, luz, calles" },
      { id: "agrimensura", nombre: "Agrimensura", icono: "📏", desc: "Mensuras y planos" },
    ],
  },
};

export default function AreaSecciones() {
  const { proyectoId, pilarId } = useParams();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);

  const area = AREAS[pilarId];

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

  if (!area) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyWrap}>
          <p style={{ color: "var(--text2)" }}>Área no encontrada.</p>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}`)}>← Volver</button>
        </div>
      </div>
    );
  }

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
        {area.vacia ? (
          <div style={styles.emptyCard}>
            <span style={{ fontSize: "48px" }}>🔧</span>
            <h2 style={styles.emptyTitle}>Área en preparación</h2>
            <p style={styles.emptyText}>
              Acá se va a integrar el sistema de administración (FJ App): planes de pago, cobros, mora, cajas, cierres e ICC.
            </p>
          </div>
        ) : (
          <div style={styles.grid}>
            {area.secciones.map(s => (
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
  cardDesc: { fontSize: "13px", color: "var(--text2)", margin: 0, lineHeight: "1.5" },
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "80px 24px" },
  emptyCard: { maxWidth: "480px", margin: "40px auto", textAlign: "center", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "48px 32px" },
  emptyTitle: { fontSize: "20px", fontWeight: "700", color: "var(--text)", margin: "16px 0 8px" },
  emptyText: { fontSize: "14px", color: "var(--text2)", lineHeight: "1.6", margin: 0 },
};
