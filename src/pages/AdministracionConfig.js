import { useState } from "react";
import { db } from "../firebase/config";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

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
// se define más adelante, en la sección de Lotes (todavía no existe).

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

  const cambio = JSON.stringify(cfg) !== JSON.stringify(inicial);
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

  async function guardar() {
    const err = validar(cfg);
    if (err) { setError(err.mensaje); setActiva(err.seccion); return; }
    setGuardando(true);
    setError("");
    try {
      const limpia = normalizar(cfg);
      await updateDoc(doc(db, "proyectos", proyecto.id), { adminConfig: limpia, adminConfigActualizado: serverTimestamp() });
      const completa = completarConfig(limpia);
      setInicial(completa);
      setCfg(completa);
      setOk(true);
      if (onGuardado) onGuardado(limpia);
    } catch (e) {
      setError("No se pudo guardar. Revisá tu conexión e intentá de nuevo.");
    }
    setGuardando(false);
  }

  function descartar() {
    setCfg(inicial);
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
  barra: { position: "sticky", bottom: "12px", display: "flex", alignItems: "center", gap: "10px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "12px 16px" },
};
