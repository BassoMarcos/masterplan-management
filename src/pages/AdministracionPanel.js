import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import Notificaciones from "../components/Notificaciones";
import { empleadoNivelPanel, areasVisibles, areasVisiblesEmpleado, panelActivoEnProyecto } from "../config/appConfig";
import AdministracionConfig from "./AdministracionConfig";

// Descripción de cada sección del pilar Administración.
// "contenido" es lo que va a tener cada una (hoja de ruta), no funciones que ya existan.
export const PANELES_ADMINISTRACION = {
  configuracion: {
    icono: "⚙️",
    nombre: "Configuración",
    desc: "Financiación, mora, transferencias y cajas especiales de este proyecto",
    contenido: [],
  },
  gerencia: {
    icono: "📈",
    nombre: "Gerencia",
    desc: "Control en vivo de lo que hacen Administración y Cobranzas",
    contenido: [
      "Seguimiento en vivo de cobros y cajas",
      "Resumen de mora y cierres",
      "Herramientas propias del gerente (se definen junto con el gerente)",
    ],
  },
  administracion: {
    icono: "🗂️",
    nombre: "Administración",
    desc: "Clientes, cuotas, mora, cajas, cierres e ICC",
    contenido: [
      "Clientes y lotes",
      "Cuotas, cobros y adelantos",
      "Mora y reclamos a clientes",
      "Cajas y cierre del mes",
      "Ajuste por ICC",
      "Respaldos y control de totales",
    ],
  },
  cobranzas: {
    icono: "💵",
    nombre: "Cobranzas",
    desc: "Buscar el cliente y cobrar las cuotas",
    contenido: [
      "Buscar cliente por lote o titular",
      "Ver la cuota y cobrar (efectivo o transferencia)",
      "Adelantar cuotas",
      "Cobrar cuotas en mora",
      "Cargar teléfono y observaciones",
      "Anular un cobro del mes en curso",
    ],
  },
};

// Portada de una sección de Administración (en construcción), o la pantalla de Configuración.
export default function AdministracionPanel() {
  const { proyectoId, panelId } = useParams();
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

  const info = PANELES_ADMINISTRACION[panelId];
  const visibles = esEmpleado
    ? areasVisiblesEmpleado(empresaData, empleadoData, proyectoId)
    : areasVisibles(empresaData);
  const areaPermitida = visibles.some(a => a.id === "administracion");
  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "administracion", panelId) : "editar";

  if (!info || !areaPermitida || nivel === "ninguno" || !panelActivoEnProyecto(proyecto, "administracion", panelId)) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyWrap}>
          <p style={{ color: "var(--text2)" }}>Esta sección no está disponible.</p>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/administracion`)}>← Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/administracion`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>{info.icono} {info.nombre}</h1>
            <p style={styles.headerSub}>{proyecto?.nombre} · Administración{nivel === "ver" && " · 👁️ Solo lectura"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Notificaciones />
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={panelId === "configuracion" ? styles.mainAncho : styles.main}>
        {panelId === "configuracion" ? (
          <AdministracionConfig
            proyecto={proyecto}
            puedeEditar={nivel === "editar"}
            onGuardado={cfg => setProyecto(p => ({ ...p, adminConfig: cfg }))}
          />
        ) : (
        <div style={styles.card}>
          <span style={{ fontSize: "44px" }}>🚧</span>
          <h2 style={styles.cardTitulo}>En construcción</h2>
          <p style={styles.cardTexto}>{info.desc}.</p>
          <div style={styles.listaBox}>
            <div style={styles.listaTitulo}>Lo que va a tener</div>
            <ul style={styles.lista}>
              {info.contenido.map(item => <li key={item} style={styles.item}>{item}</li>)}
            </ul>
          </div>
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
  main: { maxWidth: "560px", margin: "0 auto", padding: "40px 24px" },
  mainAncho: { maxWidth: "860px", margin: "0 auto", padding: "32px 24px 60px" },
  card: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "40px 32px", textAlign: "center" },
  cardTitulo: { fontSize: "20px", fontWeight: "700", color: "var(--text)", margin: "12px 0 6px" },
  cardTexto: { fontSize: "14px", color: "var(--text2)", lineHeight: "1.6", margin: "0 0 20px" },
  listaBox: { textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px 18px" },
  listaTitulo: { fontSize: "12px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" },
  lista: { margin: 0, paddingLeft: "18px" },
  item: { fontSize: "14px", color: "var(--text)", lineHeight: "1.7" },
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "80px 24px" },
};
