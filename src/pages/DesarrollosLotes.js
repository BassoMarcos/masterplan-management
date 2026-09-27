import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import PizarraFlotante from "../components/PizarraFlotante";
import LotesProyecto from "../components/LotesProyecto";
import { s } from "../components/configUI";
import { empleadoNivelPanel, panelActivoEnProyecto } from "../config/appConfig";

// Desarrollos → Manzanas y lotes: la lista única de lotes del proyecto (ver LotesProyecto).
// La misma pieza aparece en ⚙️ Configuración del proyecto.
export default function DesarrollosLotes() {
  const { proyectoId } = useParams();
  const { empresaUid, esEmpleado, empleadoData, logout } = useAuth();
  const navigate = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [sucio, setSucio] = useState(false);
  const onSucio = useCallback(v => setSucio(v), []);

  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "desarrollos", "lotes") : "editar";

  useEffect(() => {
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, "proyectos", proyectoId));
        if (!snap.exists() || snap.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
        const p = { id: snap.id, ...snap.data() };
        if (!panelActivoEnProyecto(p, "desarrollos", "lotes") || nivel === "ninguno") {
          navigate(`/proyecto/${proyectoId}/desarrollos`);
          return;
        }
        setProyecto(p);
      } catch {
        navigate("/proyectos");
      }
    }
    cargar();
  }, [proyectoId, empresaUid, navigate, nivel]);

  function volver() {
    if (sucio && !window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) return;
    navigate(`/proyecto/${proyectoId}/desarrollos`);
  }

  if (!proyecto) return <div style={{ padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>Cargando...</div>;

  return (
    <div style={st.container}>
      <header style={st.header}>
        <div style={st.headerLeft}>
          <button style={st.backBtn} onClick={volver}>← Volver</button>
          <div style={st.areaInfo}>
            <span style={{ fontSize: "26px" }}>🧩</span>
            <div>
              <h1 style={st.headerTitle}>Manzanas y lotes</h1>
              <p style={st.headerSub}>{proyecto.nombre} · Desarrollos y Obras</p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={st.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={st.main}>
        <div style={s.detalle}>
          <LotesProyecto proyectoId={proyectoId} puedeEditar={nivel === "editar"} onSucio={onSucio} />
        </div>
      </main>

      <PizarraFlotante contextoId={`desarrollos_${proyectoId}_lotes`} titulo={`Manzanas y lotes · ${proyecto.nombre || ""}`} />
    </div>
  );
}

const st = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  areaInfo: { display: "flex", alignItems: "center", gap: "12px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" },
};
