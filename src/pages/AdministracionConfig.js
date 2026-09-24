import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, collection, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";

// Configuración de la parte administrativa de un proyecto.
// Cada empresa/proyecto define SUS reglas (financiación, mora, transferencias, cajas especiales).
// Se guarda en proyectos/{id}.adminConfig. Todavía no mueve plata: es la base sobre la que
// después se arman clientes, cobros, cajas y cierres.
//
// Layout: lista de secciones a la izquierda, el detalle de la sección elegida a la derecha
// (como los Ajustes de cualquier app grande) — para no mezclar todo en una sola pantalla larga.
//
// Financiación NO es una sola configuración: un proyecto puede tener varios "planes"
// (ej. lotes en dólares sin incremento + lotes en pesos con ICC). Qué lote usa qué plan
// se define en la sección Lotes.
//
// Lotes: inventario del proyecto, un documento por lote en proyectos/{id}/lotes
// ({etapa, manzana, numero, planId, cajaId}). Es la lista única de lotes del proyecto:
// más adelante Comercial, Legales y Desarrollos van a usar esta misma colección.
// Los cambios de lotes se guardan junto con la configuración (mismo botón, misma tanda).

export const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const COLORES = ["#639922", "#D4537E", "#378ADD", "#BA7517", "#7F77DD", "#1D9E75", "#D85A30", "#888780"];

const TIPOS_INCREMENTO = [
  { id: "no", label: "Sin incremento", ayuda: "La cuota no cambia durante todo el plan." },
  { id: "icc", label: "Índice ICC (automático)", ayuda: "El robot busca el porcentaje del INDEC y lo propone. Lo confirmás antes de aplicar." },
  { id: "fijo", label: "Porcentaje fijo", ayuda: "En cada aumento se aplica siempre el mismo porcentaje." },
  { id: "manual", label: "Manual", ayuda: "Cada aumento lo cargás a mano, con el porcentaje que quieras." },
];

// Las secciones que aparecen en la lista de la izquierda.
const SECCIONES = [
  { id: "financiacion", icono: "💳", nombre: "Financiación", resumen: "Planes: moneda, cuotas e incremento" },
  { id: "mora", icono: "⚠️", nombre: "Mora", resumen: "Interés por atraso" },
  { id: "transferencias", icono: "🏦", nombre: "Transferencias", resumen: "Impuesto sobre transferencias" },
  { id: "distribucion", icono: "📊", nombre: "Distribución de ganancias", resumen: "Cómo se reparte la caja" },
  { id: "cajas", icono: "🗃️", nombre: "Cajas especiales", resumen: "Agrimensores, escribanos y otras" },
  { id: "lotes", icono: "🧩", nombre: "Lotes", resumen: "Etapas, manzanas y plan de cada lote" },
];

const PLAN_DEFAULT = {
  nombre: "Plan general",
  moneda: "ARS",
  cuotas: 60,
  incremento: { tipo: "no", cadaMeses: 3, porcentaje: 0, usdAumenta: false },
  grupos: [],
};

// Valores iniciales neutros: la empresa decide todo. (Los de F&J se cargan cuando llegue ese momento.)
export const CONFIG_ADMIN_DEFAULT = {
  financiacion: { planes: [PLAN_DEFAULT] },
  cobranza: {
    mora: { activa: false, porcentajeDia: 0, desdeDia: 11 },
    transferencia: { impuestoPct: 0 },
    reparto: { parteA: 100, nombreA: "Parte A", nombreB: "Parte B" },
  },
  cajasEspeciales: [],
};

function nuevoId() {
  return Math.random().toString(36).slice(2, 9);
}

// Completa un plan guardado (o parcial) con los valores por defecto, y le asegura un id.
function completarPlan(guardado) {
  const p = guardado || {};
  return {
    id: p.id || nuevoId(),
    nombre: p.nombre !== undefined ? p.nombre : PLAN_DEFAULT.nombre,
    moneda: p.moneda || PLAN_DEFAULT.moneda,
    cuotas: p.cuotas !== undefined ? p.cuotas : PLAN_DEFAULT.cuotas,
    incremento: { ...PLAN_DEFAULT.incremento, ...(p.incremento || {}) },
    grupos: Array.isArray(p.grupos) ? p.grupos : [],
  };
}

// Mezcla lo guardado con los valores iniciales, así un campo nuevo nunca rompe una config vieja.
export function completarConfig(guardada) {
  const g = guardada || {};
  const d = CONFIG_ADMIN_DEFAULT;
  const fg = g.financiacion || {};
  // Compatibilidad: una config vieja (antes de los "planes") tenía moneda/cuotas/incremento
  // directamente en financiacion, como un único plan.
  let planesGuardados;
  if (Array.isArray(fg.planes)) planesGuardados = fg.planes;
  else if (fg.moneda || fg.cuotas || fg.incremento) planesGuardados = [fg];
  else planesGuardados = null;
  const planes = (planesGuardados && planesGuardados.length ? planesGuardados : [{}]).map(completarPlan);

  return {
    financiacion: { planes },
    cobranza: {
      mora: { ...d.cobranza.mora, ...((g.cobranza || {}).mora || {}) },
      transferencia: { ...d.cobranza.transferencia, ...((g.cobranza || {}).transferencia || {}) },
      reparto: { ...d.cobranza.reparto, ...((g.cobranza || {}).reparto || {}) },
    },
    cajasEspeciales: Array.isArray(g.cajasEspeciales) ? g.cajasEspeciales : [],
  };
}

function num(v) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Devuelve {mensaje, seccion} del primer error encontrado (o null si está todo bien).
function validar(cfg) {
  const planes = cfg.financiacion.planes;
  const varios = planes.length > 1;
  const pref = (p) => (varios ? `En el plan "${p.nombre || "sin nombre"}": ` : "");
  for (const p of planes) {
    if (!String(p.nombre || "").trim()) return { mensaje: "Todos los planes de financiación necesitan un nombre.", seccion: "financiacion" };
    if (!(Number.isInteger(num(p.cuotas)) && num(p.cuotas) >= 1 && num(p.cuotas) <= 600)) return { mensaje: pref(p) + "la cantidad de cuotas tiene que ser un número entero entre 1 y 600.", seccion: "financiacion" };
    const inc = p.incremento;
    if (inc.tipo !== "no") {
      if (!(Number.isInteger(num(inc.cadaMeses)) && num(inc.cadaMeses) >= 1 && num(inc.cadaMeses) <= 60)) return { mensaje: pref(p) + "\"Aumenta cada\" tiene que ser un número de meses entre 1 y 60.", seccion: "financiacion" };
    }
    if (inc.tipo === "fijo") {
      if (!(num(inc.porcentaje) > 0 && num(inc.porcentaje) <= 100)) return { mensaje: pref(p) + "el porcentaje por aumento tiene que ser mayor que 0 y no pasar de 100.", seccion: "financiacion" };
    }
    if (inc.tipo === "icc" || inc.tipo === "fijo") {
      for (const g of p.grupos) {
        if (!String(g.nombre || "").trim()) return { mensaje: pref(p) + "todos los grupos de aumento necesitan un nombre.", seccion: "financiacion" };
        if (!Array.isArray(g.meses) || g.meses.length === 0) return { mensaje: pref(p) + `el grupo "${g.nombre}" necesita al menos un mes.`, seccion: "financiacion" };
      }
    }
  }
  const m = cfg.cobranza.mora;
  if (m.activa) {
    if (!(num(m.porcentajeDia) > 0 && num(m.porcentajeDia) <= 100)) return { mensaje: "El porcentaje de mora por día tiene que ser mayor que 0 y no pasar de 100.", seccion: "mora" };
    if (!(Number.isInteger(num(m.desdeDia)) && num(m.desdeDia) >= 1 && num(m.desdeDia) <= 31)) return { mensaje: "El día desde el que corre la mora tiene que estar entre 1 y 31.", seccion: "mora" };
  }
  const t = num(cfg.cobranza.transferencia.impuestoPct);
  if (!(t >= 0 && t <= 100)) return { mensaje: "El impuesto de transferencias tiene que estar entre 0 y 100.", seccion: "transferencias" };
  const a = num(cfg.cobranza.reparto.parteA);
  if (!(a >= 0 && a <= 100)) return { mensaje: "La parte A del reparto tiene que estar entre 0 y 100.", seccion: "distribucion" };
  for (const c of cfg.cajasEspeciales) {
    if (!String(c.nombre || "").trim()) return { mensaje: "Todas las cajas especiales necesitan un nombre.", seccion: "cajas" };
  }
  return null;
}

// ── Lotes ─────────────────────────────────────────────────────

// Forma única de un lote (la misma al leer de la base, al comparar y al guardar).
function loteLimpio(id, d) {
  return {
    id,
    etapa: String(d.etapa || "").trim(),
    manzana: String(d.manzana || "").trim(),
    numero: String(d.numero || "").trim(),
    planId: d.planId || null,
    cajaId: d.cajaId || null,
  };
}

function nuevoIdLote() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Dos lotes con la misma etapa + manzana + número son el mismo lote.
function claveLote(l) {
  return [l.etapa, l.manzana, l.numero].map(x => String(x || "").trim().toLowerCase()).join("|");
}

function etiquetaLote(l) {
  return `${l.etapa}${l.manzana ? " · " + l.manzana : ""} · Lote ${l.numero}`;
}

// Orden "humano": 2 antes que 10, y 4A antes que 4B.
function cmpNatural(a, b) {
  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

function validarLotes(lotes, cfg) {
  const planIds = new Set(cfg.financiacion.planes.map(p => p.id));
  const cajaIds = new Set(cfg.cajasEspeciales.map(c => c.id));
  const vistos = new Set();
  let planPerdido = 0;
  let cajaPerdida = 0;
  for (const l of lotes) {
    if (!String(l.etapa || "").trim() || !String(l.numero || "").trim()) return { mensaje: "Todos los lotes necesitan etapa y número.", seccion: "lotes" };
    const k = claveLote(l);
    if (vistos.has(k)) return { mensaje: `El lote ${etiquetaLote(l)} está repetido.`, seccion: "lotes" };
    vistos.add(k);
    if (l.planId && !planIds.has(l.planId)) planPerdido++;
    if (l.cajaId && !cajaIds.has(l.cajaId)) cajaPerdida++;
  }
  if (planPerdido) return { mensaje: `Hay ${planPerdido} lote(s) asignados a un plan de financiación que quitaste. Asignales otro plan antes de guardar.`, seccion: "lotes" };
  if (cajaPerdida) return { mensaje: `Hay ${cajaPerdida} lote(s) en una caja especial que quitaste. Pasalos a otra caja antes de guardar.`, seccion: "lotes" };
  return null;
}

// Qué hay que escribir en la base: lotes nuevos o cambiados ("set") y lotes borrados ("del").
function diffLotes(ini, act) {
  const previos = new Map(ini.map(l => [l.id, loteLimpio(l.id, l)]));
  const siguen = new Set(act.map(l => l.id));
  const ops = [];
  act.forEach(l => {
    const nuevo = loteLimpio(l.id, l);
    const antes = previos.get(l.id);
    if (!antes || JSON.stringify(antes) !== JSON.stringify(nuevo)) {
      ops.push({ tipo: "set", id: l.id, data: { etapa: nuevo.etapa, manzana: nuevo.manzana, numero: nuevo.numero, planId: nuevo.planId, cajaId: nuevo.cajaId } });
    }
  });
  ini.forEach(l => { if (!siguen.has(l.id)) ops.push({ tipo: "del", id: l.id }); });
  return ops;
}

// Deja los números como números (los inputs los manejan como texto).
function normalizar(cfg) {
  return {
    financiacion: {
      planes: cfg.financiacion.planes.map(p => ({
        id: p.id,
        nombre: String(p.nombre).trim(),
        moneda: p.moneda,
        cuotas: num(p.cuotas),
        incremento: {
          tipo: p.incremento.tipo,
          cadaMeses: num(p.incremento.cadaMeses),
          porcentaje: p.incremento.tipo === "fijo" ? num(p.incremento.porcentaje) : 0,
          usdAumenta: !!p.incremento.usdAumenta,
        },
        grupos: p.grupos.map(g => ({ id: g.id, nombre: String(g.nombre).trim(), color: g.color, meses: [...g.meses].sort((x, y) => x - y) })),
      })),
    },
    cobranza: {
      mora: {
        activa: !!cfg.cobranza.mora.activa,
        porcentajeDia: cfg.cobranza.mora.activa ? num(cfg.cobranza.mora.porcentajeDia) : 0,
        desdeDia: num(cfg.cobranza.mora.desdeDia),
      },
      transferencia: { impuestoPct: num(cfg.cobranza.transferencia.impuestoPct) },
      reparto: {
        parteA: num(cfg.cobranza.reparto.parteA),
        nombreA: String(cfg.cobranza.reparto.nombreA || "Parte A").trim() || "Parte A",
        nombreB: String(cfg.cobranza.reparto.nombreB || "Parte B").trim() || "Parte B",
      },
    },
    cajasEspeciales: cfg.cajasEspeciales.map(c => ({ id: c.id, nombre: String(c.nombre).trim(), nota: String(c.nota || "").trim() })),
  };
}

export default function AdministracionConfig({ proyecto, puedeEditar, onGuardado }) {
  const [inicial, setInicial] = useState(() => completarConfig(proyecto?.adminConfig));
  const [cfg, setCfg] = useState(() => completarConfig(proyecto?.adminConfig));
  const [activa, setActiva] = useState("financiacion");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lotesIni, setLotesIni] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [lotesCargando, setLotesCargando] = useState(true);
  const [lotesErrorCarga, setLotesErrorCarga] = useState("");

  const proyectoId = proyecto.id;

  useEffect(() => {
    let vivo = true;
    async function cargarLotes() {
      try {
        const snap = await getDocs(collection(db, "proyectos", proyectoId, "lotes"));
        const arr = snap.docs.map(d => loteLimpio(d.id, d.data()));
        if (vivo) { setLotesIni(arr); setLotes(arr); }
      } catch (e) {
        if (vivo) {
          setLotesErrorCarga(e && e.code === "permission-denied"
            ? "No hay permiso para leer los lotes de este proyecto (revisar las reglas de Firebase)."
            : "No se pudieron cargar los lotes. Recargá la página.");
        }
      }
      if (vivo) setLotesCargando(false);
    }
    cargarLotes();
    return () => { vivo = false; };
  }, [proyectoId]);

  const cambioCfg = JSON.stringify(cfg) !== JSON.stringify(inicial);
  const cambioLotes = JSON.stringify(lotes) !== JSON.stringify(lotesIni);
  const cambio = cambioCfg || cambioLotes;
  const dis = !puedeEditar;

  function editar(fn) {
    setOk(false);
    setError("");
    setCfg(prev => {
      const copia = JSON.parse(JSON.stringify(prev));
      fn(copia);
      return copia;
    });
  }

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
    const err = validar(cfg) || validarLotes(lotes, cfg);
    if (err) { setError(err.mensaje); setActiva(err.seccion); return; }
    setGuardando(true);
    setError("");
    try {
      const limpia = normalizar(cfg);
      const ops = diffLotes(lotesIni, lotes);
      const col = collection(db, "proyectos", proyectoId, "lotes");
      // Firestore acepta hasta 500 escrituras por tanda. Si entra todo en una, se guarda
      // todo junto (o nada); si son muchos lotes, se parte y la configuración va en la última.
      const LIM = 450;
      const tandas = [];
      for (let i = 0; i < ops.length; i += LIM) tandas.push(ops.slice(i, i + LIM));
      if (tandas.length === 0) tandas.push([]);
      for (let t = 0; t < tandas.length; t++) {
        const b = writeBatch(db);
        tandas[t].forEach(op => {
          const ref = doc(col, op.id);
          if (op.tipo === "del") b.delete(ref);
          else b.set(ref, { ...op.data, actualizado: serverTimestamp() });
        });
        if (t === tandas.length - 1 && cambioCfg) {
          b.update(doc(db, "proyectos", proyectoId), { adminConfig: limpia, adminConfigActualizado: serverTimestamp() });
        }
        await b.commit();
      }
      const completa = completarConfig(limpia);
      const lotesGuardados = lotes.map(l => loteLimpio(l.id, l));
      setInicial(completa);
      setCfg(completa);
      setLotesIni(lotesGuardados);
      setLotes(lotesGuardados);
      setOk(true);
      if (onGuardado && cambioCfg) onGuardado(limpia);
    } catch (e) {
      setError(e && e.code === "permission-denied"
        ? "No se pudo guardar: falta permiso en las reglas de Firebase. Avisale a Mark."
        : "No se pudo guardar. Revisá tu conexión e intentá de nuevo.");
    }
    setGuardando(false);
  }

  function descartar() {
    setCfg(inicial);
    setLotes(lotesIni);
    setError("");
    setOk(false);
  }

  return (
    <div style={s.wrap}>
      <div style={s.intro}>
        Acá definís cómo funciona la administración de este proyecto. Cada empresa arma sus reglas.
        {!puedeEditar && <b> Solo lectura: no tenés permiso para cambiar estas opciones.</b>}
      </div>

      <div style={s.layout}>
        <nav style={s.lista}>
          {SECCIONES.map(sec => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiva(sec.id)}
              style={{ ...s.item, ...(activa === sec.id ? s.itemActivo : {}) }}
            >
              <span style={s.itemIcono}>{sec.icono}</span>
              <span style={{ minWidth: 0 }}>
                <div style={s.itemNombre}>{sec.nombre}</div>
                <div style={s.itemResumen}>{sec.resumen}</div>
              </span>
            </button>
          ))}
        </nav>

        <div style={s.detalle}>
          {activa === "financiacion" && <SeccionFinanciacion cfg={cfg} editar={editar} dis={dis} />}
          {activa === "mora" && <SeccionMora cfg={cfg} editar={editar} dis={dis} />}
          {activa === "transferencias" && <SeccionTransferencias cfg={cfg} editar={editar} dis={dis} />}
          {activa === "distribucion" && <SeccionDistribucion cfg={cfg} editar={editar} dis={dis} />}
          {activa === "cajas" && <SeccionCajas cfg={cfg} editar={editar} dis={dis} />}
          {activa === "lotes" && (
            <SeccionLotes
              cfg={cfg}
              lotes={lotes}
              editarLotes={editarLotes}
              dis={dis}
              cargando={lotesCargando}
              errorCarga={lotesErrorCarga}
            />
          )}
        </div>
      </div>

      <p style={s.nota}>
        Todavía esta configuración no mueve plata: es la base sobre la que se van a armar clientes, cobros y cierres.
        Cómo se aplica un cambio a mitad de mes se define antes de habilitar cobros.
      </p>

      {puedeEditar && (
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
    </div>
  );
}

function SeccionFinanciacion({ cfg, editar, dis }) {
  const planes = cfg.financiacion.planes;

  function agregarPlan() {
    editar(c => {
      c.financiacion.planes.push({
        id: nuevoId(),
        nombre: `Plan ${c.financiacion.planes.length + 1}`,
        moneda: "ARS",
        cuotas: 60,
        incremento: { tipo: "no", cadaMeses: 3, porcentaje: 0, usdAumenta: false },
        grupos: [],
      });
    });
  }

  return (
    <div>
      <SeccionTitulo
        icono="💳"
        nombre="Financiación"
        desc={'Un proyecto puede tener más de una forma de financiar. Por ejemplo: la mitad de los lotes en dólares sin incremento, y la otra mitad en pesos con ICC. Armá un plan para cada caso. Qué lote usa cada plan se elige más adelante, en Lotes.'}
      />
      {planes.map((p, i) => (
        <PlanCard key={p.id} plan={p} indice={i} totalPlanes={planes.length} editar={editar} dis={dis} />
      ))}
      {!dis && <button type="button" style={s.btnSec} onClick={agregarPlan}>+ Agregar plan de financiación</button>}
    </div>
  );
}

function PlanCard({ plan, indice, totalPlanes, editar, dis }) {
  const inc = plan.incremento;
  const tipoInfo = TIPOS_INCREMENTO.find(t => t.id === inc.tipo) || TIPOS_INCREMENTO[0];
  const usaGrupos = inc.tipo === "icc" || inc.tipo === "fijo";

  function agregarGrupo() {
    editar(c => {
      const gs = c.financiacion.planes[indice].grupos;
      gs.push({ id: nuevoId(), nombre: "", color: COLORES[gs.length % COLORES.length], meses: [] });
    });
  }

  return (
    <div style={s.plan}>
      <div style={s.planTop}>
        <input
          style={{ ...s.input, ...s.planNombre }}
          disabled={dis}
          placeholder="Nombre del plan (ej. Pesos con ICC)"
          value={plan.nombre}
          onChange={e => editar(c => { c.financiacion.planes[indice].nombre = e.target.value; })}
        />
        {!dis && totalPlanes > 1 && (
          <button type="button" style={s.quitar} onClick={() => editar(c => { c.financiacion.planes.splice(indice, 1); })}>Quitar plan</button>
        )}
      </div>

      <div style={s.grid}>
        <Campo label="Moneda del plan">
          <select style={s.input} disabled={dis} value={plan.moneda} onChange={e => editar(c => { c.financiacion.planes[indice].moneda = e.target.value; })}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </Campo>
        <Campo label="Cantidad de cuotas">
          <input style={s.input} disabled={dis} type="number" min="1" value={plan.cuotas} onChange={e => editar(c => { c.financiacion.planes[indice].cuotas = e.target.value; })} />
        </Campo>
        <Campo label="Tipo de incremento">
          <select style={s.input} disabled={dis} value={inc.tipo} onChange={e => editar(c => { c.financiacion.planes[indice].incremento.tipo = e.target.value; })}>
            {TIPOS_INCREMENTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Campo>
        {inc.tipo !== "no" && (
          <Campo label="Aumenta cada (meses)">
            <input style={s.input} disabled={dis} type="number" min="1" value={inc.cadaMeses} onChange={e => editar(c => { c.financiacion.planes[indice].incremento.cadaMeses = e.target.value; })} />
          </Campo>
        )}
        {inc.tipo === "fijo" && (
          <Campo label="Porcentaje por aumento (%)">
            <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={inc.porcentaje} onChange={e => editar(c => { c.financiacion.planes[indice].incremento.porcentaje = e.target.value; })} />
          </Campo>
        )}
        {inc.tipo !== "no" && plan.moneda === "USD" && (
          <Campo label="Este plan en dólares, ¿aumenta?">
            <select style={s.input} disabled={dis} value={inc.usdAumenta ? "si" : "no"} onChange={e => editar(c => { c.financiacion.planes[indice].incremento.usdAumenta = e.target.value === "si"; })}>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Campo>
        )}
      </div>
      <p style={s.nota}>{tipoInfo.ayuda}</p>

      {usaGrupos && (
        <div style={{ marginTop: 18 }}>
          <div style={s.h3}>Grupos de aumento</div>
          <p style={s.sub}>
            Cada grupo (por ejemplo una "planilla" de un color) aumenta en los meses que marques.
            Si todos los lotes de este plan aumentan el mismo mes, alcanza con un solo grupo.
          </p>
          {plan.grupos.length === 0 && <p style={s.vacio}>Todavía no hay grupos.</p>}
          {plan.grupos.map((g, gi) => (
            <div key={g.id} style={s.grupo}>
              <div style={s.grupoTop}>
                <input
                  style={{ ...s.input, flex: 1, minWidth: 140 }}
                  disabled={dis}
                  placeholder="Nombre del grupo (ej. Verde)"
                  value={g.nombre}
                  onChange={e => editar(c => { c.financiacion.planes[indice].grupos[gi].nombre = e.target.value; })}
                />
                <div style={s.colores}>
                  {COLORES.map(col => (
                    <button
                      key={col}
                      type="button"
                      disabled={dis}
                      aria-label={`Color ${col}`}
                      onClick={() => editar(c => { c.financiacion.planes[indice].grupos[gi].color = col; })}
                      style={{ ...s.colorDot, background: col, outline: g.color === col ? "2px solid var(--text)" : "none" }}
                    />
                  ))}
                </div>
                {!dis && (
                  <button type="button" style={s.quitar} onClick={() => editar(c => { c.financiacion.planes[indice].grupos.splice(gi, 1); })}>Quitar</button>
                )}
              </div>
              <div style={s.meses}>
                {MESES_CORTO.map((mes, mi) => {
                  const on = g.meses.includes(mi + 1);
                  return (
                    <button
                      key={mes}
                      type="button"
                      disabled={dis}
                      onClick={() => editar(c => {
                        const arr = c.financiacion.planes[indice].grupos[gi].meses;
                        const pos = arr.indexOf(mi + 1);
                        if (pos >= 0) arr.splice(pos, 1); else arr.push(mi + 1);
                      })}
                      style={{ ...s.mes, ...(on ? { background: g.color, color: "#fff", borderColor: g.color } : {}) }}
                    >
                      {mes}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!dis && <button type="button" style={s.btnSec} onClick={agregarGrupo}>+ Agregar grupo</button>}
        </div>
      )}
    </div>
  );
}

function SeccionMora({ cfg, editar, dis }) {
  const m = cfg.cobranza.mora;
  return (
    <div>
      <SeccionTitulo icono="⚠️" nombre="Mora" desc="El interés por atraso lo define cada empresa: si hay, cuánto y desde qué día." />
      <div style={s.grid}>
        <Campo label="Interés por mora">
          <select style={s.input} disabled={dis} value={m.activa ? "si" : "no"} onChange={e => editar(c => { c.cobranza.mora.activa = e.target.value === "si"; })}>
            <option value="no">Sin mora</option>
            <option value="si">Activo</option>
          </select>
        </Campo>
        {m.activa && (
          <>
            <Campo label="Porcentaje por día (%)">
              <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={m.porcentajeDia} onChange={e => editar(c => { c.cobranza.mora.porcentajeDia = e.target.value; })} />
            </Campo>
            <Campo label="Empieza a correr desde el día">
              <input style={s.input} disabled={dis} type="number" min="1" max="31" value={m.desdeDia} onChange={e => editar(c => { c.cobranza.mora.desdeDia = e.target.value; })} />
            </Campo>
          </>
        )}
      </div>
      <p style={s.nota}>{m.activa ? "El interés se suma cada día de atraso, desde el día que elegiste." : "Los clientes que no pagan a tiempo no generan interés."}</p>
    </div>
  );
}

function SeccionTransferencias({ cfg, editar, dis }) {
  const t = cfg.cobranza.transferencia;
  return (
    <div>
      <SeccionTitulo icono="🏦" nombre="Transferencias" desc="El impuesto que se suma cuando el cliente paga por transferencia." />
      <div style={s.grid}>
        <Campo label="Impuesto en transferencias (%)">
          <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={t.impuestoPct} onChange={e => editar(c => { c.cobranza.transferencia.impuestoPct = e.target.value; })} />
        </Campo>
      </div>
      <p style={s.nota}>Si el impuesto es 0, las transferencias se cobran sin recargo.</p>
    </div>
  );
}

function SeccionDistribucion({ cfg, editar, dis }) {
  const r = cfg.cobranza.reparto;
  const parteA = num(r.parteA);
  const parteB = Number.isFinite(parteA) ? Math.round((100 - parteA) * 100) / 100 : "";
  return (
    <div>
      <SeccionTitulo icono="📊" nombre="Distribución de ganancias" desc="Cómo se reparte lo cobrado, entre dos partes." />
      <div style={s.grid}>
        <Campo label="Nombre de la parte A">
          <input style={s.input} disabled={dis} value={r.nombreA} onChange={e => editar(c => { c.cobranza.reparto.nombreA = e.target.value; })} />
        </Campo>
        <Campo label="Porcentaje de la parte A (%)">
          <input style={s.input} disabled={dis} type="number" min="0" max="100" step="1" value={r.parteA} onChange={e => editar(c => { c.cobranza.reparto.parteA = e.target.value; })} />
        </Campo>
        <Campo label="Nombre de la parte B">
          <input style={s.input} disabled={dis} value={r.nombreB} onChange={e => editar(c => { c.cobranza.reparto.nombreB = e.target.value; })} />
        </Campo>
        <Campo label="Porcentaje de la parte B (%)">
          <div style={{ ...s.input, background: "var(--surface)", color: "var(--text2)" }}>{parteB === "" ? "—" : parteB}</div>
        </Campo>
      </div>
      <p style={s.nota}>La parte B es lo que queda: siempre suman 100.</p>
    </div>
  );
}

function SeccionCajas({ cfg, editar, dis }) {
  function agregarCaja() {
    editar(c => { c.cajasEspeciales.push({ id: nuevoId(), nombre: "", nota: "" }); });
  }
  return (
    <div>
      <SeccionTitulo icono="🗃️" nombre="Cajas especiales" desc={'Grupos de lotes cuya plata no entra a la caja principal (por ejemplo agrimensores, escribanos o la propia empresa). Cada uno tiene su caja. Los lotes y sus dueños se asignan cuando esté lista la sección de Lotes.'} />
      {cfg.cajasEspeciales.length === 0 && <p style={s.vacio}>Todavía no hay cajas especiales.</p>}
      {cfg.cajasEspeciales.map((c, i) => (
        <div key={c.id} style={s.caja}>
          <input
            style={{ ...s.input, flex: 1, minWidth: 160 }}
            disabled={dis}
            placeholder="Nombre de la caja (ej. Agrimensores)"
            value={c.nombre}
            onChange={e => editar(x => { x.cajasEspeciales[i].nombre = e.target.value; })}
          />
          <input
            style={{ ...s.input, flex: 2, minWidth: 200 }}
            disabled={dis}
            placeholder="Nota (opcional)"
            value={c.nota}
            onChange={e => editar(x => { x.cajasEspeciales[i].nota = e.target.value; })}
          />
          {!dis && <button type="button" style={s.quitar} onClick={() => editar(x => { x.cajasEspeciales.splice(i, 1); })}>Quitar</button>}
        </div>
      ))}
      {!dis && <button type="button" style={s.btnSec} onClick={agregarCaja}>+ Nueva caja especial</button>}
    </div>
  );
}

function SeccionLotes({ cfg, lotes, editarLotes, dis, cargando, errorCarga }) {
  const planes = cfg.financiacion.planes;
  const cajas = cfg.cajasEspeciales;

  // Formulario de alta
  const [modo, setModo] = useState("rango");
  const [etapa, setEtapa] = useState("");
  const [manzana, setManzana] = useState("");
  const [desde, setDesde] = useState("1");
  const [hasta, setHasta] = useState("");
  const [numero, setNumero] = useState("");
  const [planNuevo, setPlanNuevo] = useState(planes.length === 1 ? planes[0].id : "");
  const [cajaNueva, setCajaNueva] = useState("");
  const [msgAlta, setMsgAlta] = useState("");

  // Selección, filtro y acciones sobre los seleccionados
  const [sel, setSel] = useState(() => new Set());
  const [filtro, setFiltro] = useState("todos");
  const [planAsignar, setPlanAsignar] = useState("");
  const [cajaAsignar, setCajaAsignar] = useState("");

  if (cargando) {
    return (
      <div>
        <SeccionTitulo icono="🧩" nombre="Lotes" desc="Cargando lotes…" />
      </div>
    );
  }

  const colorPlan = {};
  planes.forEach((p, i) => { colorPlan[p.id] = COLORES[i % COLORES.length]; });
  const nombrePlan = (id) => { const p = planes.find(x => x.id === id); return p ? (p.nombre || "Plan sin nombre") : "Plan que quitaste"; };
  const nombreCaja = (id) => { const c = cajas.find(x => x.id === id); return c ? (c.nombre || "Caja sin nombre") : "Caja que quitaste"; };

  const etapasExistentes = [...new Set(lotes.map(l => l.etapa).filter(Boolean))].sort(cmpNatural);
  const manzanasExistentes = [...new Set(lotes.filter(l => !etapa.trim() || l.etapa.toLowerCase() === etapa.trim().toLowerCase()).map(l => l.manzana).filter(Boolean))].sort(cmpNatural);

  function crear() {
    const et = etapa.trim();
    const mz = manzana.trim();
    if (!et) { setMsgAlta("Escribí la etapa (por ejemplo: Etapa 1)."); return; }
    let numeros = [];
    if (modo === "rango") {
      const d = Number(desde);
      const h = Number(hasta);
      if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h < d) { setMsgAlta("Revisá los números: \"del\" tiene que ser 1 o más, y \"al\" igual o mayor."); return; }
      if (h - d + 1 > 500) { setMsgAlta("Se pueden crear hasta 500 lotes por vez."); return; }
      for (let n = d; n <= h; n++) numeros.push(String(n));
    } else {
      if (!numero.trim()) { setMsgAlta("Escribí el número del lote (por ejemplo: 4B)."); return; }
      numeros = [numero.trim()];
    }
    const existentes = new Set(lotes.map(claveLote));
    const nuevos = [];
    let repetidos = 0;
    numeros.forEach(n => {
      const l = { id: nuevoIdLote(), etapa: et, manzana: mz, numero: n, planId: planNuevo || null, cajaId: cajaNueva || null };
      const k = claveLote(l);
      if (existentes.has(k)) repetidos++;
      else { nuevos.push(l); existentes.add(k); }
    });
    if (nuevos.length) editarLotes(c => c.concat(nuevos));
    const donde = `${et}${mz ? " · " + mz : ""}`;
    if (nuevos.length && repetidos) setMsgAlta(`✓ ${nuevos.length} lote(s) agregados en ${donde}. ${repetidos} ya existían y no se repitieron.`);
    else if (nuevos.length) setMsgAlta(`✓ ${nuevos.length} lote(s) agregados en ${donde}. Acordate de guardar.`);
    else setMsgAlta(`Esos lotes ya existían en ${donde}: no se agregó nada.`);
    if (modo === "uno") setNumero("");
  }

  const pasaFiltro = (l) => {
    if (filtro === "todos") return true;
    if (filtro === "sinplan") return !l.planId;
    if (filtro === "principal") return !l.cajaId;
    if (filtro.startsWith("plan:")) return l.planId === filtro.slice(5);
    if (filtro.startsWith("caja:")) return l.cajaId === filtro.slice(5);
    return true;
  };
  const visibles = lotes.filter(pasaFiltro);

  // Agrupar: etapa → manzana → lotes
  const porEtapa = new Map();
  visibles.forEach(l => {
    if (!porEtapa.has(l.etapa)) porEtapa.set(l.etapa, new Map());
    const mzs = porEtapa.get(l.etapa);
    if (!mzs.has(l.manzana)) mzs.set(l.manzana, []);
    mzs.get(l.manzana).push(l);
  });
  const etapasOrden = [...porEtapa.keys()].sort(cmpNatural);

  function toggle(id) {
    setSel(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleGrupo(ids) {
    setSel(prev => {
      const n = new Set(prev);
      const todos = ids.every(id => n.has(id));
      ids.forEach(id => { if (todos) n.delete(id); else n.add(id); });
      return n;
    });
  }
  const selIds = lotes.filter(l => sel.has(l.id)).map(l => l.id);
  const unico = selIds.length === 1 ? lotes.find(l => l.id === selIds[0]) : null;

  function aplicarPlan() {
    if (!planAsignar) return;
    const valor = planAsignar === "__ninguno" ? null : planAsignar;
    editarLotes(c => { c.forEach(l => { if (sel.has(l.id)) l.planId = valor; }); });
  }
  function aplicarCaja() {
    if (!cajaAsignar) return;
    const valor = cajaAsignar === "__principal" ? null : cajaAsignar;
    editarLotes(c => { c.forEach(l => { if (sel.has(l.id)) l.cajaId = valor; }); });
  }
  function eliminarSeleccionados() {
    if (!window.confirm(`¿Eliminar ${selIds.length} lote(s)? Se borran al guardar los cambios.`)) return;
    editarLotes(c => c.filter(l => !sel.has(l.id)));
    setSel(new Set());
  }
  function editarUnico(campo, valor) {
    editarLotes(c => { c.forEach(l => { if (l.id === unico.id) l[campo] = valor; }); });
  }

  const sinPlan = lotes.filter(l => !l.planId).length;

  return (
    <div>
      <SeccionTitulo
        icono="🧩"
        nombre="Lotes"
        desc="Todos los lotes del proyecto, por etapa y manzana. A cada lote le asignás su plan de financiación y, si corresponde, una caja especial."
      />

      {errorCarga && <p style={{ ...s.nota, color: "var(--red, #dc2626)", marginTop: 0 }}>{errorCarga}</p>}

      {!dis && !errorCarga && (
        <div style={s.bloque}>
          <div style={s.h3}>Agregar lotes</div>
          <div style={s.modoFila}>
            <button type="button" onClick={() => setModo("rango")} style={{ ...s.modoBtn, ...(modo === "rango" ? s.modoBtnOn : {}) }}>Varios (del … al …)</button>
            <button type="button" onClick={() => setModo("uno")} style={{ ...s.modoBtn, ...(modo === "uno" ? s.modoBtnOn : {}) }}>Uno suelto (ej. 4B)</button>
          </div>
          <div style={s.grid}>
            <Campo label="Etapa *">
              <input style={s.input} list="mp-etapas" placeholder="Ej: Etapa 1" value={etapa} onChange={e => setEtapa(e.target.value)} />
            </Campo>
            <Campo label="Manzana (si tiene)">
              <input style={s.input} list="mp-manzanas" placeholder="Ej: M1" value={manzana} onChange={e => setManzana(e.target.value)} />
            </Campo>
            {modo === "rango" ? (
              <>
                <Campo label="Del lote">
                  <input style={s.input} type="number" min="1" value={desde} onChange={e => setDesde(e.target.value)} />
                </Campo>
                <Campo label="Al lote">
                  <input style={s.input} type="number" min="1" placeholder="Ej: 20" value={hasta} onChange={e => setHasta(e.target.value)} />
                </Campo>
              </>
            ) : (
              <Campo label="Número de lote">
                <input style={s.input} placeholder="Ej: 4B" value={numero} onChange={e => setNumero(e.target.value)} />
              </Campo>
            )}
            <Campo label="Plan de financiación">
              <select style={s.input} value={planNuevo} onChange={e => setPlanNuevo(e.target.value)}>
                <option value="">Sin plan por ahora</option>
                {planes.map(p => <option key={p.id} value={p.id}>{p.nombre || "Plan sin nombre"}</option>)}
              </select>
            </Campo>
            <Campo label="Caja">
              <select style={s.input} value={cajaNueva} onChange={e => setCajaNueva(e.target.value)}>
                <option value="">Caja principal</option>
                {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre || "Caja sin nombre"}</option>)}
              </select>
            </Campo>
          </div>
          <datalist id="mp-etapas">{etapasExistentes.map(e => <option key={e} value={e} />)}</datalist>
          <datalist id="mp-manzanas">{manzanasExistentes.map(m => <option key={m} value={m} />)}</datalist>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" style={s.btnSec} onClick={crear}>+ Agregar</button>
            {msgAlta && <span style={{ fontSize: 13, color: "var(--text2)" }}>{msgAlta}</span>}
          </div>
        </div>
      )}

      {lotes.length > 0 && (
        <div style={s.leyenda}>
          <span style={s.resumenLotes}>{lotes.length} lote(s){sinPlan ? ` · ${sinPlan} sin plan` : ""}</span>
          {planes.map(p => (
            <span key={p.id} style={s.leyItem}>
              <span style={{ ...s.leyDot, background: colorPlan[p.id] }} />
              {p.nombre || "Plan sin nombre"} ({lotes.filter(l => l.planId === p.id).length})
            </span>
          ))}
          {sinPlan > 0 && <span style={s.leyItem}><span style={{ ...s.leyDot, background: "transparent", border: "1.5px dashed var(--text2)" }} />Sin plan ({sinPlan})</span>}
          {cajas.length > 0 && <span style={s.leyItem}><span style={s.marcaCaja}>★</span> en caja especial</span>}
        </div>
      )}

      {lotes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
          <select style={{ ...s.input, width: "auto" }} value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="todos">Mostrar todos</option>
            <option value="sinplan">Solo sin plan</option>
            {planes.map(p => <option key={p.id} value={"plan:" + p.id}>Plan: {p.nombre || "sin nombre"}</option>)}
            <option value="principal">Caja principal</option>
            {cajas.map(c => <option key={c.id} value={"caja:" + c.id}>Caja: {c.nombre || "sin nombre"}</option>)}
          </select>
          {!dis && visibles.length > 0 && (
            <button type="button" style={s.quitar} onClick={() => toggleGrupo(visibles.map(l => l.id))}>Seleccionar / quitar todos los que se ven</button>
          )}
        </div>
      )}

      {!dis && selIds.length > 0 && (
        <div style={s.barraSel}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>{selIds.length} seleccionado(s)</b>
            <button type="button" style={s.quitar} onClick={() => setSel(new Set())}>Quitar selección</button>
            <button type="button" style={{ ...s.quitar, color: "var(--red, #dc2626)" }} onClick={eliminarSeleccionados}>Eliminar</button>
          </div>
          <div style={s.selAcciones}>
            <select style={{ ...s.input, width: "auto" }} value={planAsignar} onChange={e => setPlanAsignar(e.target.value)}>
              <option value="">Asignar plan…</option>
              {planes.map(p => <option key={p.id} value={p.id}>{p.nombre || "Plan sin nombre"}</option>)}
              <option value="__ninguno">Sin plan</option>
            </select>
            <button type="button" style={s.btnSec} onClick={aplicarPlan} disabled={!planAsignar}>Aplicar</button>
            <select style={{ ...s.input, width: "auto" }} value={cajaAsignar} onChange={e => setCajaAsignar(e.target.value)}>
              <option value="">Pasar a caja…</option>
              <option value="__principal">Caja principal</option>
              {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre || "Caja sin nombre"}</option>)}
            </select>
            <button type="button" style={s.btnSec} onClick={aplicarCaja} disabled={!cajaAsignar}>Aplicar</button>
          </div>
          {unico && (
            <div style={{ ...s.grid, marginTop: 10 }}>
              <Campo label="Etapa">
                <input style={s.input} value={unico.etapa} onChange={e => editarUnico("etapa", e.target.value)} />
              </Campo>
              <Campo label="Manzana">
                <input style={s.input} value={unico.manzana} onChange={e => editarUnico("manzana", e.target.value)} />
              </Campo>
              <Campo label="Número">
                <input style={s.input} value={unico.numero} onChange={e => editarUnico("numero", e.target.value)} />
              </Campo>
            </div>
          )}
        </div>
      )}

      {!errorCarga && lotes.length === 0 && <p style={s.vacio}>Todavía no hay lotes. Agregá los primeros con el formulario de arriba.</p>}
      {lotes.length > 0 && visibles.length === 0 && <p style={s.vacio}>Ningún lote coincide con el filtro.</p>}

      {etapasOrden.map(et => {
        const mzs = porEtapa.get(et);
        const mzOrden = [...mzs.keys()].sort(cmpNatural);
        return (
          <div key={et} style={{ marginTop: 16 }}>
            <div style={s.etapaTitulo}>{et}</div>
            {mzOrden.map(mz => {
              const grupo = mzs.get(mz).slice().sort((a, b) => cmpNatural(a.numero, b.numero));
              const ids = grupo.map(l => l.id);
              return (
                <div key={mz || "_sin"} style={s.mzBloque}>
                  <div style={s.mzTop}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{mz || "Sin manzana"}</span>
                    <span style={{ fontSize: 12, color: "var(--text2)" }}>{grupo.length} lote(s)</span>
                    {!dis && <button type="button" style={s.linkBtn} onClick={() => toggleGrupo(ids)}>Seleccionar {mz ? "manzana" : "grupo"}</button>}
                  </div>
                  <div style={s.chips}>
                    {grupo.map(l => {
                      const on = sel.has(l.id);
                      const col = l.planId ? (colorPlan[l.planId] || "#888780") : null;
                      const titulo = `${etiquetaLote(l)}\nPlan: ${l.planId ? nombrePlan(l.planId) : "sin plan"}\nCaja: ${l.cajaId ? nombreCaja(l.cajaId) : "principal"}`;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          title={titulo}
                          onClick={() => { if (!dis) toggle(l.id); }}
                          style={{
                            ...s.chip,
                            border: col ? `2px solid ${col}` : "2px dashed var(--border2)",
                            ...(on ? { background: "var(--acc)", color: "#fff" } : {}),
                            cursor: dis ? "default" : "pointer",
                          }}
                        >
                          {l.numero}
                          {l.cajaId && <span style={s.marcaChip}>★</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function SeccionTitulo({ icono, nombre, desc }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={s.h2}>{icono} {nombre}</h2>
      <p style={s.sub}>{desc}</p>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label style={s.campo}>
      <span style={s.label}>{label}</span>
      {children}
    </label>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: "16px" },
  intro: { fontSize: "14px", color: "var(--text2)", lineHeight: 1.5 },
  layout: { display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" },
  lista: { flex: "0 0 240px", minWidth: "220px", display: "flex", flexDirection: "column", gap: "6px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "8px" },
  item: { display: "flex", alignItems: "center", gap: "10px", textAlign: "left", background: "transparent", border: "none", borderRadius: "10px", padding: "10px 10px", cursor: "pointer", color: "var(--text)" },
  itemActivo: { background: "var(--surface)" },
  itemIcono: { fontSize: "18px", flexShrink: 0 },
  itemNombre: { fontSize: "13.5px", fontWeight: "700" },
  itemResumen: { fontSize: "11.5px", color: "var(--text2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  detalle: { flex: "1 1 420px", minWidth: "280px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "22px 24px" },
  h2: { margin: "0 0 4px", fontSize: "18px", fontWeight: "700", color: "var(--text)" },
  h3: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "2px" },
  sub: { margin: 0, fontSize: "13px", color: "var(--text2)", lineHeight: 1.5 },
  nota: { margin: "10px 0 0", fontSize: "12.5px", color: "var(--text2)", lineHeight: 1.5 },
  vacio: { margin: "0 0 10px", fontSize: "13px", color: "var(--text2)", fontStyle: "italic" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" },
  campo: { display: "flex", flexDirection: "column", gap: "5px" },
  label: { fontSize: "12px", color: "var(--text2)" },
  input: { padding: "9px 11px", border: "1.5px solid var(--border)", borderRadius: "8px", fontSize: "14px", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", width: "100%" },
  plan: { border: "1.5px solid var(--border)", borderRadius: "14px", padding: "16px", marginBottom: "14px", background: "var(--surface)" },
  planTop: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "14px" },
  planNombre: { flex: 1, minWidth: 180, fontWeight: "700" },
  grupo: { border: "1px solid var(--border)", borderRadius: "12px", padding: "12px", marginBottom: "10px", background: "var(--card)" },
  grupoTop: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" },
  colores: { display: "flex", gap: "6px", alignItems: "center" },
  colorDot: { width: "20px", height: "20px", borderRadius: "50%", border: "none", cursor: "pointer", outlineOffset: "2px", padding: 0 },
  meses: { display: "flex", flexWrap: "wrap", gap: "6px" },
  mes: { padding: "5px 10px", borderRadius: "20px", border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", fontSize: "12px", cursor: "pointer" },
  caja: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" },
  quitar: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "7px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" },
  btnSec: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text)", padding: "9px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px" },
  btnPri: { background: "var(--acc)", border: "none", color: "#fff", padding: "10px 18px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  bloque: { border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", background: "var(--surface)", marginBottom: "14px" },
  modoFila: { display: "flex", gap: "6px", flexWrap: "wrap", margin: "8px 0 12px" },
  modoBtn: { padding: "6px 12px", borderRadius: "20px", border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", fontSize: "12.5px", cursor: "pointer" },
  modoBtnOn: { background: "var(--acc)", color: "#fff", borderColor: "var(--acc)" },
  leyenda: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", fontSize: "12.5px", color: "var(--text2)" },
  resumenLotes: { fontWeight: "700", color: "var(--text)" },
  leyItem: { display: "inline-flex", alignItems: "center", gap: "6px" },
  leyDot: { width: "12px", height: "12px", borderRadius: "4px", display: "inline-block", boxSizing: "border-box" },
  marcaCaja: { color: "#BA7517", fontSize: "12px" },
  barraSel: { position: "sticky", top: "8px", zIndex: 2, border: "1.5px solid var(--acc)", borderRadius: "12px", padding: "12px", background: "var(--card)", marginBottom: "12px" },
  selAcciones: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "10px" },
  etapaTitulo: { fontSize: "14px", fontWeight: "800", color: "var(--text)", marginBottom: "8px" },
  mzBloque: { border: "1px solid var(--border)", borderRadius: "12px", padding: "10px 12px", marginBottom: "10px" },
  mzTop: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" },
  linkBtn: { background: "none", border: "none", color: "var(--acc2, var(--acc))", fontSize: "12px", cursor: "pointer", padding: 0, marginLeft: "auto" },
  chips: { display: "flex", flexWrap: "wrap", gap: "6px" },
  chip: { position: "relative", minWidth: "44px", padding: "7px 8px", borderRadius: "8px", background: "var(--bg)", color: "var(--text)", fontSize: "13px", fontWeight: "600", textAlign: "center" },
  marcaChip: { position: "absolute", top: "-7px", right: "-5px", fontSize: "11px", color: "#BA7517" },
  barra: { position: "sticky", bottom: "12px", display: "flex", alignItems: "center", gap: "10px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "12px 16px" },
};
