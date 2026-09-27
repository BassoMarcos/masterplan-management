import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, getDocs, collection, deleteDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import PizarraFlotante from "../components/PizarraFlotante";
import EditorLotes from "../components/EditorLotes";
import { guardarConfigYLotes, mensajeErrorGuardar, estilosConfig as s } from "./AdministracionConfig";
import { loteLimpio, validarLotes } from "../config/adminConfigLogica";
import { empleadoNivelPanel, panelActivoEnProyecto } from "../config/appConfig";

// Desarrollos → Manzanas y lotes: acá se carga la lista ÚNICA de lotes del proyecto
// (proyectos/{id}/lotes). Administración (cajas), Comercial y Legales leen esta misma lista.
// Guarda solo lo que cambió y solo los campos tocados (ver diffLotes), así no pisa la caja
// que haya elegido Administración para cada lote.
//
// Antes esta sección era una tabla cargada a mano (proyectos/{id}/desarrollos_manzanas, con
// totales escritos a mano). Esos registros no se borran solos: se muestran abajo para no perder nada.
export default function DesarrollosLotes() {
  const { proyectoId } = useParams();
  const { empresaUid, esEmpleado, empleadoData, logout } = useAuth();
  const navigate = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [lotesIni, setLotesIni] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [viejos, setViejos] = useState([]);
  const [verViejos, setVerViejos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "desarrollos", "lotes") : "editar";
  const puedeEditar = nivel === "editar";

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, "proyectos", proyectoId));
        if (!snap.exists() || snap.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
        const p = { id: snap.id, ...snap.data() };
        if (!panelActivoEnProyecto(p, "desarrollos", "lotes") || nivel === "ninguno") {
          navigate(`/proyecto/${proyectoId}/desarrollos`);
          return;
        }
        const [lotesSnap, viejosSnap] = await Promise.all([
          getDocs(collection(db, "proyectos", proyectoId, "lotes")),
          getDocs(collection(db, "proyectos", proyectoId, "desarrollos_manzanas")).catch(() => null),
        ]);
        if (!vivo) return;
        const arr = lotesSnap.docs.map(d => loteLimpio(d.id, d.data()));
        setProyecto(p);
        setLotesIni(arr);
        setLotes(arr);
        setViejos(viejosSnap ? viejosSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []);
      } catch (e) {
        if (vivo) {
          setErrorCarga(e && e.code === "permission-denied"
            ? "No hay permiso para leer los lotes de este proyecto (revisar las reglas de Firebase)."
            : "No se pudieron cargar los lotes. Recargá la página.");
        }
      }
      if (vivo) setCargando(false);
    }
    cargar();
    return () => { vivo = false; };
  }, [proyectoId, empresaUid, navigate, nivel]);

  const cambio = JSON.stringify(lotes) !== JSON.stringify(lotesIni);

  // Aviso del navegador si se cierra la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!cambio) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [cambio]);

  function editarLotes(fn) {
    setOk(false);
    setError("");
    setLotes(prev => {
      const copia = prev.map(l => ({ ...l }));
      const r = fn(copia);
      return r || copia;
    });
  }

  async function guardar() {
    const err = validarLotes(lotes);
    if (err) { setError(err.mensaje); return; }
    setGuardando(true);
    setError("");
    try {
      await guardarConfigYLotes({ proyectoId, cambioCfg: false, lotesIni, lotes });
      const guardados = lotes.map(l => loteLimpio(l.id, l));
      setLotesIni(guardados);
      setLotes(guardados);
      setOk(true);
    } catch (e) {
      setError(mensajeErrorGuardar(e));
    }
    setGuardando(false);
  }

  function descartar() {
    setLotes(lotesIni);
    setError("");
    setOk(false);
  }

  function volver() {
    if (cambio && !window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) return;
    navigate(`/proyecto/${proyectoId}/desarrollos`);
  }

  async function borrarViejo(v) {
    if (!window.confirm(`¿Borrar el registro viejo "${v.nombre || "sin nombre"}"? No toca los lotes de arriba.`)) return;
    try {
      await deleteDoc(doc(db, "proyectos", proyectoId, "desarrollos_manzanas", v.id));
      setViejos(prev => prev.filter(x => x.id !== v.id));
    } catch (e) {
      alert("No se pudo borrar: " + (e.message || e));
    }
  }

  if (cargando) return <div style={{ padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>Cargando...</div>;

  return (
    <div style={st.container}>
      <header style={st.header}>
        <div style={st.headerLeft}>
          <button style={st.backBtn} onClick={volver}>← Volver</button>
          <div style={st.areaInfo}>
            <span style={{ fontSize: "26px" }}>🧩</span>
            <div>
              <h1 style={st.headerTitle}>Manzanas y lotes</h1>
              <p style={st.headerSub}>{proyecto?.nombre} · Desarrollos y Obras</p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={st.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={st.main}>
        <div style={{ ...s.detalle, marginBottom: 16 }}>
          {!puedeEditar && <p style={{ ...s.nota, marginTop: 0 }}><b>Solo lectura:</b> no tenés permiso para cambiar los lotes.</p>}
          <EditorLotes lotes={lotes} editarLotes={editarLotes} dis={!puedeEditar} cargando={false} errorCarga={errorCarga} />
        </div>

        {viejos.length > 0 && (
          <div style={{ ...s.detalle, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: 14 }}>📋 Registros cargados antes a mano ({viejos.length})</b>
              <button type="button" style={s.quitar} onClick={() => setVerViejos(v => !v)}>{verViejos ? "Ocultar" : "Ver"}</button>
            </div>
            <p style={s.nota}>Antes esta sección era una tabla escrita a mano. Quedan guardados acá; cuando tengas los lotes cargados arriba, podés borrarlos.</p>
            {verViejos && viejos.map(v => (
              <div key={v.id} style={s.grupoFila}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{v.nombre || "Sin nombre"}</span>
                <span style={{ fontSize: 12.5, color: "var(--text2)" }}>
                  {[v.etapa, `${Number(v.totalLotes) || 0} lotes`, `${Number(v.vendidos) || 0} vendidos`, v.estado].filter(Boolean).join(" · ")}
                </span>
                {v.notas && <span style={{ fontSize: 12.5, color: "var(--text2)", flexBasis: "100%" }}>{v.notas}</span>}
                {puedeEditar && <button type="button" style={{ ...s.quitar, marginLeft: "auto" }} onClick={() => borrarViejo(v)}>Borrar</button>}
              </div>
            ))}
          </div>
        )}

        {puedeEditar && !errorCarga && (
          <div style={s.barra}>
            <div style={{ flex: 1, fontSize: 13 }}>
              {error && <span style={{ color: "var(--red, #dc2626)" }}>{error}</span>}
              {!error && ok && <span style={{ color: "var(--green, #16a34a)" }}>✓ Cambios guardados</span>}
              {!error && !ok && cambio && <span style={{ color: "var(--text2)" }}>Tenés cambios sin guardar</span>}
            </div>
            <button type="button" style={s.btnSec} onClick={descartar} disabled={!cambio || guardando}>Descartar</button>
            <button type="button" style={{ ...s.btnPri, opacity: (cambio && !guardando) ? 1 : 0.5 }} onClick={guardar} disabled={!cambio || guardando}>
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        )}
      </main>

      <PizarraFlotante contextoId={`desarrollos_${proyectoId}_lotes`} titulo={`Manzanas y lotes · ${proyecto?.nombre || ""}`} />
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
