import { useState, useEffect, useCallback, Fragment } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import Notificaciones from "../components/Notificaciones";
import LotesProyecto from "../components/LotesProyecto";
import { CuentaEmpresa, CodigoEmpresa, DriveEmpresa } from "../components/AjustesEmpresa";
import { s, SeccionTitulo } from "../components/configUI";
import AdministracionConfig, { mensajeErrorGuardar } from "./AdministracionConfig";
import ComercialConfigEstrategia from "./ComercialConfigEstrategia";
import ComercialConfigFiltro from "./ComercialConfigFiltro";
import { PasoDatos, PasoAreas, datosIniciales, limpiarDatos } from "./AsistenteProyecto";
import { AREAS_DEFAULT, areasVisibles, empleadoNivelPanel, estructuraInicial, validarEstructura, limpiarEstructura } from "../config/appConfig";
import { armarGrupos, grupoEmpresa } from "../config/configuracionGrupos";

// ⚙️ CONFIGURACIÓN — una sola pantalla, en tres modos (siempre las mismas piezas y los mismos datos,
// así que lo que se cambia en un modo se ve igual en los otros):
//
// - "proyecto" (central): /proyecto/:id/configuracion/:grupoId/:seccionId
//     Izquierda: la lista de grupos (Proyecto, cada área del proyecto, Empresa). NO se despliega:
//     al elegir un grupo, sus opciones aparecen como PESTAÑAS arriba del recuadro de la derecha.
// - "area": /proyecto/:id/:areaId/configuracion/:seccionId  (el ⚙️ de la entrada de cada área)
//     Lo mismo pero solo esa área (sin lista a la izquierda).
// - "empresa": /configuracion/:seccionId  (⚙️ en la pantalla de proyectos)
//     Solo lo de la empresa: cuenta, código, Drive, empleados.
//
// Qué opciones hay en cada grupo y quién las ve: config/configuracionGrupos.js.
// Cada parte guarda con su botón. Si hay cambios sin guardar y se pasa a otra parte, pregunta antes
// (dentro de Administración no: es una sola configuración con un solo botón).

// Dentro de Administración todas las pestañas son una misma pieza (un solo botón de guardar).
const piezaDe = (g, i) => (g === "administracion" ? "administracion" : `${g}/${i}`);

export default function Configuracion({ modo = "proyecto", area }) {
  const params = useParams();
  const proyectoId = params.proyectoId;
  const grupoId = modo === "proyecto" ? params.grupoId : (modo === "area" ? area : "empresa");
  const seccionId = params.seccionId;
  const { empresaData, empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const esAdminEf = !esEmpleado || !!empleadoData?.accesoTotal;

  const [proyecto, setProyecto] = useState(null);
  const [error, setError] = useState("");
  const [sucio, setSucio] = useState(false);
  const onSucio = useCallback(v => setSucio(!!v), []);
  // "Volver" regresa a donde estaba la persona (la entrada de un área, por ejemplo).
  const volverPorDefecto = modo === "empresa" ? "/proyectos" : (modo === "area" ? `/proyecto/${proyectoId}/${area}` : `/proyecto/${proyectoId}`);
  const [desde] = useState(() => (location.state && location.state.desde) || volverPorDefecto);

  useEffect(() => {
    if (modo === "empresa") return undefined;
    let vivo = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "proyectos", proyectoId));
        if (!snap.exists() || snap.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
        if (vivo) setProyecto({ id: snap.id, ...snap.data() });
      } catch (e) {
        if (vivo) setError("No se pudo abrir el proyecto. Revisá tu conexión y recargá la página.");
      }
    })();
    return () => { vivo = false; };
  }, [modo, proyectoId, empresaUid, navigate]);

  const nivel = (a, panel) => (esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, a, panel) : "editar");
  let grupos = [];
  if (modo === "empresa") grupos = esAdminEf ? [grupoEmpresa()] : [];
  else if (proyecto) {
    grupos = armarGrupos({ proyecto, empresaData, esAdminEf, nivel });
    if (modo === "area") grupos = grupos.filter(g => g.id === area);
  }
  const grupo = grupos.find(g => g.id === grupoId) || grupos[0];
  const it = grupo ? (grupo.items.find(x => x.id === seccionId) || grupo.items[0]) : null;
  const puedeEditar = it ? (it.puedeEditar !== undefined ? it.puedeEditar : grupo.puedeEditar) : false;

  const rutaDe = useCallback((g, i) => {
    if (modo === "empresa") return `/configuracion/${i}`;
    if (modo === "area") return `/proyecto/${proyectoId}/${area}/configuracion/${i}`;
    return `/proyecto/${proyectoId}/configuracion/${g}/${i}`;
  }, [modo, proyectoId, area]);

  // Si la dirección no coincide con lo que se muestra (ej. entró a /configuracion a secas), se corrige.
  useEffect(() => {
    if (!grupo || !it) return;
    const bien = modo === "proyecto" ? (grupo.id === grupoId && it.id === seccionId) : it.id === seccionId;
    if (!bien) navigate(rutaDe(grupo.id, it.id), { replace: true, state: location.state });
  }, [grupo, it, grupoId, seccionId, modo, rutaDe, navigate, location.state]);

  const confirmarSalida = () => !sucio || window.confirm("Tenés cambios sin guardar. ¿Salir igual?");
  function ir(g, i) {
    if (g === grupo.id && i === it.id) return;
    const otraPieza = piezaDe(g, i) !== piezaDe(grupo.id, it.id);
    if (otraPieza && !confirmarSalida()) return;
    if (otraPieza) setSucio(false);
    navigate(rutaDe(g, i), { replace: true, state: location.state });
  }
  function salirA(ruta, state) {
    if (!confirmarSalida()) return;
    navigate(ruta, state ? { state } : undefined);
  }
  const grupoLotes = grupos.some(g => g.id === "desarrollos" && g.items.some(x => x.id === "lotes")) ? "desarrollos" : "proyecto";

  const areaInfo = modo === "area" ? AREAS_DEFAULT.find(a => a.id === area) : null;
  const titulo = modo === "empresa" ? "⚙️ Configuración de la empresa"
    : modo === "area" ? `⚙️ Configuración · ${areaInfo ? areaInfo.nombre : ""}`
    : "⚙️ Configuración";
  const subtitulo = modo === "empresa" ? (empresaData?.nombre || empleadoData?.empresaNombre || "") : (proyecto ? proyecto.nombre : "");

  const cabecera = (
    <header style={st.header}>
      <div style={st.headerLeft}>
        <button style={st.btn} onClick={() => salirA(desde)}>← Volver</button>
        <div>
          <h1 style={st.headerTitle}>{titulo}</h1>
          <p style={st.headerSub}>{subtitulo}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {modo === "area" && esAdminEf && grupo && (
          <button style={st.btn} onClick={() => salirA(`/proyecto/${proyectoId}/configuracion/${grupo.id}/${it.id}`, { desde: location.pathname })}>
            Ver toda la configuración
          </button>
        )}
        <Notificaciones />
        <ThemeSelector />
        <button style={st.btn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
      </div>
    </header>
  );

  if (modo !== "empresa" && !proyecto) {
    return <div style={st.container}>{cabecera}<main style={st.main}><p style={s.nota}>{error || "Cargando…"}</p></main></div>;
  }
  if (!grupo) {
    return (
      <div style={st.container}>{cabecera}
        <main style={st.main}>
          <p style={s.nota}>
            {modo === "empresa" ? "Solo el dueño de la empresa (o alguien con acceso total) puede cambiar esto." : "No tenés opciones para configurar acá."}
          </p>
        </main>
      </div>
    );
  }

  // ── Lo que va a la derecha según la pestaña elegida ──
  const clave = piezaDe(grupo.id, it.id);
  let cuerpo = null;
  if (grupo.id === "administracion") {
    cuerpo = (
      <AdministracionConfig
        key={clave}
        proyecto={proyecto}
        puedeEditar={puedeEditar}
        seccion={it.id}
        onSeccion={id => ir("administracion", id)}
        onSucio={onSucio}
        irALotes={() => (modo === "proyecto" ? ir(grupoLotes, "lotes") : salirA(`/proyecto/${proyectoId}/configuracion/${grupoLotes}/lotes`, { desde: location.pathname }))}
        onGuardado={cfg => setProyecto(p => ({ ...p, adminConfig: cfg }))}
      />
    );
  } else if (it.id === "lotes") {
    cuerpo = <LotesProyecto key={clave} proyectoId={proyectoId} puedeEditar={puedeEditar} onSucio={onSucio} />;
  } else if (it.id === "datos") {
    cuerpo = <CuerpoDatos key={clave} proyecto={proyecto} onSucio={onSucio} onGuardado={datos => setProyecto(p => ({ ...p, datos }))} />;
  } else if (it.id === "areas") {
    cuerpo = <CuerpoAreas key={clave} proyecto={proyecto} empresaData={empresaData} onSucio={onSucio} onGuardado={estructura => setProyecto(p => ({ ...p, estructura }))} />;
  } else if (it.id === "recorrido") {
    cuerpo = <div key={clave}><SeccionTitulo icono="🛤️" nombre="Recorrido y reserva" desc="Las etapas por las que pasa cada contacto, el mensaje de la firma y el formulario de reserva." /><ComercialConfigEstrategia embebido /></div>;
  } else if (it.id === "filtro") {
    cuerpo = <div key={clave}><SeccionTitulo icono="🔍" nombre="Formulario de filtro" desc="Las preguntas que se completan en el primer llamado a cada contacto." /><ComercialConfigFiltro embebido /></div>;
  } else if (it.id === "cuenta") {
    cuerpo = <CuentaEmpresa key={clave} />;
  } else if (it.id === "codigo") {
    cuerpo = <CodigoEmpresa key={clave} />;
  } else if (it.id === "drive") {
    cuerpo = <DriveEmpresa key={clave} />;
  } else if (it.id === "empleados") {
    cuerpo = (
      <div key={clave}>
        <SeccionTitulo icono="👥" nombre="Empleados y permisos" desc="Aprobar a quien se registra con el código, darlo de baja y elegir qué puede ver o editar en cada proyecto y área." />
        <button type="button" style={s.btnPri} onClick={() => salirA("/empleados")}>Abrir Empleados y permisos →</button>
      </div>
    );
  } else if (it.id === "pronto") {
    cuerpo = (
      <div key={clave}>
        <SeccionTitulo icono="🔜" nombre={`${grupo.nombre}: lo que viene`} desc="Todavía no se puede configurar. Esto es lo que se va a sumar acá." />
        {it.lista.length
          ? <ul style={st.lista}>{it.lista.map(x => <li key={x}>{x}</li>)}</ul>
          : <p style={s.nota}>Todavía no tiene opciones para configurar.</p>}
      </div>
    );
  }

  const recuadro = (
    <div style={{ ...s.detalle, padding: 0 }}>
      <Pestanas items={grupo.items} activo={it.id} onElegir={id => ir(grupo.id, id)} />
      <div style={{ padding: "20px 24px" }}>
        {!puedeEditar && <div style={st.soloVer}>👁️ Solo lectura</div>}
        {cuerpo}
      </div>
    </div>
  );

  return (
    <div style={st.container}>
      {cabecera}
      <main style={st.main}>
        {modo === "proyecto" ? (
          <div style={s.layout}>
            <nav style={{ ...s.lista, flex: "0 0 230px" }}>
              {grupos.map(g => (
                <button
                  key={g.id}
                  type="button"
                  data-grupo={g.id}
                  onClick={() => ir(g.id, (g.items[0] || {}).id)}
                  style={{ ...s.item, ...(g.id === grupo.id ? s.itemActivo : {}) }}
                >
                  <span style={s.itemIcono}>{g.icono}</span>
                  <span style={{ minWidth: 0 }}>
                    <div style={s.itemNombre}>{g.nombre}</div>
                    <div style={s.itemResumen}>{g.resumen}</div>
                  </span>
                </button>
              ))}
              {esAdminEf && (
                <button type="button" style={st.asistenteBtn} onClick={() => salirA(`/proyecto/${proyectoId}/configurar`)}>
                  🧭 Repasar todo con el asistente
                </button>
              )}
            </nav>
            {recuadro}
          </div>
        ) : recuadro}
      </main>
    </div>
  );
}

// Las opciones del grupo elegido, como pestañas arriba del recuadro. Si tienen "subgrupo"
// (Administración: Cuotas / Cobros / Casos / Plata), se muestra el título chico antes de cada tanda.
function Pestanas({ items, activo, onElegir }) {
  return (
    <div style={st.pestanas}>
      {items.map((x, i) => (
        <Fragment key={x.id}>
          {x.subgrupo && (i === 0 || items[i - 1].subgrupo !== x.subgrupo) && <span style={st.subgrupo}>{x.subgrupo}</span>}
          <button
            type="button"
            data-tab={x.id}
            data-nombre={x.nombre}
            title={x.resumen}
            onClick={() => onElegir(x.id)}
            style={{ ...st.pestana, ...(x.id === activo ? st.pestanaOn : {}) }}
          >
            {x.icono} {x.nombre}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

// ── Proyecto → Datos del proyecto ──
function CuerpoDatos({ proyecto, onSucio, onGuardado }) {
  const [ini, setIni] = useState(() => datosIniciales(proyecto));
  const [datos, setDatos] = useState(ini);
  const cambio = JSON.stringify(datos) !== JSON.stringify(ini);
  useEffect(() => { onSucio(cambio); }, [cambio, onSucio]);
  return (
    <div>
      <SeccionTitulo icono="📝" nombre="Datos del proyecto" desc="Los usan todas las áreas: reservas, boletos, recibos." />
      <PasoDatos datos={datos} setDatos={setDatos} />
      <BarraGuardar
        cambio={cambio}
        onDescartar={() => setDatos(ini)}
        onGuardar={async () => {
          const limpios = limpiarDatos(datos);
          await updateDoc(doc(db, "proyectos", proyecto.id), { datos: limpios });
          setIni(limpios);
          setDatos(limpios);
          onGuardado(limpios);
        }}
      />
    </div>
  );
}

// ── Proyecto → Áreas y paneles ──
function CuerpoAreas({ proyecto, empresaData, onSucio, onGuardado }) {
  const habilitadas = areasVisibles(empresaData);
  const [ini, setIni] = useState(() => estructuraInicial(proyecto, habilitadas));
  const [estructura, setEstructura] = useState(ini);
  const cambio = JSON.stringify(estructura) !== JSON.stringify(ini);
  useEffect(() => { onSucio(cambio); }, [cambio, onSucio]);
  return (
    <div>
      <SeccionTitulo icono="🧱" nombre="Áreas y paneles" desc="Qué áreas usa este proyecto y qué paneles tiene cada una. Apagar algo no borra nada: solo lo esconde." />
      <PasoAreas estructura={estructura} setEstructura={setEstructura} habilitadas={habilitadas} />
      <BarraGuardar
        cambio={cambio}
        onDescartar={() => setEstructura(ini)}
        validar={() => validarEstructura(estructura, habilitadas)}
        onGuardar={async () => {
          const limpia = limpiarEstructura(estructura, habilitadas);
          await updateDoc(doc(db, "proyectos", proyecto.id), { estructura: limpia });
          const nueva = estructuraInicial({ estructura: limpia }, habilitadas);
          setIni(nueva);
          setEstructura(nueva);
          onGuardado(limpia);
        }}
      />
    </div>
  );
}

function BarraGuardar({ cambio, onGuardar, onDescartar, validar }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  useEffect(() => { if (cambio) setOk(false); }, [cambio]);
  async function guardar() {
    const e = validar ? validar() : "";
    if (e) { setError(e); return; }
    setGuardando(true);
    setError("");
    try {
      await onGuardar();
      setOk(true);
    } catch (err) {
      setError(mensajeErrorGuardar(err));
    }
    setGuardando(false);
  }
  return (
    <div style={{ ...s.barra, marginTop: 18 }}>
      <div style={{ flex: 1, fontSize: 13 }}>
        {error && <span style={{ color: "var(--red, #dc2626)" }}>{error}</span>}
        {!error && ok && !cambio && <span style={{ color: "var(--green, #16a34a)" }}>✓ Cambios guardados</span>}
        {!error && cambio && <span style={{ color: "var(--text2)" }}>Tenés cambios sin guardar</span>}
      </div>
      <button type="button" style={s.btnSec} onClick={() => { setError(""); onDescartar(); }} disabled={!cambio || guardando}>Descartar</button>
      <button type="button" style={{ ...s.btnPri, opacity: (cambio && !guardando) ? 1 : 0.5 }} onClick={guardar} disabled={!cambio || guardando}>
        {guardando ? "Guardando..." : "Guardar cambios"}
      </button>
    </div>
  );
}

const st = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  btn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "1200px", margin: "0 auto", padding: "28px 24px 60px" },
  pestanas: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", padding: "14px 16px", borderBottom: "1.5px solid var(--border)", background: "var(--surface)", borderRadius: "14px 14px 0 0" },
  pestana: { padding: "7px 12px", borderRadius: "20px", border: "1px solid var(--border2)", background: "var(--card)", color: "var(--text2)", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" },
  pestanaOn: { background: "var(--acc)", borderColor: "var(--acc)", color: "#fff", fontWeight: 700 },
  subgrupo: { fontSize: "10.5px", fontWeight: 800, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 2px 0 8px" },
  asistenteBtn: { marginTop: "8px", background: "transparent", border: "1px dashed var(--border2)", borderRadius: "10px", padding: "10px", cursor: "pointer", color: "var(--text2)", fontSize: "12.5px", textAlign: "left" },
  soloVer: { display: "inline-block", fontSize: "12px", color: "var(--text2)", border: "1px solid var(--border2)", borderRadius: "20px", padding: "3px 10px", marginBottom: "12px" },
  lista: { margin: "0", paddingLeft: "20px", color: "var(--text)", fontSize: "14px", lineHeight: 1.9 },
};
