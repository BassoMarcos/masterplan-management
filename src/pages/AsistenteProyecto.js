import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, getDocs, collection, updateDoc, serverTimestamp } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { AREAS_DEFAULT, areasVisibles, estructuraInicial, PANELES_SIEMPRE } from "../config/appConfig";
import {
  completarConfig, validar, validarLotes, normalizar, loteLimpio, nuevoId,
  lotesDesdeEstructura, sincronizarLotes, TIPOS_INCREMENTO,
} from "../config/adminConfigLogica";
import {
  PlanCard, SeccionMora, SeccionTransferencias, SeccionDistribucion, SeccionCajas, SelectorLotes,
  Campo, guardarConfigYLotes, estilosConfig as s,
} from "./AdministracionConfig";

// Asistente de configuración de un proyecto. Se abre solo al crear un proyecto nuevo, y
// después se puede volver a abrir desde el proyecto (⚙️ Configuración del proyecto).
// Hace las preguntas paso a paso con barra de progreso y guarda todo junto al terminar:
//   - proyectos/{id}.estructura    → qué áreas y paneles usa el proyecto
//   - proyectos/{id}.adminConfig   → financiación, mora, transferencias, dueños, cajas (si usa Administración)
//   - proyectos/{id}/lotes         → los lotes que salen de la estructura del loteo
//   - proyectos/{id}.asistente     → { completo, paso, borrador } para poder pausar y retomar
// Reusa las mismas pantallas de Administración → Configuración, así se valida todo igual.

const INFO_PASOS = {
  bienvenida: { titulo: "Bienvenida" },
  areas: { titulo: "Áreas del proyecto", pregunta: "¿Qué áreas va a usar este proyecto?" },
  lotes: { titulo: "Lotes", pregunta: "¿Cómo está armado el loteo?" },
  financiacion: { titulo: "Financiación", pregunta: "¿Cómo se financian los lotes?" },
  mora: { titulo: "Mora", pregunta: "¿Hasta qué día se paga la cuota, y qué interés tiene el atraso?" },
  transferencias: { titulo: "Transferencias", pregunta: "Si el cliente paga por transferencia, ¿qué porcentaje se suma sobre el valor base?" },
  duenos: { titulo: "Dueños", pregunta: "¿El proyecto se divide entre varios dueños?" },
  cajas: { titulo: "Cajas separadas", pregunta: "¿Hay cajas separadas de la caja central?" },
  resumen: { titulo: "Resumen" },
};

// En qué sección de la validación cae cada paso.
const SECCION_DE_PASO = { financiacion: "financiacion", mora: "mora", transferencias: "transferencias", duenos: "distribucion", cajas: "cajas" };

function etapaVacia(n) {
  return { id: nuevoId(), nombre: `Etapa ${n}`, conManzanas: true, desde: "1", hasta: "", letras: "", manzanas: [] };
}
function manzanaVacia(n, modelo) {
  return { id: nuevoId(), nombre: `M${n}`, desde: modelo ? modelo.desde : "1", hasta: modelo ? modelo.hasta : "", letras: modelo ? modelo.letras : "" };
}

export default function AsistenteProyecto() {
  const { proyectoId } = useParams();
  const { empresaData, empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();
  const esAdminEfectivo = !esEmpleado || !!empleadoData?.accesoTotal;

  const [proyecto, setProyecto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [paso, setPaso] = useState("bienvenida");
  const [estructura, setEstructura] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [lotesIni, setLotesIni] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [planAbierto, setPlanAbierto] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const habilitadas = areasVisibles(empresaData);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, "proyectos", proyectoId));
        if (!snap.exists() || snap.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
        const p = { id: snap.id, ...snap.data() };
        // Se leen los lotes aunque el proyecto sea nuevo: si alguien ya cargó lotes desde
        // Configuración, el asistente tiene que verlos para no duplicarlos.
        const lotesSnap = await getDocs(collection(db, "proyectos", proyectoId, "lotes"));
        const lotesDb = lotesSnap.docs.map(d => loteLimpio(d.id, d.data()));
        if (!vivo) return;
        // Si quedó a mitad de camino, se retoma donde se dejó.
        const b = p.asistente && !p.asistente.completo ? p.asistente.borrador : null;
        setProyecto(p);
        setEstructura(b && b.estructura ? b.estructura : estructuraInicial(p, areasVisibles(empresaData)));
        setCfg(completarConfig(b && b.cfg ? b.cfg : p.adminConfig));
        setLotesIni(lotesDb);
        setLotes(b && Array.isArray(b.lotes) ? b.lotes.map(l => loteLimpio(l.id, l)) : lotesDb);
        setEtapas(b && Array.isArray(b.etapas) ? b.etapas : []);
        setPaso(b && b.paso ? b.paso : "bienvenida");
      } catch (e) {
        if (vivo) {
          setError(e && e.code === "permission-denied"
            ? "No se pudo abrir la configuración: falta permiso en las reglas de Firebase. Avisale a Mark."
            : "No se pudo abrir el proyecto. Revisá tu conexión y recargá la página.");
        }
      }
      if (vivo) setCargando(false);
    }
    cargar();
    return () => { vivo = false; };
    // Se carga una sola vez por proyecto: si cambiaran los datos de la empresa a mitad del
    // asistente, no hay que pisar lo que la persona ya respondió.
  }, [proyectoId, empresaUid, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!esAdminEfectivo) {
    return <Pantalla navigate={navigate} logout={logout} proyectoId={proyectoId}><p style={s.nota}>Solo el dueño de la empresa o alguien con acceso total puede configurar el proyecto.</p></Pantalla>;
  }
  if (cargando || !estructura || !cfg) {
    return <Pantalla navigate={navigate} logout={logout} proyectoId={proyectoId}><p style={s.nota}>{error || "Cargando…"}</p></Pantalla>;
  }

  // "Nuevo" = recién creado y todavía sin terminar el asistente (se puede pausar y retomar).
  // Los proyectos viejos o ya configurados abren el asistente para repasar y cambiar respuestas.
  const esNuevo = !!(proyecto.asistente && !proyecto.asistente.completo);
  const yaConfigurado = !esNuevo;
  const act = (id) => !!(estructura.areas[id] && estructura.areas[id].activa);
  const conAdmin = act("administracion");
  const conLotes = conAdmin || act("comercial") || act("desarrollos");
  const pasos = ["bienvenida", "areas", conLotes && "lotes", conAdmin && "financiacion", conAdmin && "mora", conAdmin && "transferencias", conAdmin && "duenos", conAdmin && "cajas", "resumen"].filter(Boolean);
  let idx = pasos.indexOf(paso);
  if (idx < 0) idx = 1;
  const pasoActual = pasos[idx];
  const pct = Math.round((idx / (pasos.length - 1)) * 100);
  const idsGuardados = new Set(lotesIni.map(l => l.id));

  function editar(fn) {
    setError("");
    setCfg(prev => {
      const copia = JSON.parse(JSON.stringify(prev));
      fn(copia);
      return copia;
    });
  }
  function editarLotes(fn) {
    setError("");
    setLotes(prev => {
      const copia = prev.map(l => ({ ...l }));
      const r = fn(copia);
      return r || copia;
    });
  }

  function validarPaso(p) {
    if (p === "areas") {
      const activas = Object.keys(estructura.areas).filter(id => estructura.areas[id].activa && habilitadas.some(a => a.id === id));
      if (!activas.length) return "Elegí al menos un área.";
      for (const id of activas) {
        const area = AREAS_DEFAULT.find(a => a.id === id);
        const elegibles = area.paneles.filter(pn => !(PANELES_SIEMPRE[id] || []).includes(pn.id));
        if (elegibles.length && !elegibles.some(pn => estructura.areas[id].paneles.includes(pn.id))) return `En ${area.nombre}, elegí al menos un panel.`;
      }
      return "";
    }
    if (p === "lotes") return lotesDesdeEstructura(etapas).error;
    if (SECCION_DE_PASO[p]) {
      const e = validar(cfg);
      if (e && e.seccion === SECCION_DE_PASO[p]) return e.mensaje;
      if (p === "financiacion" && cfg.financiacion.planes.length > 1) {
        const sinPlan = lotes.filter(l => !l.planId).length;
        if (sinPlan) return `Hay ${sinPlan} lote(s) sin financiación: elegí a qué plan va cada uno.`;
      }
    }
    return "";
  }

  // Guarda por dónde va, para poder salir y seguir después (solo mientras no esté terminado).
  async function guardarBorrador(pasoSig, lotesAct) {
    if (yaConfigurado) return;
    try {
      const borrador = JSON.parse(JSON.stringify({ estructura, cfg, etapas, lotes: lotesAct, paso: pasoSig }));
      await updateDoc(doc(db, "proyectos", proyectoId), { asistente: { completo: false, paso: pasoSig, borrador } });
    } catch (e) {
      // Sin conexión: el borrador es solo una ayuda, no frena el asistente.
    }
  }

  function siguiente() {
    const err = validarPaso(pasoActual);
    if (err) { setError(err); return; }
    let lotesAct = lotes;
    if (pasoActual === "lotes") {
      lotesAct = sincronizarLotes(lotes, idsGuardados, lotesDesdeEstructura(etapas).lotes);
      setLotes(lotesAct);
    }
    if (pasoActual === "financiacion" && cfg.financiacion.planes.length === 1) {
      const unico = cfg.financiacion.planes[0].id;
      lotesAct = lotesAct.map(l => (l.planId ? l : { ...l, planId: unico }));
      setLotes(lotesAct);
    }
    const sig = pasos[idx + 1];
    setError("");
    setPaso(sig);
    guardarBorrador(sig, lotesAct);
    window.scrollTo(0, 0);
  }

  function atras() {
    setError("");
    setPaso(pasos[idx - 1]);
    window.scrollTo(0, 0);
  }

  async function salirYSeguirDespues() {
    await guardarBorrador(pasoActual, lotes);
    navigate(`/proyecto/${proyectoId}`);
  }

  async function terminar() {
    const e = (conAdmin ? validar(cfg) : null) || validarLotes(lotes, cfg);
    if (e) { setError(e.mensaje); return; }
    setGuardando(true);
    setError("");
    try {
      const estructuraLimpia = { areas: {} };
      AREAS_DEFAULT.forEach(a => {
        const x = estructura.areas[a.id];
        const habil = habilitadas.some(h => h.id === a.id);
        estructuraLimpia.areas[a.id] = {
          activa: !!(x && x.activa && habil),
          paneles: x ? a.paneles.map(p => p.id).filter(id => x.paneles.includes(id) || (PANELES_SIEMPRE[a.id] || []).includes(id)) : [],
        };
      });
      await guardarConfigYLotes({
        proyectoId,
        limpia: conAdmin ? normalizar(cfg) : null,
        cambioCfg: conAdmin,
        lotesIni,
        lotes,
        extra: { estructura: estructuraLimpia, asistente: { completo: true, fecha: serverTimestamp() } },
      });
      navigate(`/proyecto/${proyectoId}`);
    } catch (err) {
      setError(err && err.code === "permission-denied"
        ? "No se pudo guardar: falta permiso en las reglas de Firebase. Avisale a Mark."
        : "No se pudo guardar. Revisá tu conexión e intentá de nuevo.");
    }
    setGuardando(false);
  }

  const info = INFO_PASOS[pasoActual];

  return (
    <Pantalla
      navigate={navigate}
      logout={logout}
      proyectoId={proyectoId}
      proyecto={proyecto}
      botonSalir={yaConfigurado
        ? <button style={est.headerBtn} onClick={() => navigate(`/proyecto/${proyectoId}`)}>Cancelar</button>
        : <button style={est.headerBtn} onClick={salirYSeguirDespues}>Salir y seguir después</button>}
    >
      <div style={est.progresoMeta}>
        <span>Paso {idx + 1} de {pasos.length} · {info.titulo}</span>
        <span>{pct}%</span>
      </div>
      <div style={est.barra}><div style={{ ...est.barraFill, width: `${pct}%` }} /></div>

      <div style={est.card}>
        {info.pregunta && <h2 style={est.pregunta}>{info.pregunta}</h2>}

        {pasoActual === "bienvenida" && (
          <div>
            <div style={{ fontSize: 44, marginBottom: 8 }}>{yaConfigurado ? "⚙️" : "🎉"}</div>
            <h2 style={est.pregunta}>{yaConfigurado ? `Configuración de ${proyecto.nombre}` : "¡Buenas noticias! Acabamos de crear tu proyecto nuevo"}</h2>
            <p style={est.texto}>
              {yaConfigurado
                ? "Vas a repasar todas las respuestas de la configuración. Cambiá lo que necesites y al final guardá."
                : `Felicidades. Antes de continuar, vamos a configurar todo el sistema de "${proyecto.nombre}". Son unas preguntas cortas; después podés cambiar cualquier respuesta desde la configuración.`}
            </p>
          </div>
        )}

        {pasoActual === "areas" && (
          <PasoAreas estructura={estructura} setEstructura={e => { setError(""); setEstructura(e); }} habilitadas={habilitadas} />
        )}

        {pasoActual === "lotes" && (
          <PasoLotes etapas={etapas} setEtapas={e => { setError(""); setEtapas(e); }} lotesGuardados={lotesIni} />
        )}

        {pasoActual === "financiacion" && (
          <PasoFinanciacion
            cfg={cfg}
            editar={editar}
            lotes={lotes}
            editarLotes={editarLotes}
            planAbierto={planAbierto}
            setPlanAbierto={setPlanAbierto}
          />
        )}

        {pasoActual === "mora" && <SeccionMora cfg={cfg} editar={editar} dis={false} />}
        {pasoActual === "transferencias" && <SeccionTransferencias cfg={cfg} editar={editar} dis={false} />}
        {pasoActual === "duenos" && <SeccionDistribucion cfg={cfg} editar={editar} dis={false} />}
        {pasoActual === "cajas" && (
          <SeccionCajas cfg={cfg} editar={editar} dis={false} lotes={lotes} editarLotes={editarLotes} lotesCargando={false} />
        )}

        {pasoActual === "resumen" && (
          <PasoResumen estructura={estructura} habilitadas={habilitadas} cfg={cfg} lotes={lotes} lotesIni={lotesIni} conAdmin={conAdmin} />
        )}

        {error && <p style={est.error}>{error}</p>}

        <div style={est.nav}>
          {idx > 0 ? <button type="button" style={s.btnSec} onClick={atras}>← Atrás</button> : <span />}
          {pasoActual === "resumen" ? (
            <button type="button" style={{ ...s.btnPri, opacity: guardando ? 0.6 : 1 }} onClick={terminar} disabled={guardando}>
              {guardando ? "Guardando…" : "✓ Terminar y guardar"}
            </button>
          ) : (
            <button type="button" style={s.btnPri} onClick={siguiente}>
              {pasoActual === "bienvenida" ? "Empezar →" : "Siguiente →"}
            </button>
          )}
        </div>
      </div>
    </Pantalla>
  );
}

function Pantalla({ children, navigate, logout, proyectoId, proyecto, botonSalir }) {
  return (
    <div style={est.container}>
      <header style={est.header}>
        <div style={est.headerLeft}>
          <div>
            <h1 style={est.headerTitle}>⚙️ Configuración del proyecto</h1>
            <p style={est.headerSub}>{proyecto ? proyecto.nombre : ""}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {botonSalir || <button style={est.headerBtn} onClick={() => navigate(`/proyecto/${proyectoId}`)}>← Volver</button>}
          <ThemeSelector />
          <button style={est.headerBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>
      <main style={est.main}>{children}</main>
    </div>
  );
}

function PasoAreas({ estructura, setEstructura, habilitadas }) {
  function cambiar(fn) {
    const copia = JSON.parse(JSON.stringify(estructura));
    fn(copia);
    setEstructura(copia);
  }
  return (
    <div>
      <p style={est.texto}>
        Elegí solo lo que el proyecto necesita. Por ejemplo, una empresa que solo vende puede dejar afuera Administración.
      </p>
      {AREAS_DEFAULT.map(a => {
        const habil = habilitadas.some(h => h.id === a.id);
        const x = estructura.areas[a.id] || { activa: false, paneles: a.paneles.map(p => p.id) };
        const on = habil && x.activa;
        const fijos = PANELES_SIEMPRE[a.id] || [];
        return (
          <div key={a.id} style={{ ...est.areaCard, ...(on ? est.areaOn : {}), opacity: habil ? 1 : 0.55 }}>
            <button
              type="button"
              disabled={!habil}
              onClick={() => cambiar(c => { c.areas[a.id] = { ...(c.areas[a.id] || { paneles: a.paneles.map(p => p.id) }), activa: !on }; })}
              style={est.areaTop}
            >
              <span style={{ ...est.check, ...(on ? est.checkOn : {}) }}>{on ? "✓" : ""}</span>
              <span style={{ fontSize: 22 }}>{a.icono}</span>
              <span style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{a.nombre}</div>
                <div style={{ fontSize: 12.5, color: "var(--text2)" }}>
                  {habil ? a.desc : "Tu empresa no tiene esta área habilitada (la habilita el administrador de MasterPlan)."}
                </div>
              </span>
            </button>
            {on && (
              <div style={{ marginTop: 10, paddingLeft: 36 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>¿Qué paneles?</div>
                <div style={s.chips}>
                  {a.paneles.filter(p => !fijos.includes(p.id)).map(p => {
                    const pOn = x.paneles.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => cambiar(c => {
                          const arr = c.areas[a.id].paneles;
                          const i = arr.indexOf(p.id);
                          if (i >= 0) arr.splice(i, 1); else arr.push(p.id);
                        })}
                        style={{ ...s.modoBtn, ...(pOn ? s.modoBtnOn : {}) }}
                      >
                        {pOn ? "✓ " : ""}{p.nombre}
                      </button>
                    );
                  })}
                </div>
                {fijos.length > 0 && <div style={{ ...s.nota, marginTop: 6 }}>Configuración siempre está incluida.</div>}
              </div>
            )}
          </div>
        );
      })}
      <p style={s.nota}>Si más adelante necesitás otra área (dentro de las habilitadas para tu empresa), la sumás desde ⚙️ Configuración del proyecto.</p>
    </div>
  );
}

function PasoLotes({ etapas, setEtapas, lotesGuardados }) {
  function cambiar(fn) {
    const copia = JSON.parse(JSON.stringify(etapas));
    fn(copia);
    setEtapas(copia);
  }
  function cantidadEtapas(v) {
    const n = Math.max(0, Math.min(50, parseInt(v, 10) || 0));
    cambiar(c => {
      while (c.length < n) c.push(etapaVacia(c.length + 1));
      c.length = n;
    });
  }
  function cantidadManzanas(i, v) {
    const n = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
    cambiar(c => {
      const mzs = c[i].manzanas;
      while (mzs.length < n) mzs.push(manzanaVacia(mzs.length + 1, mzs[mzs.length - 1]));
      mzs.length = n;
    });
  }
  const r = lotesDesdeEstructura(etapas);
  const nuevos = r.error ? 0 : sincronizarLotes(lotesGuardados, new Set(lotesGuardados.map(l => l.id)), r.lotes).length - lotesGuardados.length;

  return (
    <div>
      {lotesGuardados.length > 0 && (
        <p style={{ ...est.texto, background: "var(--surface)", padding: "10px 12px", borderRadius: 10 }}>
          Este proyecto ya tiene {lotesGuardados.length} lote(s) cargados. Lo que armes acá se suma a esos (los que ya existen no se repiten).
          Para corregir o borrar lotes usá Administración → Configuración → Lotes.
        </p>
      )}
      <div style={{ ...s.grid, maxWidth: 360 }}>
        <Campo label="¿Cuántas etapas tiene el loteo?">
          <input style={s.input} type="number" min="0" max="50" value={etapas.length} onChange={e => cantidadEtapas(e.target.value)} />
        </Campo>
      </div>
      {etapas.length === 0 && <p style={s.nota}>Si todavía no tenés los lotes definidos, dejá 0 y seguí: los podés cargar después.</p>}

      {etapas.map((et, i) => (
        <div key={et.id} style={{ ...s.plan, marginTop: 14 }}>
          <div style={s.grid}>
            <Campo label={`Nombre de la etapa ${i + 1}`}>
              <input style={{ ...s.input, fontWeight: 700 }} value={et.nombre} onChange={e => cambiar(c => { c[i].nombre = e.target.value; })} />
            </Campo>
            <Campo label="¿Tiene manzanas?">
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => cambiar(c => { c[i].conManzanas = true; })} style={{ ...s.modoBtn, ...(et.conManzanas ? s.modoBtnOn : {}) }}>Sí</button>
                <button type="button" onClick={() => cambiar(c => { c[i].conManzanas = false; })} style={{ ...s.modoBtn, ...(!et.conManzanas ? s.modoBtnOn : {}) }}>No, lotes directo</button>
              </div>
            </Campo>
            {et.conManzanas && (
              <Campo label="¿Cuántas manzanas?">
                <input style={s.input} type="number" min="0" max="100" value={et.manzanas.length} onChange={e => cantidadManzanas(i, e.target.value)} />
              </Campo>
            )}
          </div>

          {!et.conManzanas && (
            <div style={{ ...s.grid, marginTop: 12 }}>
              <Campo label="Del lote"><input style={s.input} type="number" min="1" value={et.desde} onChange={e => cambiar(c => { c[i].desde = e.target.value; })} /></Campo>
              <Campo label="Al lote"><input style={s.input} type="number" min="1" placeholder="Ej: 20" value={et.hasta} onChange={e => cambiar(c => { c[i].hasta = e.target.value; })} /></Campo>
              <Campo label="Letras (si están partidos)"><input style={s.input} placeholder="Ej: A, B" value={et.letras} onChange={e => cambiar(c => { c[i].letras = e.target.value; })} /></Campo>
            </div>
          )}

          {et.conManzanas && et.manzanas.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={est.filaMzTitulo}>
                <span>Manzana</span><span>Del lote</span><span>Al lote</span><span>Letras (si están partidos)</span>
              </div>
              {et.manzanas.map((m, j) => (
                <div key={m.id} style={est.filaMz}>
                  <input style={s.input} value={m.nombre} onChange={e => cambiar(c => { c[i].manzanas[j].nombre = e.target.value; })} />
                  <input style={s.input} type="number" min="1" value={m.desde} onChange={e => cambiar(c => { c[i].manzanas[j].desde = e.target.value; })} />
                  <input style={s.input} type="number" min="1" placeholder="Ej: 20" value={m.hasta} onChange={e => cambiar(c => { c[i].manzanas[j].hasta = e.target.value; })} />
                  <input style={s.input} placeholder="Ej: A, B" value={m.letras} onChange={e => cambiar(c => { c[i].manzanas[j].letras = e.target.value; })} />
                </div>
              ))}
              {et.manzanas.length > 1 && (
                <button
                  type="button"
                  style={{ ...s.linkBtn, marginLeft: 0 }}
                  onClick={() => cambiar(c => {
                    const m0 = c[i].manzanas[0];
                    c[i].manzanas.forEach(m => { m.desde = m0.desde; m.hasta = m0.hasta; m.letras = m0.letras; });
                  })}
                >
                  Copiar los lotes de {et.manzanas[0].nombre || "la primera"} a todas las manzanas
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {etapas.length > 0 && (
        <p style={{ ...s.nota, fontWeight: 600, color: r.error ? "var(--text2)" : "var(--green, #16a34a)" }}>
          {r.error ? "Completá los datos para ver cuántos lotes se crean." : `✓ Se van a crear ${nuevos} lote(s) nuevos.`}
        </p>
      )}
      <p style={s.nota}>Letras: "del 1 al 4" con "A, B" crea 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B. Para partir un lote suelto en más letras, usá Configuración → Lotes → "Desplegar en letras".</p>
    </div>
  );
}

function PasoFinanciacion({ cfg, editar, lotes, editarLotes, planAbierto, setPlanAbierto }) {
  const planes = cfg.financiacion.planes;
  const monedas = new Set(planes.map(p => p.moneda));
  const actual = monedas.has("ARS") && monedas.has("USD") ? "AMBAS" : (monedas.has("USD") ? "USD" : "ARS");

  function elegirMonedas(sel) {
    const quiere = sel === "AMBAS" ? ["ARS", "USD"] : [sel];
    const quitados = planes.filter(p => !quiere.includes(p.moneda)).map(p => p.id);
    editar(c => {
      c.financiacion.planes = c.financiacion.planes.filter(p => quiere.includes(p.moneda));
      quiere.forEach(m => {
        if (!c.financiacion.planes.some(p => p.moneda === m)) {
          c.financiacion.planes.push({
            id: nuevoId(), nombre: m === "USD" ? "Dólares" : "Pesos", moneda: m, cuotas: 60,
            incremento: { tipo: "no", cadaMeses: 3, porcentaje: 0, usdAumenta: false }, grupos: [],
          });
        }
      });
    });
    if (quitados.length) editarLotes(arr => { arr.forEach(l => { if (quitados.includes(l.planId)) l.planId = null; }); });
  }

  function agregarPlan() {
    editar(c => {
      c.financiacion.planes.push({
        id: nuevoId(), nombre: `Plan ${c.financiacion.planes.length + 1}`, moneda: "ARS", cuotas: 60,
        incremento: { tipo: "no", cadaMeses: 3, porcentaje: 0, usdAumenta: false }, grupos: [],
      });
    });
  }

  const nombrePlan = (id) => { const p = planes.find(x => x.id === id); return p ? p.nombre || "otro plan" : "otro plan"; };
  const sinPlan = lotes.filter(l => !l.planId).length;

  return (
    <div>
      <div style={est.subPregunta}>¿En qué moneda se venden los lotes?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {[["ARS", "Pesos"], ["USD", "Dólares"], ["AMBAS", "Pesos y dólares"]].map(([id, txt]) => (
          <button key={id} type="button" onClick={() => elegirMonedas(id)} style={{ ...s.modoBtn, ...(actual === id ? s.modoBtnOn : {}) }}>{txt}</button>
        ))}
      </div>

      <div style={est.subPregunta}>
        {planes.length > 1 ? "¿Cómo se financia cada uno? ¿Incrementa? ¿De qué forma y cada cuánto?" : "¿Cómo se financia? ¿Incrementa? ¿De qué forma y cada cuánto?"}
      </div>
      <p style={s.nota}>
        Opciones de incremento: {TIPOS_INCREMENTO.map(t => t.label.toLowerCase()).join(" · ")}. Con ICC, el robot busca el porcentaje y vos lo confirmás.
      </p>
      <div style={{ marginTop: 10 }}>
        {planes.map((p, i) => (
          <PlanCard key={p.id} plan={p} indice={i} totalPlanes={planes.length} editar={editar} dis={false} />
        ))}
      </div>
      <button type="button" style={s.btnSec} onClick={agregarPlan}>+ Hay otra financiación (en la misma u otra moneda)</button>

      {lotes.length > 0 && planes.length > 1 && (
        <div style={{ marginTop: 20 }}>
          <div style={est.subPregunta}>¿Qué lotes van con cada financiación?</div>
          <p style={{ ...s.nota, marginTop: 0, color: sinPlan ? "var(--red, #dc2626)" : "var(--green, #16a34a)", fontWeight: 600 }}>
            {sinPlan ? `Faltan ${sinPlan} lote(s) por asignar.` : "✓ Todos los lotes tienen su financiación."}
          </p>
          {planes.map(p => {
            const cant = lotes.filter(l => l.planId === p.id).length;
            const open = planAbierto === p.id;
            return (
              <div key={p.id} style={{ ...s.mzBloque, marginTop: 8 }}>
                <div style={s.mzTop}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nombre || "Plan sin nombre"}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text2)" }}>{cant} lote(s)</span>
                  <button type="button" style={s.linkBtn} onClick={() => setPlanAbierto(open ? null : p.id)}>{open ? "Listo" : "Elegir lotes"}</button>
                </div>
                {open && (
                  <SelectorLotes
                    lotes={lotes}
                    dis={false}
                    estado={l => (l.planId === p.id ? "on" : (l.planId ? "otro" : "off"))}
                    textoOtro={l => `usa ${nombrePlan(l.planId)}`}
                    onCambiar={(ids, marcar) => editarLotes(arr => {
                      const set = new Set(ids);
                      arr.forEach(l => { if (set.has(l.id)) l.planId = marcar ? p.id : null; });
                    })}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {lotes.length > 0 && planes.length === 1 && (
        <p style={s.nota}>Todos los lotes ({lotes.length}) van a usar esta financiación.</p>
      )}
    </div>
  );
}

function PasoResumen({ estructura, habilitadas, cfg, lotes, lotesIni, conAdmin }) {
  const areas = AREAS_DEFAULT.filter(a => habilitadas.some(h => h.id === a.id) && estructura.areas[a.id] && estructura.areas[a.id].activa);
  const nuevos = lotes.filter(l => !lotesIni.some(x => x.id === l.id)).length;
  const m = cfg.cobranza.mora;
  const incTxt = (p) => {
    const t = TIPOS_INCREMENTO.find(x => x.id === p.incremento.tipo);
    if (!t || p.incremento.tipo === "no") return "sin incremento";
    return `${t.label.toLowerCase()} cada ${p.incremento.cadaMeses} mes(es)${p.incremento.tipo === "fijo" ? ` (${p.incremento.porcentaje}%)` : ""}`;
  };
  const Fila = ({ titulo, children }) => (
    <div style={est.resFila}>
      <div style={est.resTitulo}>{titulo}</div>
      <div style={{ fontSize: 14, color: "var(--text)" }}>{children}</div>
    </div>
  );
  return (
    <div>
      <p style={est.texto}>Revisá que esté todo bien. Cualquier cosa la podés cambiar después.</p>
      <Fila titulo="Áreas">
        {areas.length ? areas.map(a => {
          const fijos = PANELES_SIEMPRE[a.id] || [];
          const pans = a.paneles.filter(p => !fijos.includes(p.id) && estructura.areas[a.id].paneles.includes(p.id)).map(p => p.nombre);
          return <div key={a.id}>{a.icono} {a.nombre}{pans.length ? `: ${pans.join(", ")}` : ""}</div>;
        }) : "—"}
      </Fila>
      <Fila titulo="Lotes">{lotes.length} lote(s){nuevos ? ` (${nuevos} nuevos)` : ""}</Fila>
      {conAdmin && (
        <>
          <Fila titulo="Financiación">
            {cfg.financiacion.planes.map(p => (
              <div key={p.id}>
                {p.nombre}: {p.moneda === "USD" ? "dólares" : "pesos"}, {p.cuotas} cuotas, {incTxt(p)}
                {lotes.length ? ` · ${lotes.filter(l => l.planId === p.id).length} lote(s)` : ""}
              </div>
            ))}
          </Fila>
          <Fila titulo="Mora">{m.activa ? `se paga hasta el día ${m.ultimoDia}; después ${m.porcentajeDia}% por día de atraso` : "sin interés por atraso"}</Fila>
          <Fila titulo="Transferencias">{Number(cfg.cobranza.transferencia.impuestoPct) > 0 ? `recargo de ${cfg.cobranza.transferencia.impuestoPct}%` : "sin recargo"}</Fila>
          <Fila titulo="Dueños">{cfg.duenos.map(d => `${d.nombre} ${d.porcentaje}%`).join(" · ")}</Fila>
          <Fila titulo="Cajas separadas">
            {cfg.cajasEspeciales.length
              ? cfg.cajasEspeciales.map(c => <div key={c.id}>{c.nombre}: {lotes.filter(l => l.cajaId === c.id).length} lote(s)</div>)
              : "ninguna (todo va a la caja central)"}
          </Fila>
        </>
      )}
    </div>
  );
}

const est = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  headerBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "860px", margin: "0 auto", padding: "28px 24px 60px" },
  progresoMeta: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6 },
  barra: { height: 10, borderRadius: 99, background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 18 },
  barraFill: { height: "100%", background: "var(--acc)", transition: "width .3s" },
  card: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 16, padding: "26px 28px" },
  pregunta: { margin: "0 0 10px", fontSize: 19, fontWeight: 700, color: "var(--text)" },
  subPregunta: { fontSize: 14.5, fontWeight: 700, color: "var(--text)", margin: "6px 0 8px" },
  texto: { fontSize: 14, color: "var(--text2)", lineHeight: 1.6, margin: "0 0 14px" },
  error: { marginTop: 16, color: "var(--red, #dc2626)", fontSize: 13.5, fontWeight: 600 },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, gap: 10 },
  areaCard: { border: "1.5px solid var(--border)", borderRadius: 14, padding: "12px 14px", marginBottom: 10 },
  areaOn: { borderColor: "var(--acc)" },
  areaTop: { display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", width: "100%" },
  check: { width: 22, height: 22, borderRadius: 6, border: "2px solid var(--border2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", flexShrink: 0 },
  checkOn: { background: "var(--acc)", borderColor: "var(--acc)" },
  filaMzTitulo: { display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 1.2fr", gap: 8, fontSize: 12, color: "var(--text2)", marginBottom: 4 },
  filaMz: { display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 1.2fr", gap: 8, marginBottom: 6 },
  resFila: { display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" },
  resTitulo: { fontSize: 13, fontWeight: 700, color: "var(--text2)" },
};
