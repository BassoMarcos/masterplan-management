// Reglas de la configuración administrativa de un proyecto (sin pantallas).
// Las usan Administración → Configuración y el asistente de proyecto nuevo, así las dos
// pantallas validan, convierten y guardan exactamente igual.

export const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const COLORES = ["#639922", "#D4537E", "#378ADD", "#BA7517", "#7F77DD", "#1D9E75", "#D85A30", "#888780"];

export const TIPOS_INCREMENTO = [
  { id: "no", label: "Sin incremento (cuota fija)", ayuda: "La cuota no cambia nunca." },
  { id: "icc", label: "Índice ICC (automático)", ayuda: "El robot busca el porcentaje del INDEC y lo propone. Lo confirmás antes de aplicar." },
  { id: "fijo", label: "Porcentaje fijo", ayuda: "En cada aumento se aplica siempre el mismo porcentaje." },
  { id: "manual", label: "Manual", ayuda: "Cada aumento lo cargás a mano, con el porcentaje que quieras." },
];


// Monedas en las que se pueden pagar las cuotas del proyecto.
export const MONEDAS = [
  { id: "ARS", nombre: "Pesos" },
  { id: "USD", nombre: "Dólares" },
];

// Como máximo se aumenta una vez por año (cada 12 meses): más grupos no tienen sentido.
export const CADA_MESES_MAX = 12;

// Financiación del PROYECTO: una regla por moneda (¿se usa? ¿aumenta? ¿cómo y cada cuánto?).
// La cantidad de cuotas y el valor de la cuota NO van acá: se ponen al firmar cada lote.
function monedaDefault(id) {
  return { habilitada: id === "ARS", incremento: { tipo: "no", cadaMeses: 3, porcentaje: 0, modo: "grupos", mesInicio: 1 }, grupos: [] };
}

// Valores iniciales neutros: la empresa decide todo. (Los de F&J se cargan cuando llegue ese momento.)
export const CONFIG_ADMIN_DEFAULT = {
  financiacion: { ARS: monedaDefault("ARS"), USD: monedaDefault("USD") },
  cobranza: {
    // ultimoDia: último día del mes para pagar sin interés (10 → quien paga el 11 tiene 1 día de atraso).
    mora: { activa: false, porcentajeDia: 0, ultimoDia: 10 },
    transferencia: { impuestoPct: 0 },
  },
  // Dueños del proyecto y su parte de lo que entra (tienen que sumar 100).
  duenos: [{ id: "empresa", nombre: "Empresa", porcentaje: 100 }],
  cajasEspeciales: [],
};

// ── Cómo se reparten los aumentos ──────────────────────────────
// "grupos": cada cliente aumenta cada N meses contando desde SU firma (se reparten en N grupos).
// "calendario": todos aumentan juntos en meses fijos (ej. cada 4 desde enero: Ene · May · Sep).
//   Aunque un cliente haya firmado hace un mes, aumenta igual que todos (pedido de Marcos).
export const MODOS_AUMENTO = [
  { id: "grupos", label: "Por grupos (cada cliente según su firma)" },
  { id: "calendario", label: "Fecha fija para todos" },
];

// Meses fijos (1-12) del modo calendario. Si N no divide a 12, cambian de un año a otro → null.
export function mesesCalendario(mesInicio, n) {
  const m0 = num(mesInicio);
  if (!(n >= 1 && n <= 12) || 12 % n !== 0 || !(m0 >= 1 && m0 <= 12)) return null;
  const out = [];
  for (let i = 0; i < 12 / n; i++) out.push(((m0 - 1 + i * n) % 12) + 1);
  return out.sort((a, b) => a - b);
}

export function textoCalendario(mesInicio, n) {
  const meses = mesesCalendario(mesInicio, n);
  if (meses) return meses.map(m => MESES_CORTO[m - 1]).join(" · ");
  return `Arranca en ${MESES_CORTO[(num(mesInicio) - 1 + 12) % 12] || "?"} y sigue cada ${n} meses (los meses cambian de un año a otro)`;
}

// ── Grupos de aumento ──────────────────────────────────────────
// Si las cuotas aumentan cada N meses, los clientes se reparten en N grupos: el grupo k arranca en el
// mes k y aumenta cada N meses. Así todos los meses aumenta un grupo distinto y cada cliente aumenta
// cada N meses. Ej. cada 3: G1 Ene-Abr-Jul-Oct, G2 Feb-May-Ago-Nov, G3 Mar-Jun-Sep-Dic.
// A qué grupo va cada cliente se decide al firmar su lote (según el mes de la primera cuota).
export function ajustarGrupos(grupos, n) {
  const cant = Number.isInteger(num(n)) && num(n) >= 1 && num(n) <= CADA_MESES_MAX ? num(n) : 0;
  const out = [];
  for (let k = 0; k < cant; k++) {
    const prev = (grupos || [])[k];
    out.push({
      id: prev && prev.id ? prev.id : nuevoId(),
      nombre: prev && prev.nombre !== undefined ? prev.nombre : `Grupo ${k + 1}`,
      color: prev && prev.color ? prev.color : COLORES[k % COLORES.length],
    });
  }
  return out;
}

// Meses (1-12) en que aumenta el grupo k (1..N). Si N no divide a 12 (ej. cada 5), los meses cambian
// de un año a otro: devuelve null y se muestra "arranca en tal mes y sigue cada N meses".
export function mesesDelGrupo(k, n) {
  if (!(n >= 1 && n <= 12) || 12 % n !== 0) return null;
  const out = [];
  for (let m = k; m <= 12; m += n) out.push(m);
  return out;
}

export function textoGrupo(k, n) {
  const meses = mesesDelGrupo(k, n);
  if (meses) return meses.map(m => MESES_CORTO[m - 1]).join(" · ");
  return `Arranca en ${MESES_CORTO[(k - 1) % 12]} y sigue cada ${n} meses (los meses cambian de un año a otro)`;
}

function completarMoneda(id, guardada) {
  const d = monedaDefault(id);
  const x = guardada || {};
  const incremento = { ...d.incremento, ...(x.incremento || {}) };
  delete incremento.usdAumenta;
  const usaGrupos = incremento.tipo !== "no" && incremento.modo !== "calendario";
  return {
    habilitada: x.habilitada !== undefined ? !!x.habilitada : d.habilitada,
    incremento,
    grupos: usaGrupos ? ajustarGrupos(Array.isArray(x.grupos) ? x.grupos : [], incremento.cadaMeses) : (Array.isArray(x.grupos) ? x.grupos : []),
  };
}

// Compatibilidad: antes la financiación eran "planes" (o un único plan con moneda/cuotas/incremento).
// Se toma, de cada moneda, el primer plan como la regla de esa moneda.
export function completarFinanciacion(fg) {
  const f = fg || {};
  if (f.ARS || f.USD) return { ARS: completarMoneda("ARS", f.ARS), USD: completarMoneda("USD", f.USD) };
  const planes = Array.isArray(f.planes) ? f.planes : ((f.moneda || f.cuotas || f.incremento) ? [f] : []);
  const out = {};
  MONEDAS.forEach(({ id }) => {
    const p = planes.find(x => (x.moneda || "ARS") === id);
    if (p) out[id] = completarMoneda(id, { habilitada: true, incremento: p.incremento, grupos: p.grupos });
    else out[id] = completarMoneda(id, planes.length ? { habilitada: false } : undefined);
  });
  return out;
}

// Pasa el reparto viejo (parte A / parte B) a la lista de dueños.
export function duenosDesdeRepartoViejo(r) {
  const a = Number(r.parteA);
  if (!Number.isFinite(a)) return null;
  const lista = [];
  if (a > 0) lista.push({ id: nuevoId(), nombre: r.nombreA || "Parte A", porcentaje: a });
  if (a < 100) lista.push({ id: nuevoId(), nombre: r.nombreB || "Parte B", porcentaje: Math.round((100 - a) * 100) / 100 });
  return lista.length ? lista : null;
}

export function nuevoId() {
  return Math.random().toString(36).slice(2, 9);
}

// Mezcla lo guardado con los valores iniciales, así un campo nuevo nunca rompe una config vieja.
export function completarConfig(guardada) {
  const g = guardada || {};
  const d = CONFIG_ADMIN_DEFAULT;

  // Compatibilidad: la mora vieja guardaba "desde qué día corre" (desdeDia); ahora es el último día para pagar.
  const moraG = (g.cobranza || {}).mora || {};
  const mora = { ...d.cobranza.mora, ...moraG };
  if (moraG.ultimoDia === undefined && moraG.desdeDia !== undefined) mora.ultimoDia = Math.max(1, Number(moraG.desdeDia) - 1);
  delete mora.desdeDia;

  // Compatibilidad: el reparto viejo (parte A / parte B) pasa a ser la lista de dueños.
  let duenos;
  if (Array.isArray(g.duenos) && g.duenos.length) duenos = g.duenos.map(x => ({ id: x.id || nuevoId(), nombre: x.nombre || "", porcentaje: x.porcentaje !== undefined ? x.porcentaje : 0 }));
  else duenos = duenosDesdeRepartoViejo((g.cobranza || {}).reparto || {}) || d.duenos.map(x => ({ ...x }));

  return {
    financiacion: completarFinanciacion(g.financiacion),
    cobranza: {
      mora,
      transferencia: { ...d.cobranza.transferencia, ...((g.cobranza || {}).transferencia || {}) },
    },
    duenos,
    cajasEspeciales: Array.isArray(g.cajasEspeciales) ? g.cajasEspeciales : [],
  };
}

export function num(v) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Devuelve {mensaje, seccion} del primer error encontrado (o null si está todo bien).
export function validar(cfg) {
  const encendidas = MONEDAS.filter(({ id }) => cfg.financiacion[id] && cfg.financiacion[id].habilitada);
  if (!encendidas.length) return { mensaje: "Elegí al menos una moneda para las cuotas.", seccion: "financiacion" };
  for (const mon of encendidas) {
    const f = cfg.financiacion[mon.id];
    const inc = f.incremento;
    const pref = `Cuotas en ${mon.nombre.toLowerCase()}: `;
    if (inc.tipo !== "no") {
      const n = num(inc.cadaMeses);
      if (!(Number.isInteger(n) && n >= 1 && n <= CADA_MESES_MAX)) return { mensaje: pref + `"aumenta cada" tiene que ser entre 1 y ${CADA_MESES_MAX} meses.`, seccion: "financiacion" };
      if (inc.tipo === "fijo" && !(num(inc.porcentaje) > 0 && num(inc.porcentaje) <= 100)) return { mensaje: pref + "el porcentaje por aumento tiene que ser mayor que 0 y no pasar de 100.", seccion: "financiacion" };
      if (inc.modo === "calendario") {
        const m0 = num(inc.mesInicio);
        if (!(Number.isInteger(m0) && m0 >= 1 && m0 <= 12)) return { mensaje: pref + "elegí el mes del primer aumento.", seccion: "financiacion" };
      } else {
        if (f.grupos.length !== n) return { mensaje: pref + "los grupos de aumento no coinciden con cada cuántos meses aumenta.", seccion: "financiacion" };
        for (const g of f.grupos) {
          if (!String(g.nombre || "").trim()) return { mensaje: pref + "todos los grupos de aumento necesitan un nombre.", seccion: "financiacion" };
        }
      }
    }
  }
  const m = cfg.cobranza.mora;
  if (m.activa) {
    if (!(num(m.porcentajeDia) > 0 && num(m.porcentajeDia) <= 100)) return { mensaje: "El porcentaje de mora por día tiene que ser mayor que 0 y no pasar de 100.", seccion: "mora" };
    if (!(Number.isInteger(num(m.ultimoDia)) && num(m.ultimoDia) >= 1 && num(m.ultimoDia) <= 31)) return { mensaje: "El último día para pagar tiene que estar entre 1 y 31.", seccion: "mora" };
  }
  const t = num(cfg.cobranza.transferencia.impuestoPct);
  if (!(t >= 0 && t <= 100)) return { mensaje: "El recargo por transferencia tiene que estar entre 0 y 100.", seccion: "transferencias" };
  if (!cfg.duenos.length) return { mensaje: "Tiene que haber al menos un dueño.", seccion: "distribucion" };
  let suma = 0;
  for (const du of cfg.duenos) {
    if (!String(du.nombre || "").trim()) return { mensaje: "Todos los dueños necesitan un nombre.", seccion: "distribucion" };
    const p = num(du.porcentaje);
    if (!(p > 0 && p <= 100)) return { mensaje: `El porcentaje de "${du.nombre}" tiene que ser mayor que 0 y no pasar de 100.`, seccion: "distribucion" };
    suma += p;
  }
  if (Math.abs(suma - 100) > 0.01) return { mensaje: `Los porcentajes de los dueños suman ${Math.round(suma * 100) / 100}: tienen que sumar 100.`, seccion: "distribucion" };
  for (const c of cfg.cajasEspeciales) {
    if (!String(c.nombre || "").trim()) return { mensaje: "Todas las cajas especiales necesitan un nombre.", seccion: "cajas" };
  }
  return null;
}

// ── Lotes ─────────────────────────────────────────────────────

// Forma única de un lote (la misma al leer de la base, al comparar y al guardar).
export function loteLimpio(id, d) {
  return {
    id,
    etapa: String(d.etapa || "").trim(),
    manzana: String(d.manzana || "").trim(),
    numero: String(d.numero || "").trim(),
    cajaId: d.cajaId || null,
  };
}

export function nuevoIdLote() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Dos lotes con la misma etapa + manzana + número son el mismo lote.
export function claveLote(l) {
  return [l.etapa, l.manzana, l.numero].map(x => String(x || "").trim().toLowerCase()).join("|");
}

export function etiquetaLote(l) {
  return `${l.etapa}${l.manzana ? " · " + l.manzana : ""} · Lote ${l.numero}`;
}

// Orden "humano": 2 antes que 10, y 4A antes que 4B.
export function cmpNatural(a, b) {
  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

export function validarLotes(lotes, cfg) {
  const cajaIds = new Set(cfg.cajasEspeciales.map(c => c.id));
  const vistos = new Set();
  let cajaPerdida = 0;
  for (const l of lotes) {
    if (!String(l.etapa || "").trim() || !String(l.numero || "").trim()) return { mensaje: "Todos los lotes necesitan etapa y número.", seccion: "lotes" };
    const k = claveLote(l);
    if (vistos.has(k)) return { mensaje: `El lote ${etiquetaLote(l)} está repetido.`, seccion: "lotes" };
    vistos.add(k);
    if (l.cajaId && !cajaIds.has(l.cajaId)) cajaPerdida++;
  }
  if (cajaPerdida) return { mensaje: `Hay ${cajaPerdida} lote(s) en una caja especial que quitaste. Pasalos a otra caja antes de guardar.`, seccion: "lotes" };
  return null;
}

// Letras de lotes partidos. Acepta "A,B", "A B", "a, b" o rangos "A-D". Devuelve {letras, error}.
export function parseLetras(txt) {
  const t = String(txt || "").trim();
  if (!t) return { letras: [], error: "" };
  const letras = [];
  for (const tok of t.split(/[\s,;]+/).filter(Boolean)) {
    const rango = tok.match(/^([A-Za-z])-([A-Za-z])$/);
    if (rango) {
      const a = rango[1].toUpperCase().charCodeAt(0);
      const b = rango[2].toUpperCase().charCodeAt(0);
      if (b < a) return { letras: [], error: `El rango "${tok}" está al revés.` };
      for (let c = a; c <= b; c++) letras.push(String.fromCharCode(c));
    } else if (/^[A-Za-z]{1,3}$/.test(tok)) {
      letras.push(tok.toUpperCase());
    } else {
      return { letras: [], error: `"${tok}" no es una letra válida. Usá letras separadas por coma (A, B) o un rango (A-D).` };
    }
  }
  const unicas = [...new Set(letras)];
  if (unicas.length > 26) return { letras: [], error: "Como máximo 26 letras." };
  return { letras: unicas, error: "" };
}

// Opciones de "¿en cuántas partes está partido cada lote?" (se guardan como rango de letras).
export const OPCIONES_PARTES = [
  { v: "", label: "No, lote entero" },
  { v: "A-B", label: "2 partes (A, B)" },
  { v: "A-C", label: "3 partes (A, B, C)" },
  { v: "A-D", label: "4 partes (A a D)" },
  { v: "A-E", label: "5 partes (A a E)" },
  { v: "A-F", label: "6 partes (A a F)" },
];

// Números de lote para un alta "del N al M", con letras opcionales: 1..4 + [A,B] → 1A,1B,2A,2B,3A,3B,4A,4B.
export function numerosDeRango(desde, hasta, letras) {
  const out = [];
  for (let n = desde; n <= hasta; n++) {
    if (letras.length) letras.forEach(L => out.push(`${n}${L}`));
    else out.push(String(n));
  }
  return out;
}

// Despliega un lote en letras: el 2 (o el 2A) + [A,B,C] → 2A, 2B, 2C en la misma etapa/manzana,
// con la misma caja. Si el lote original era el número solo (sin letra), se reemplaza.
// Devuelve {lotes, creados, reemplazado}.
export function partirLote(lotes, id, letras) {
  const orig = lotes.find(l => l.id === id);
  if (!orig || !letras.length) return { lotes, creados: 0, reemplazado: false };
  const m = String(orig.numero).match(/^\d+/);
  const base = m ? m[0] : String(orig.numero);
  const existentes = new Set(lotes.map(claveLote));
  const nuevos = [];
  letras.forEach(L => {
    const l = { id: nuevoIdLote(), etapa: orig.etapa, manzana: orig.manzana, numero: `${base}${L}`, cajaId: orig.cajaId };
    const k = claveLote(l);
    if (!existentes.has(k)) { nuevos.push(l); existentes.add(k); }
  });
  const reemplazado = String(orig.numero) === base && nuevos.length > 0;
  const resto = reemplazado ? lotes.filter(l => l.id !== id) : lotes;
  return { lotes: resto.concat(nuevos), creados: nuevos.length, reemplazado };
}

// Qué hay que escribir en la base: lotes nuevos o cambiados ("set") y lotes borrados ("del").
export function diffLotes(ini, act) {
  const previos = new Map(ini.map(l => [l.id, loteLimpio(l.id, l)]));
  const siguen = new Set(act.map(l => l.id));
  const ops = [];
  act.forEach(l => {
    const nuevo = loteLimpio(l.id, l);
    const antes = previos.get(l.id);
    if (!antes || JSON.stringify(antes) !== JSON.stringify(nuevo)) {
      ops.push({ tipo: "set", id: l.id, data: { etapa: nuevo.etapa, manzana: nuevo.manzana, numero: nuevo.numero, cajaId: nuevo.cajaId } });
    }
  });
  ini.forEach(l => { if (!siguen.has(l.id)) ops.push({ tipo: "del", id: l.id }); });
  return ops;
}

// Deja los números como números (los inputs los manejan como texto).
export function normalizar(cfg) {
  return {
    financiacion: Object.fromEntries(MONEDAS.map(({ id }) => {
      const f = cfg.financiacion[id];
      const tipo = f.incremento.tipo;
      const modo = f.incremento.modo === "calendario" ? "calendario" : "grupos";
      return [id, {
        habilitada: !!f.habilitada,
        incremento: {
          tipo,
          cadaMeses: num(f.incremento.cadaMeses) || 0,
          porcentaje: tipo === "fijo" ? num(f.incremento.porcentaje) : 0,
          modo,
          mesInicio: num(f.incremento.mesInicio) || 1,
        },
        grupos: tipo === "no" || modo === "calendario" ? [] : f.grupos.map(g => ({ id: g.id, nombre: String(g.nombre).trim(), color: g.color })),
      }];
    })),
    cobranza: {
      mora: {
        activa: !!cfg.cobranza.mora.activa,
        porcentajeDia: cfg.cobranza.mora.activa ? num(cfg.cobranza.mora.porcentajeDia) : 0,
        ultimoDia: num(cfg.cobranza.mora.ultimoDia),
      },
      transferencia: { impuestoPct: num(cfg.cobranza.transferencia.impuestoPct) },
    },
    duenos: cfg.duenos.map(du => ({ id: du.id, nombre: String(du.nombre).trim(), porcentaje: Math.round(num(du.porcentaje) * 100) / 100 })),
    cajasEspeciales: cfg.cajasEspeciales.map(c => ({ id: c.id, nombre: String(c.nombre).trim(), nota: String(c.nota || "").trim() })),
  };
}


// Agrupa lotes por etapa → manzana, en orden "humano". Devuelve [{etapa, manzanas: [{manzana, lotes}]}].
export function agruparLotes(lotes) {
  const porEtapa = new Map();
  lotes.forEach(l => {
    if (!porEtapa.has(l.etapa)) porEtapa.set(l.etapa, new Map());
    const mzs = porEtapa.get(l.etapa);
    if (!mzs.has(l.manzana)) mzs.set(l.manzana, []);
    mzs.get(l.manzana).push(l);
  });
  return [...porEtapa.keys()].sort(cmpNatural).map(etapa => {
    const mzs = porEtapa.get(etapa);
    return {
      etapa,
      manzanas: [...mzs.keys()].sort(cmpNatural).map(manzana => ({
        manzana,
        lotes: mzs.get(manzana).slice().sort((a, b) => cmpNatural(a.numero, b.numero)),
      })),
    };
  });
}

// ── Estructura del loteo (asistente de proyecto nuevo) ─────────
// etapas: [{ nombre, conManzanas, desde, hasta, letras, manzanas: [{ nombre, desde, hasta, letras }] }]
// Devuelve { lotes: [{etapa, manzana, numero}], error }. Cada manzana puede tener otra cantidad de lotes.
export function lotesDesdeEstructura(etapas) {
  const out = [];
  const vistos = new Set();
  for (let i = 0; i < etapas.length; i++) {
    const et = etapas[i];
    const nombreEt = String(et.nombre || "").trim();
    if (!nombreEt) return { lotes: [], error: `La etapa ${i + 1} necesita un nombre.` };
    let bloques;
    if (et.conManzanas) {
      const mzs = Array.isArray(et.manzanas) ? et.manzanas : [];
      if (!mzs.length) return { lotes: [], error: `${nombreEt}: indicá cuántas manzanas tiene.` };
      const nombres = new Set();
      bloques = [];
      for (let j = 0; j < mzs.length; j++) {
        const nombreMz = String(mzs[j].nombre || "").trim();
        if (!nombreMz) return { lotes: [], error: `${nombreEt}: la manzana ${j + 1} necesita un nombre.` };
        if (nombres.has(nombreMz.toLowerCase())) return { lotes: [], error: `${nombreEt}: hay dos manzanas que se llaman "${nombreMz}".` };
        nombres.add(nombreMz.toLowerCase());
        bloques.push({ manzana: nombreMz, desde: mzs[j].desde, hasta: mzs[j].hasta, letras: mzs[j].letras, donde: `${nombreEt} · ${nombreMz}` });
      }
    } else {
      bloques = [{ manzana: "", desde: et.desde, hasta: et.hasta, letras: et.letras, donde: nombreEt }];
    }
    for (const b of bloques) {
      const d = Number(b.desde);
      const h = Number(b.hasta);
      if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h < d) return { lotes: [], error: `${b.donde}: revisá los lotes ("del" tiene que ser 1 o más, y "al" igual o mayor).` };
      const pl = parseLetras(b.letras);
      if (pl.error) return { lotes: [], error: `${b.donde}: ${pl.error}` };
      for (const n of numerosDeRango(d, h, pl.letras)) {
        const l = { etapa: nombreEt, manzana: b.manzana, numero: n };
        const k = claveLote(l);
        if (vistos.has(k)) return { lotes: [], error: `Hay dos etapas que se llaman "${nombreEt}".` };
        vistos.add(k);
        out.push(l);
      }
    }
  }
  if (out.length > 5000) return { lotes: [], error: `Son ${out.length} lotes: el máximo por proyecto es 5000.` };
  return { lotes: out, error: "" };
}

// Junta los lotes que ya existían (base de datos) con los que salen de la estructura del asistente.
// - Los lotes que ya estaban guardados no se tocan.
// - Si un lote de la estructura ya estaba en la lista (misma etapa/manzana/número), se conserva ese,
//   con la caja que se le haya asignado.
// - Los lotes que había generado el asistente y ya no están en la estructura, se sacan.
export function sincronizarLotes(actuales, idsGuardados, generados) {
  const guardados = actuales.filter(l => idsGuardados.has(l.id));
  const porClave = new Map(actuales.map(l => [claveLote(l), l]));
  const clavesGuardadas = new Set(guardados.map(claveLote));
  const nuevos = [];
  generados.forEach(g => {
    const k = claveLote(g);
    if (clavesGuardadas.has(k)) return;
    const previo = porClave.get(k);
    nuevos.push(previo ? previo : { id: nuevoIdLote(), etapa: g.etapa, manzana: g.manzana, numero: g.numero, cajaId: null });
  });
  return guardados.concat(nuevos);
}
