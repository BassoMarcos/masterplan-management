import { useState, useEffect, useCallback, Fragment } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import Notificaciones from "../components/Notificaciones";
import LotesProyecto from "../components/LotesProyecto";
import { s, SeccionTitulo } from "../components/configUI";
import AdministracionConfig, { SECCIONES_ADMIN, mensajeErrorGuardar } from "./AdministracionConfig";
import ComercialConfigEstrategia from "./ComercialConfigEstrategia";
import ComercialConfigFiltro from "./ComercialConfigFiltro";
import { PasoDatos, PasoAreas, datosIniciales, limpiarDatos } from "./AsistenteProyecto";
import {
  areasVisibles, areaActivaEnProyecto, panelActivoEnProyecto, empleadoNivelPanel,
  estructuraInicial, validarEstructura, limpiarEstructura,
} from "../config/appConfig";

// ⚙️ CONFIGURACIÓN DEL PROYECTO — el único lugar donde se configura todo.
// Izquierda: la lista por área (Proyecto, Desarrollos, Administración, Comercial, Legales, Empresa);
// derecha: lo elegido. Ruta: /proyecto/:id/configuracion/:grupoId/:seccionId
// (los botones ⚙️ de cada área llevan directo a su parte, y "Volver" regresa a donde estabas).
//
// Cada parte guarda con su propio botón. Si hay cambios sin guardar y se pasa a otra parte,
// se pregunta antes (dentro de Administración no: es una sola configuración con un solo botón).
//
// Quién ve qué:
// - Dueño de la empresa o empleado con acceso total: todo.
// - Empleado: solo las partes de las áreas donde tiene permiso (ver = solo lectura).
//   Administración → panel "Configuración"; Comercial → Ventas (recorrido) y Filtrado (formulario);
//   Desarrollos → "Manzanas y lotes". Proyecto y Empresa: solo el dueño / acceso total.

// Lo que se va a sumar a cada área (acordado con Marcos, ESQUEMA_ADMIN_FYJ.md §13).
const LO_QUE_VIENE = {
  desarrollos: [
    "Etapas con fecha de lanzamiento y de posesión",
    "Ficha de cada lote: superficie, frente y fondo, esquina, catastro",
    "Estados del lote con su color (se sincroniza con Comercial y el plano)",
    "Plano del loteo pintado según el estado de cada lote",
    "Servicios de cada etapa (agua, luz, gas, cloacas, calles) y su avance",
    "Trámites: mensura, subdivisión, factibilidades (se sincroniza con Legales)",
    "Reglas para construir: retiros, altura máxima",
    "Agenda de proveedores, contratistas y contactos",
  ],
  comercial: [
    "Lista de precios por lote, etapa o zona (se sincroniza con Administración)",
    "Precio de contado y financiado, descuento por contado",
    "Anticipo mínimo y cuotas máximas por defecto (se completan solos al elegir el lote)",
    "Reserva: cuántos días dura, seña, si se devuelve",
    "Vendedores: comisión y cuándo se paga",
    "Qué lotes se muestran a la venta",
    "Datos que se le piden al cliente (con opción de agregar)",
    "De dónde llegan los contactos y motivos de descarte",
    "Aviso cuando un contacto pasa días sin atención",
    "Mensajes de WhatsApp para el seguimiento",
    "Meta de ventas por mes",
  ],
  legales: [
    "Datos de la desarrolladora y quiénes firman",
    "Modelos de documentos: reserva, boleto, cesión, posesión, intimación (y agregar más)",
    "Pasos hasta la escritura y qué destraba cada uno",
    "Papeles que se le piden al cliente",
    "Escribanías, cuánto cobran y quién paga",
    "Mora legal: carta documento y rescisión (se sincroniza con Administración)",
    "Firma en persona o digital",
    "Biblioteca de documentos con carpetas",
  ],
};

const item = (id, icono, nombre, resumen, extra) => ({ id, icono, nombre, resumen, ...(extra || {}) });

// Arma la lista de la izquierda según las áreas del proyecto y los permisos de la persona.
export function armarGrupos({ proyecto, empresaData, esAdminEf, nivel }) {
  const habil = areasVisibles(empresaData).map(a => a.id);
  const activa = (id) => habil.includes(id) && areaActivaEnProyecto(proyecto, id);
  const lotesEnDesarrollos = activa("desarrollos") && panelActivoEnProyecto(proyecto, "desarrollos", "lotes");
  const usaLotes = activa("administracion") || activa("comercial") || activa("desarrollos");
  const pronto = (area) => item("pronto", "🔜", "Lo que viene", "Opciones que se suman más adelante", { lista: LO_QUE_VIENE[area] });
  const grupos = [];

  if (esAdminEf) {
    const items = [
      item("datos", "📝", "Datos del proyecto", "Tipo, dirección, localidad"),
      item("areas", "🧱", "Áreas y paneles", "Qué usa este proyecto"),
    ];
    if (usaLotes && !lotesEnDesarrollos) items.push(item("lotes", "🧩", "Lotes", "La lista de lotes del proyecto"));
    grupos.push({ id: "proyecto", icono: "📁", nombre: "Proyecto", items, puedeEditar: true });
  }

  if (activa("desarrollos")) {
    const n = nivel("desarrollos", "lotes");
    const items = [];
    if (lotesEnDesarrollos && n !== "ninguno") items.push(item("lotes", "🧩", "Manzanas y lotes", "La lista de lotes del proyecto", { puedeEditar: n === "editar" }));
    if (esAdminEf) items.push(pronto("desarrollos"));
    if (items.length) grupos.push({ id: "desarrollos", icono: "🏗️", nombre: "Desarrollos y Obras", items, puedeEditar: true });
  }

  if (activa("administracion")) {
    const n = nivel("administracion", "configuracion");
    if (n !== "ninguno") {
      grupos.push({
        id: "administracion", icono: "📊", nombre: "Administración", puedeEditar: n === "editar",
        items: SECCIONES_ADMIN.map(x => item(x.id, x.icono, x.nombre, x.resumen, { subgrupo: x.grupo })),
      });
    }
  }

  if (activa("comercial")) {
    const nv = nivel("comercial", "ventas");
    const nf = nivel("comercial", "filtrado");
    const items = [];
    if (nv !== "ninguno") items.push(item("recorrido", "🛤️", "Recorrido y reserva", "Etapas, WhatsApp de firma, formulario de reserva", { puedeEditar: nv === "editar" }));
    if (nf !== "ninguno") items.push(item("filtro", "🔍", "Formulario de filtro", "Preguntas del primer llamado", { puedeEditar: nf === "editar" }));
    if (esAdminEf) items.push(pronto("comercial"));
    if (items.length) grupos.push({ id: "comercial", icono: "🤝", nombre: "Comercial", items, puedeEditar: true });
  }

  if (activa("legales") && esAdminEf) {
    grupos.push({ id: "legales", icono: "⚖️", nombre: "Legales", items: [pronto("legales")], puedeEditar: true });
  }

  if (esAdminEf) {
    grupos.push({ id: "empresa", icono: "🏢", nombre: "Empresa", puedeEditar: true, items: [item("empresa", "🏢", "Empresa y usuarios", "Datos de la empresa, empleados y permisos")] });
  }
  return grupos;
}

// Qué pieza de la derecha se usa: dentro de Administración es una sola (un solo botón de guardar).
const piezaDe = (g, i) => (g === "administracion" ? "administracion" : `${g}/${i}`);

export default function ConfiguracionProyecto() {
  const { proyectoId, grupoId, seccionId } = useParams();
  const { empresaData, empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const esAdminEf = !esEmpleado || !!empleadoData?.accesoTotal;

  const [proyecto, setProyecto] = useState(null);
  const [error, setError] = useState("");
  const [sucio, setSucio] = useState(false);
  const onSucio = useCallback(v => setSucio(!!v), []);
  // "Volver" regresa a donde estaba la persona (la entrada de un área, por ejemplo).
  const [desde] = useState(() => (location.state && location.state.desde) || `/proyecto/${proyectoId}`);

  useEffect(() => {
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
  }, [proyectoId, empresaUid, navigate]);

  const nivel = (area, panel) => (esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, area, panel) : "editar");
  const grupos = proyecto ? armarGrupos({ proyecto, empresaData, esAdminEf, nivel }) : [];
  const grupo = grupos.find(g => g.id === grupoId) || grupos[0];
  const it = grupo ? (grupo.items.find(x => x.id === seccionId) || grupo.items[0]) : null;
  const puedeEditar = it ? (it.puedeEditar !== undefined ? it.puedeEditar : grupo.puedeEditar) : false;

  // Si la dirección no coincide con lo que se muestra (ej. entró a /configuracion), se corrige.
  useEffect(() => {
    if (grupo && it && (grupo.id !== grupoId || it.id !== seccionId)) {
      navigate(`/proyecto/${proyectoId}/configuracion/${grupo.id}/${it.id}`, { replace: true, state: location.state });
    }
  }, [grupo, it, grupoId, seccionId, proyectoId, navigate, location.state]);

  function ir(g, i) {
    if (g === grupo.id && i === it.id) return;
    if (sucio && piezaDe(g, i) !== piezaDe(grupo.id, it.id) && !window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) return;
    if (piezaDe(g, i) !== piezaDe(grupo.id, it.id)) setSucio(false);
    navigate(`/proyecto/${proyectoId}/configuracion/${g}/${i}`, { replace: true, state: location.state });
  }
  function volver() {
    if (sucio && !window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) return;
    navigate(desde);
  }
  const grupoLotes = grupos.some(g => g.id === "desarrollos" && g.items.some(x => x.id === "lotes")) ? "desarrollos" : "proyecto";

  const cabecera = (
    <header style={st.header}>
      <div style={st.headerLeft}>
        <button style={st.btn} onClick={volver}>← Volver</button>
        <div>
          <h1 style={st.headerTitle}>⚙️ Configuración</h1>
          <p style={st.headerSub}>{proyecto ? proyecto.nombre : ""}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Notificaciones />
        <ThemeSelector />
        <button style={st.btn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
      </div>
    </header>
  );

  if (!proyecto) {
    return <div style={st.container}>{cabecera}<main style={st.main}><p style={s.nota}>{error || "Cargando…"}</p></main></div>;
  }
  if (!grupo) {
    return (
      <div style={st.container}>{cabecera}
        <main style={st.main}><p style={s.nota}>No tenés opciones para configurar en este proyecto.</p></main>
      </div>
    );
  }

  let cuerpo = null;
  const clave = piezaDe(grupo.id, it.id);
  if (grupo.id === "administracion") {
    cuerpo = (
      <AdministracionConfig
        key={clave}
        proyecto={proyecto}
        puedeEditar={puedeEditar}
        seccion={it.id}
        onSeccion={id => ir("administracion", id)}
        onSucio={onSucio}
        irALotes={() => ir(grupoLotes, "lotes")}
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
  } else if (it.id === "pronto") {
    cuerpo = (
      <div key={clave}>
        <SeccionTitulo icono="🔜" nombre={`${grupo.nombre}: lo que viene`} desc="Todavía no se puede configurar. Esto es lo que se va a sumar acá, en este orden aproximado." />
        <ul style={st.lista}>{it.lista.map(x => <li key={x} style={st.listaItem}>{x}</li>)}</ul>
      </div>
    );
  } else if (it.id === "empresa") {
    cuerpo = (
      <div key={clave}>
        <SeccionTitulo icono="🏢" nombre="Empresa y usuarios" desc="Esto vale para TODOS los proyectos de la empresa, por eso se maneja desde la pantalla de proyectos." />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={s.btnSec} onClick={() => { if (!sucio || window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) navigate("/proyectos", { state: { abrirAjustes: true } }); }}>⚙️ Ajustes de la empresa</button>
          <button type="button" style={s.btnSec} onClick={() => { if (!sucio || window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) navigate("/empleados"); }}>👥 Empleados y permisos</button>
        </div>
        <p style={s.nota}>Lo que viene: logo, colores, teléfono y mail de la empresa; y qué avisos le llegan a quién.</p>
      </div>
    );
  }

  return (
    <div style={st.container}>
      {cabecera}
      <main style={st.main}>
        <div style={s.layout}>
          <nav style={{ ...s.lista, flex: "0 0 250px" }}>
            {grupos.map(g => {
              const abierto = g.id === grupo.id;
              return (
                <div key={g.id}>
                  <button type="button" style={{ ...st.grupoBtn, ...(abierto ? st.grupoBtnOn : {}) }} onClick={() => ir(g.id, (g.items[0] || {}).id)}>
                    <span style={{ fontSize: 17 }}>{g.icono}</span>
                    <span style={{ flex: 1 }}>{g.nombre}</span>
                    <span style={{ color: "var(--text2)", fontSize: 12 }}>{abierto ? "▾" : "▸"}</span>
                  </button>
                  {abierto && g.items.map((x, i) => (
                    <Fragment key={x.id}>
                      {x.subgrupo && (i === 0 || g.items[i - 1].subgrupo !== x.subgrupo) && <div style={s.grupoLista}>{x.subgrupo}</div>}
                      <button type="button" onClick={() => ir(g.id, x.id)} style={{ ...s.item, width: "100%", ...(it.id === x.id ? s.itemActivo : {}) }}>
                        <span style={s.itemIcono}>{x.icono}</span>
                        <span style={{ minWidth: 0 }}>
                          <div style={s.itemNombre}>{x.nombre}</div>
                          <div style={s.itemResumen}>{x.resumen}</div>
                        </span>
                      </button>
                    </Fragment>
                  ))}
                </div>
              );
            })}
            {esAdminEf && (
              <button type="button" style={st.asistenteBtn} onClick={() => { if (!sucio || window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) navigate(`/proyecto/${proyectoId}/configurar`); }}>
                🧭 Repasar todo con el asistente
              </button>
            )}
          </nav>
          <div style={s.detalle}>
            {!puedeEditar && <div style={st.soloVer}>👁️ Solo lectura</div>}
            {cuerpo}
          </div>
        </div>
      </main>
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
  grupoBtn: { display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: "10px", padding: "10px", cursor: "pointer", color: "var(--text)", fontSize: "14px", fontWeight: "800" },
  grupoBtnOn: { color: "var(--acc2, var(--acc))" },
  asistenteBtn: { marginTop: "8px", background: "transparent", border: "1px dashed var(--border2)", borderRadius: "10px", padding: "10px", cursor: "pointer", color: "var(--text2)", fontSize: "12.5px", textAlign: "left" },
  soloVer: { display: "inline-block", fontSize: "12px", color: "var(--text2)", border: "1px solid var(--border2)", borderRadius: "20px", padding: "3px 10px", marginBottom: "12px" },
  lista: { margin: "0", paddingLeft: "20px", color: "var(--text)", fontSize: "14px", lineHeight: 1.9 },
  listaItem: {},
};
