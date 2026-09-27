import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, getDocs, collection, deleteDoc } from "firebase/firestore";
import EditorLotes from "./EditorLotes";
import { s } from "./configUI";
import { guardarConfigYLotes, mensajeErrorGuardar } from "../pages/AdministracionConfig";
import { loteLimpio, validarLotes } from "../config/adminConfigLogica";

// La lista ÚNICA de lotes del proyecto (proyectos/{id}/lotes), con su botón de guardar.
// Se usa en Desarrollos → Manzanas y lotes y en ⚙️ Configuración (misma pieza, mismo resultado).
// Guarda solo lo que cambió y solo los campos tocados (ver diffLotes), así no pisa la caja
// que haya elegido Administración para cada lote.
//
// Antes Desarrollos tenía una tabla escrita a mano (proyectos/{id}/desarrollos_manzanas, con
// totales a mano). Esos registros no se borran solos: se muestran abajo para no perder nada.
//
// onSucio(true|false): avisa si hay cambios sin guardar (para preguntar antes de salir).
export default function LotesProyecto({ proyectoId, puedeEditar, onSucio }) {
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [lotesIni, setLotesIni] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [viejos, setViejos] = useState([]);
  const [verViejos, setVerViejos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      try {
        const [lotesSnap, viejosSnap] = await Promise.all([
          getDocs(collection(db, "proyectos", proyectoId, "lotes")),
          getDocs(collection(db, "proyectos", proyectoId, "desarrollos_manzanas")).catch(() => null),
        ]);
        if (!vivo) return;
        const arr = lotesSnap.docs.map(d => loteLimpio(d.id, d.data()));
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
  }, [proyectoId]);

  const cambio = JSON.stringify(lotes) !== JSON.stringify(lotesIni);

  useEffect(() => { if (onSucio) onSucio(cambio); }, [cambio, onSucio]);

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

  async function borrarViejo(v) {
    if (!window.confirm(`¿Borrar el registro viejo "${v.nombre || "sin nombre"}"? No toca los lotes de arriba.`)) return;
    try {
      await deleteDoc(doc(db, "proyectos", proyectoId, "desarrollos_manzanas", v.id));
      setViejos(prev => prev.filter(x => x.id !== v.id));
    } catch (e) {
      alert("No se pudo borrar: " + (e.message || e));
    }
  }

  return (
    <div>
      {!puedeEditar && !cargando && <p style={{ ...s.nota, marginTop: 0, marginBottom: 12 }}><b>Solo lectura:</b> no tenés permiso para cambiar los lotes.</p>}
      <EditorLotes lotes={lotes} editarLotes={editarLotes} dis={!puedeEditar} cargando={cargando} errorCarga={errorCarga} />

      {viejos.length > 0 && (
        <div style={{ ...s.bloque, marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>📋 Registros cargados antes a mano ({viejos.length})</b>
            <button type="button" style={s.quitar} onClick={() => setVerViejos(v => !v)}>{verViejos ? "Ocultar" : "Ver"}</button>
          </div>
          <p style={s.nota}>Antes esta sección era una tabla escrita a mano. Quedan guardados acá; cuando tengas los lotes cargados arriba, podés borrarlos.</p>
          {verViejos && viejos.map(v => (
            <div key={v.id} style={{ ...s.grupoFila, marginTop: 8 }}>
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

      {puedeEditar && !errorCarga && !cargando && (
        <div style={{ ...s.barra, marginTop: 18 }}>
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
    </div>
  );
}
