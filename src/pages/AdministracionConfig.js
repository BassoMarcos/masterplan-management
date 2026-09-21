import { useState } from "react";
import { db } from "../firebase/config";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

// Configuración de la parte administrativa de un proyecto.
// Cada empresa/proyecto define SUS reglas (financiación, mora, transferencias, cajas especiales).
// Se guarda en proyectos/{id}.adminConfig. Todavía no mueve plata: es la base sobre la que
// después se arman clientes, cobros, cajas y cierres.

export const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const COLORES = ["#639922", "#D4537E", "#378ADD", "#BA7517", "#7F77DD", "#1D9E75", "#D85A30", "#888780"];

const TIPOS_INCREMENTO = [
  { id: "no", label: "Sin incremento", ayuda: "La cuota no cambia durante todo el plan." },
  { id: "icc", label: "Índice ICC (automático)", ayuda: "El robot busca el porcentaje del INDEC y lo propone. Lo confirmás antes de aplicar." },
  { id: "fijo", label: "Porcentaje fijo", ayuda: "En cada aumento se aplica siempre el mismo porcentaje." },
  { id: "manual", label: "Manual", ayuda: "Cada aumento lo cargás a mano, con el porcentaje que quieras." },
];

// Valores iniciales neutros: la empresa decide todo. (Los de F&J se cargan cuando llegue ese momento.)
export const CONFIG_ADMIN_DEFAULT = {
  financiacion: {
    moneda: "ARS",
    cuotas: 60,
    incremento: { tipo: "no", cadaMeses: 3, porcentaje: 0, usdAumenta: false },
    grupos: [],
  },
  cobranza: {
    mora: { activa: false, porcentajeDia: 0, desdeDia: 11 },
    transferencia: { impuestoPct: 0 },
    reparto: { parteA: 100, nombreA: "Parte A", nombreB: "Parte B" },
  },
  cajasEspeciales: [],
};

// Mezcla lo guardado con los valores iniciales, así un campo nuevo nunca rompe una config vieja.
export function completarConfig(guardada) {
  const g = guardada || {};
  const d = CONFIG_ADMIN_DEFAULT;
  return {
    financiacion: {
      ...d.financiacion,
      ...(g.financiacion || {}),
      incremento: { ...d.financiacion.incremento, ...((g.financiacion || {}).incremento || {}) },
      grupos: Array.isArray((g.financiacion || {}).grupos) ? g.financiacion.grupos : [],
    },
    cobranza: {
      mora: { ...d.cobranza.mora, ...((g.cobranza || {}).mora || {}) },
      transferencia: { ...d.cobranza.transferencia, ...((g.cobranza || {}).transferencia || {}) },
      reparto: { ...d.cobranza.reparto, ...((g.cobranza || {}).reparto || {}) },
    },
    cajasEspeciales: Array.isArray(g.cajasEspeciales) ? g.cajasEspeciales : [],
  };
}

function nuevoId() {
  return Math.random().toString(36).slice(2, 9);
}

function num(v) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Devuelve un texto de error (o "" si está todo bien).
function validar(cfg) {
  const f = cfg.financiacion;
  const inc = f.incremento;
  if (!(Number.isInteger(num(f.cuotas)) && num(f.cuotas) >= 1 && num(f.cuotas) <= 600)) return "La cantidad de cuotas tiene que ser un número entero entre 1 y 600.";
  if (inc.tipo !== "no") {
    if (!(Number.isInteger(num(inc.cadaMeses)) && num(inc.cadaMeses) >= 1 && num(inc.cadaMeses) <= 60)) return "\"Aumenta cada\" tiene que ser un número de meses entre 1 y 60.";
  }
  if (inc.tipo === "fijo") {
    if (!(num(inc.porcentaje) > 0 && num(inc.porcentaje) <= 100)) return "El porcentaje por aumento tiene que ser mayor que 0 y no pasar de 100.";
  }
  if (inc.tipo === "icc" || inc.tipo === "fijo") {
    for (const g of f.grupos) {
      if (!String(g.nombre || "").trim()) return "Todos los grupos de aumento necesitan un nombre.";
      if (!Array.isArray(g.meses) || g.meses.length === 0) return `El grupo "${g.nombre}" necesita al menos un mes.`;
    }
  }
  const m = cfg.cobranza.mora;
  if (m.activa) {
    if (!(num(m.porcentajeDia) > 0 && num(m.porcentajeDia) <= 100)) return "El porcentaje de mora por día tiene que ser mayor que 0 y no pasar de 100.";
    if (!(Number.isInteger(num(m.desdeDia)) && num(m.desdeDia) >= 1 && num(m.desdeDia) <= 31)) return "El día desde el que corre la mora tiene que estar entre 1 y 31.";
  }
  const t = num(cfg.cobranza.transferencia.impuestoPct);
  if (!(t >= 0 && t <= 100)) return "El impuesto de transferencias tiene que estar entre 0 y 100.";
  const a = num(cfg.cobranza.reparto.parteA);
  if (!(a >= 0 && a <= 100)) return "La parte A del reparto tiene que estar entre 0 y 100.";
  for (const c of cfg.cajasEspeciales) {
    if (!String(c.nombre || "").trim()) return "Todas las cajas especiales necesitan un nombre.";
  }
  return "";
}

// Deja los números como números (los inputs los manejan como texto).
function normalizar(cfg) {
  const f = cfg.financiacion;
  const inc = f.incremento;
  return {
    financiacion: {
      moneda: f.moneda,
      cuotas: num(f.cuotas),
      incremento: {
        tipo: inc.tipo,
        cadaMeses: num(inc.cadaMeses),
        porcentaje: inc.tipo === "fijo" ? num(inc.porcentaje) : 0,
        usdAumenta: !!inc.usdAumenta,
      },
      grupos: f.grupos.map(g => ({ id: g.id, nombre: String(g.nombre).trim(), color: g.color, meses: [...g.meses].sort((x, y) => x - y) })),
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
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cambio = JSON.stringify(cfg) !== JSON.stringify(inicial);
  const f = cfg.financiacion;
  const inc = f.incremento;
  const tipoInfo = TIPOS_INCREMENTO.find(t => t.id === inc.tipo) || TIPOS_INCREMENTO[0];
  const usaGrupos = inc.tipo === "icc" || inc.tipo === "fijo";
  const parteA = num(cfg.cobranza.reparto.parteA);
  const parteB = Number.isFinite(parteA) ? Math.round((100 - parteA) * 100) / 100 : "";

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
    if (err) { setError(err); return; }
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

  function agregarGrupo() {
    editar(c => {
      c.financiacion.grupos.push({ id: nuevoId(), nombre: "", color: COLORES[c.financiacion.grupos.length % COLORES.length], meses: [] });
    });
  }

  function agregarCaja() {
    editar(c => { c.cajasEspeciales.push({ id: nuevoId(), nombre: "", nota: "" }); });
  }

  const dis = !puedeEditar;

  return (
    <div style={s.wrap}>
      <div style={s.intro}>
        Acá definís cómo funciona la administración de este proyecto. Cada empresa arma sus reglas.
        {!puedeEditar && <b> Solo lectura: no tenés permiso para cambiar estas opciones.</b>}
      </div>

      {/* 1. Forma de financiación */}
      <section style={s.card}>
        <h2 style={s.h2}>1. Forma de financiación</h2>
        <p style={s.sub}>Cómo se cobra y cómo se actualiza la cuota de los lotes.</p>
        <div style={s.grid}>
          <Campo label="Moneda del plan">
            <select style={s.input} disabled={dis} value={f.moneda} onChange={e => editar(c => { c.financiacion.moneda = e.target.value; })}>
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
              <option value="AMBAS">Pesos y dólares</option>
            </select>
          </Campo>
          <Campo label="Cantidad de cuotas">
            <input style={s.input} disabled={dis} type="number" min="1" value={f.cuotas} onChange={e => editar(c => { c.financiacion.cuotas = e.target.value; })} />
          </Campo>
          <Campo label="Tipo de incremento">
            <select style={s.input} disabled={dis} value={inc.tipo} onChange={e => editar(c => { c.financiacion.incremento.tipo = e.target.value; })}>
              {TIPOS_INCREMENTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Campo>
          {inc.tipo !== "no" && (
            <Campo label="Aumenta cada (meses)">
              <input style={s.input} disabled={dis} type="number" min="1" value={inc.cadaMeses} onChange={e => editar(c => { c.financiacion.incremento.cadaMeses = e.target.value; })} />
            </Campo>
          )}
          {inc.tipo === "fijo" && (
            <Campo label="Porcentaje por aumento (%)">
              <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={inc.porcentaje} onChange={e => editar(c => { c.financiacion.incremento.porcentaje = e.target.value; })} />
            </Campo>
          )}
          {inc.tipo !== "no" && (f.moneda === "USD" || f.moneda === "AMBAS") && (
            <Campo label="Los lotes en dólares aumentan">
              <select style={s.input} disabled={dis} value={inc.usdAumenta ? "si" : "no"} onChange={e => editar(c => { c.financiacion.incremento.usdAumenta = e.target.value === "si"; })}>
                <option value="no">No</option>
                <option value="si">Sí, igual que los pesos</option>
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
              Si todos los lotes aumentan el mismo mes, alcanza con un solo grupo.
            </p>
            {f.grupos.length === 0 && <p style={s.vacio}>Todavía no hay grupos.</p>}
            {f.grupos.map((g, i) => (
              <div key={g.id} style={s.grupo}>
                <div style={s.grupoTop}>
                  <input
                    style={{ ...s.input, flex: 1, minWidth: 140 }}
                    disabled={dis}
                    placeholder="Nombre del grupo (ej. Verde)"
                    value={g.nombre}
                    onChange={e => editar(c => { c.financiacion.grupos[i].nombre = e.target.value; })}
                  />
                  <div style={s.colores}>
                    {COLORES.map(col => (
                      <button
                        key={col}
                        type="button"
                        disabled={dis}
                        aria-label={`Color ${col}`}
                        onClick={() => editar(c => { c.financiacion.grupos[i].color = col; })}
                        style={{ ...s.colorDot, background: col, outline: g.color === col ? "2px solid var(--text)" : "none" }}
                      />
                    ))}
                  </div>
                  {!dis && (
                    <button type="button" style={s.quitar} onClick={() => editar(c => { c.financiacion.grupos.splice(i, 1); })}>Quitar</button>
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
                          const arr = c.financiacion.grupos[i].meses;
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
      </section>

      {/* 2. Mora y transferencias */}
      <section style={s.card}>
        <h2 style={s.h2}>2. Mora, transferencias y reparto</h2>
        <p style={s.sub}>Los porcentajes y los días los define cada empresa.</p>
        <div style={s.grid}>
          <Campo label="Interés por mora">
            <select style={s.input} disabled={dis} value={cfg.cobranza.mora.activa ? "si" : "no"} onChange={e => editar(c => { c.cobranza.mora.activa = e.target.value === "si"; })}>
              <option value="no">Sin mora</option>
              <option value="si">Activo</option>
            </select>
          </Campo>
          {cfg.cobranza.mora.activa && (
            <>
              <Campo label="Porcentaje por día (%)">
                <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={cfg.cobranza.mora.porcentajeDia} onChange={e => editar(c => { c.cobranza.mora.porcentajeDia = e.target.value; })} />
              </Campo>
              <Campo label="Empieza a correr desde el día">
                <input style={s.input} disabled={dis} type="number" min="1" max="31" value={cfg.cobranza.mora.desdeDia} onChange={e => editar(c => { c.cobranza.mora.desdeDia = e.target.value; })} />
              </Campo>
            </>
          )}
          <Campo label="Impuesto en transferencias (%)">
            <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={cfg.cobranza.transferencia.impuestoPct} onChange={e => editar(c => { c.cobranza.transferencia.impuestoPct = e.target.value; })} />
          </Campo>
        </div>
        <p style={s.nota}>
          Si el impuesto es 0, las transferencias se cobran sin recargo.
        </p>

        <div style={{ marginTop: 18 }}>
          <div style={s.h3}>Reparto de la caja</div>
          <div style={s.grid}>
            <Campo label="Nombre de la parte A">
              <input style={s.input} disabled={dis} value={cfg.cobranza.reparto.nombreA} onChange={e => editar(c => { c.cobranza.reparto.nombreA = e.target.value; })} />
            </Campo>
            <Campo label="Porcentaje de la parte A (%)">
              <input style={s.input} disabled={dis} type="number" min="0" max="100" step="1" value={cfg.cobranza.reparto.parteA} onChange={e => editar(c => { c.cobranza.reparto.parteA = e.target.value; })} />
            </Campo>
            <Campo label="Nombre de la parte B">
              <input style={s.input} disabled={dis} value={cfg.cobranza.reparto.nombreB} onChange={e => editar(c => { c.cobranza.reparto.nombreB = e.target.value; })} />
            </Campo>
            <Campo label="Porcentaje de la parte B (%)">
              <div style={{ ...s.input, background: "var(--surface)", color: "var(--text2)" }}>{parteB === "" ? "—" : parteB}</div>
            </Campo>
          </div>
          <p style={s.nota}>La parte B es lo que queda: siempre suman 100.</p>
        </div>
      </section>

      {/* 3. Cajas especiales */}
      <section style={s.card}>
        <h2 style={s.h2}>3. Cajas especiales</h2>
        <p style={s.sub}>
          Grupos de lotes cuya plata no entra a la caja principal (por ejemplo agrimensores, escribanos o la propia empresa).
          Cada uno tiene su caja. Los lotes y sus dueños se asignan cuando esté lista la sección de Lotes.
        </p>
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
      </section>

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
  card: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "20px 22px" },
  h2: { margin: "0 0 2px", fontSize: "17px", fontWeight: "700", color: "var(--text)" },
  h3: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "2px" },
  sub: { margin: "0 0 14px", fontSize: "13px", color: "var(--text2)", lineHeight: 1.5 },
  nota: { margin: "10px 0 0", fontSize: "12.5px", color: "var(--text2)", lineHeight: 1.5 },
  vacio: { margin: "0 0 10px", fontSize: "13px", color: "var(--text2)", fontStyle: "italic" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" },
  campo: { display: "flex", flexDirection: "column", gap: "5px" },
  label: { fontSize: "12px", color: "var(--text2)" },
  input: { padding: "9px 11px", border: "1.5px solid var(--border)", borderRadius: "8px", fontSize: "14px", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", width: "100%" },
  grupo: { border: "1px solid var(--border)", borderRadius: "12px", padding: "12px", marginBottom: "10px", background: "var(--surface)" },
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
