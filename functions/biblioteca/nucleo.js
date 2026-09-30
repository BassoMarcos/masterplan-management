// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// BIBLIOTECA — las operaciones (tipo explorador de la compu). No habla directo con Firestore ni con Drive:
// recibe "deps" = { store, drive } (ver adaptadores.js). Así se puede probar con memoria.
//
// Datos (solo los toca el servidor; las reglas de Firestore no dejan leerlos ni escribirlos desde la app):
//   biblioteca_carpetas/{id}  { empresaId, alcance, padreId|null, nombre, driveId, restringida, personas[],
//                               eliminado, eliminadoEn, creadoPor, creadoPorNombre, creadoEn, actualizadoEn,
//                               area? (carpeta fija de un área, ver permisos.AREAS) }
//   biblioteca_archivos/{id}  { empresaId, alcance, carpetaId|null, nombre, mime, tamano, driveId,
//                               subidoPor, subidoPorNombre, creadoEn, eliminado, eliminadoEn, vistaDriveId? }
//   biblioteca_raices/{empresaId}__{alcance}  { driveId }   (carpeta de esa biblioteca en el Drive)
// Los archivos viven SIEMPRE en el Drive de la empresa; acá queda el índice y los permisos.
//
// Permisos: la persona entra si ve TODA la biblioteca o la carpeta de algún área. Cada operación revisa el
// nivel en el LUGAR donde se hace (permisos.nivelAca): p. ej. alguien de Administración modifica adentro de
// la carpeta Administración, pero no en el inicio ni en la carpeta de Legales.

const P = require("./permisos");

const MAX_BYTES = 7 * 1024 * 1024; // subida por la app: hasta 7 MB por archivo (límite de la llamada)

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function error(code, message) { const e = new Error(message); e.code = code; return e; }

function limpiarNombre(n) {
  const s = String(n == null ? "" : n).replace(/[\u0000-\u001f]/g, "").trim().slice(0, 150);
  if (!s) throw error("invalid-argument", "El nombre no puede quedar vacío.");
  return s;
}

function validarAlcance(alcance) {
  if (alcance === "empresa" || /^p:[A-Za-z0-9_-]{1,64}$/.test(String(alcance || ""))) return alcance;
  throw error("invalid-argument", "Biblioteca desconocida.");
}

// Quién es, de qué empresa, y qué nivel tiene en esta biblioteca (en toda y en la carpeta de cada área).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function entrar(deps, uid, alcance, { necesita = "ver" } = {}) {
  validarAlcance(alcance);
  const ctx = await deps.store.contexto(uid);
  if (!ctx) throw error("permission-denied", "No pertenecés a ninguna empresa.");
  let proyecto = null;
  if (alcance !== "empresa") {
    proyecto = await deps.store.proyecto(alcance.slice(2));
    if (!proyecto || proyecto.empresaId !== ctx.empresaId) throw error("permission-denied", "No tenés acceso a este proyecto.");
  }
  const n = P.nivelEnBiblioteca(ctx, alcance, proyecto);
  if (necesita === "admin" ? !n.admin : !P.puedeEntrar(n)) {
    throw error("permission-denied", necesita === "admin" ? "Solo el dueño o alguien con acceso total puede hacer esto." : "No tenés acceso a esta biblioteca.");
  }
  return { ctx, proyecto, nivel: n.nivel, porArea: n.porArea || {}, admin: n.admin, alcance };
}

// ¿Puede hacer esto ACÁ? cadena = [carpeta, padre, ..., la de más arriba] ([] = el inicio).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function exigir(e, cad, necesita) {
  const n = P.nivelAca(e, cad);
  if (necesita === "editar" && !P.puedeEditar(n)) {
    throw error("permission-denied", P.puedeVer(n) ? "Acá tenés permiso solo para ver." : "No tenés permiso para cambiar cosas acá.");
  }
  if (!P.puedeVer(n)) throw error("permission-denied", "No tenés acceso a esta carpeta.");
  return n;
}

// Carpeta → [ella, padre, abuelo, ...]. Valida que sea de esta empresa y biblioteca.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function cadena(deps, e, carpetaId) {
  const out = [];
  let id = carpetaId;
  for (let i = 0; id && i < 60; i++) {
    const c = await deps.store.carpeta(id);
    if (!c || c.empresaId !== e.ctx.empresaId || c.alcance !== e.alcance) throw error("not-found", "La carpeta no existe.");
    out.push({ id, ...c });
    id = c.padreId || null;
  }
  return out;
}

// Carpeta que se puede ver (y no está en la papelera, ni ella ni las de arriba). null = el inicio
// (al inicio entran todos los que entran a la biblioteca: ahí se muestran solo las carpetas que ven).
async function carpetaVisible(deps, e, carpetaId) {
  if (!carpetaId) return { carpeta: null, cadena: [] };
  const cad = await cadena(deps, e, carpetaId);
  if (cad.some(c => c.eliminado)) throw error("not-found", "La carpeta está en la papelera.");
  if (!P.puedeVerCadena(cad, e.ctx.uid, e.admin) || !P.puedeVer(P.nivelAca(e, cad))) throw error("permission-denied", "No tenés acceso a esta carpeta.");
  return { carpeta: cad[0], cadena: cad };
}

// Carpeta de esta biblioteca en el Drive (la crea la primera vez).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function raizDrive(deps, e) {
  const r = await deps.store.raiz(e.ctx.empresaId, e.alcance);
  if (r && r.driveId) return r.driveId;
  const mp = await deps.drive.carpetaMasterPlan(e.ctx.empresaId);
  const nombre = e.alcance === "empresa" ? "Biblioteca de la empresa" : `Biblioteca - ${(e.proyecto && e.proyecto.nombre) || e.alcance.slice(2)}`;
  const driveId = await deps.drive.crearCarpeta(e.ctx.empresaId, nombre, mp);
  await deps.store.guardarRaiz(e.ctx.empresaId, e.alcance, { driveId });
  return driveId;
}

// ── Carpetas de las áreas (biblioteca de proyecto) ──
const idCarpetaArea = (e, areaId) => `area_${areaId}__${e.ctx.empresaId}__${e.alcance}`;

// Crea (la primera vez) la carpeta de cada área que usa el proyecto, en el inicio de la biblioteca y en el Drive.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function asegurarCarpetasDeArea(deps, e) {
  if (e.alcance === "empresa") return;
  const emp = e.ctx.empresaId;
  const hijas = await deps.store.carpetasHijas(emp, e.alcance, null);
  for (const a of P.AREAS) {
    if (!P.areaActiva(e.proyecto, a.id)) continue;
    const ya = hijas.find(c => c.area === a.id);
    if (ya) {
      if (ya.eliminado) { // no debería pasar (no se pueden borrar), pero si pasó, vuelve
        if (!ya.fueraDeDrive) await deps.drive.papelera(emp, ya.driveId, false);
        const cambios = { eliminado: false, eliminadoEn: null, fueraDeDrive: false };
        if (ya.fueraDeDrive) cambios.driveId = await deps.drive.crearCarpeta(emp, a.nombre, await raizDrive(deps, e));
        await deps.store.actualizarCarpeta(ya.id, cambios);
      }
      continue;
    }
    const driveId = await deps.drive.crearCarpeta(emp, a.nombre, await raizDrive(deps, e));
    const ahora = deps.ahora();
    const creada = await deps.store.crearCarpetaConId(idCarpetaArea(e, a.id), {
      empresaId: emp, alcance: e.alcance, padreId: null, nombre: a.nombre, area: a.id, driveId,
      restringida: false, personas: [], eliminado: false, creadoPor: "sistema", creadoPorNombre: "MasterPlan", creadoEn: ahora, actualizadoEn: ahora,
    });
    if (!creada) await deps.drive.papelera(emp, driveId, true); // otro pedido la creó al mismo tiempo: sobra esta
  }
}

const publicaCarpeta = (c, admin) => ({
  id: c.id, nombre: c.nombre, padreId: c.padreId || null, restringida: !!c.restringida, area: c.area || null,
  personas: admin ? (c.personas || []) : undefined, creadoPorNombre: c.creadoPorNombre || "", creadoEn: c.creadoEn || null,
});
const publicaArchivo = (a) => ({
  id: a.id, nombre: a.nombre, carpetaId: a.carpetaId || null, mime: a.mime || "application/octet-stream",
  tamano: a.tamano || 0, subidoPorNombre: a.subidoPorNombre || "", creadoEn: a.creadoEn || null, origen: a.origen || "masterplan",
  miniatura: a.miniatura || null, sinMiniatura: !!a.sinMiniatura,
});
const ordenArea = (c) => { const i = P.AREAS.findIndex(a => a.id === c.area); return i < 0 ? 99 : i; };
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" });

// Miniatura = imagen chiquita (≈200 px) guardada como texto en la lista, para ver las fotos de un vistazo
// sin bajar el archivo entero. Solo se aceptan imágenes JPEG/PNG/WebP y de poco peso.
const MAX_MINIATURA = 90000;
const miniaturaValida = (m) => typeof m === "string" && m.length <= MAX_MINIATURA && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m);

// ── Operaciones ──

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function listar(deps, uid, { alcance, carpetaId }) {
  const e = await entrar(deps, uid, alcance);
  if (!carpetaId) {
    try { await asegurarCarpetasDeArea(deps, e); } catch (x) { /* sin Drive: se crean la próxima vez */ }
  }
  const { carpeta, cadena: cad } = await carpetaVisible(deps, e, carpetaId || null);
  const nivelAqui = P.nivelAca(e, cad);
  const hijas = (await deps.store.carpetasHijas(e.ctx.empresaId, alcance, carpetaId || null))
    .filter(c => !c.eliminado && P.puedeVerCadena([c], uid, e.admin) && P.puedeVer(P.nivelAca(e, [c, ...cad])))
    .sort((a, b) => ordenArea(a) - ordenArea(b) || porNombre(a, b));
  // Lo suelto del inicio lo ve solo quien ve toda la biblioteca.
  const archivos = !P.puedeVer(nivelAqui) ? [] : (await deps.store.archivosDe(e.ctx.empresaId, alcance, carpetaId || null))
    .filter(a => !a.eliminado)
    .sort(porNombre);
  return {
    nivel: nivelAqui, admin: e.admin,
    carpeta: carpeta ? publicaCarpeta(carpeta, e.admin) : null,
    ruta: cad.slice().reverse().map(c => ({ id: c.id, nombre: c.nombre, area: c.area || null })),
    carpetas: hijas.map(c => publicaCarpeta(c, e.admin)),
    archivos: archivos.map(publicaArchivo),
  };
}

// La carpeta de un área (el botón 📚 de cada área abre la biblioteca ahí).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function carpetaDeArea(deps, uid, { alcance, area }) {
  const e = await entrar(deps, uid, alcance);
  if (alcance === "empresa" || !P.AREAS.some(a => a.id === area)) throw error("invalid-argument", "Área desconocida.");
  if (!P.areaActiva(e.proyecto, area)) throw error("not-found", "Este proyecto no usa esa área.");
  await asegurarCarpetasDeArea(deps, e);
  const c = (await deps.store.carpetasHijas(e.ctx.empresaId, alcance, null)).find(x => x.area === area && !x.eliminado);
  if (!c) throw error("not-found", "No se encontró la carpeta del área.");
  await carpetaVisible(deps, e, c.id);
  return { carpetaId: c.id };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function crearCarpeta(deps, uid, { alcance, padreId, nombre }) {
  const e = await entrar(deps, uid, alcance);
  const n = limpiarNombre(nombre);
  const { carpeta: padre, cadena: cad } = await carpetaVisible(deps, e, padreId || null);
  exigir(e, cad, "editar");
  const driveId = await deps.drive.crearCarpeta(e.ctx.empresaId, n, padre ? padre.driveId : await raizDrive(deps, e));
  const ahora = deps.ahora();
  const id = await deps.store.crearCarpeta({
    empresaId: e.ctx.empresaId, alcance, padreId: padreId || null, nombre: n, driveId,
    restringida: false, personas: [], eliminado: false, creadoPor: uid, creadoPorNombre: e.ctx.nombre || "", creadoEn: ahora, actualizadoEn: ahora,
  });
  return { id, nombre: n };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function subir(deps, uid, { alcance, carpetaId, nombre, mime, base64, origen, miniatura }) {
  const e = await entrar(deps, uid, alcance);
  const n = limpiarNombre(nombre);
  if (typeof base64 !== "string" || !base64) throw error("invalid-argument", "Falta el archivo.");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_BYTES) throw error("invalid-argument", `"${n}" pesa más de 7 MB: por ahora no se puede subir desde la app.`);
  const { carpeta, cadena: cad } = await carpetaVisible(deps, e, carpetaId || null);
  exigir(e, cad, "editar");
  const padreDrive = carpeta ? carpeta.driveId : await raizDrive(deps, e);
  const tipo = String(mime || "application/octet-stream").slice(0, 120);
  const r = await deps.drive.subir(e.ctx.empresaId, n, tipo, buffer, padreDrive);
  const id = await deps.store.crearArchivo({
    empresaId: e.ctx.empresaId, alcance, carpetaId: carpetaId || null, nombre: n, mime: tipo, tamano: buffer.length,
    driveId: r.driveId, subidoPor: uid, subidoPorNombre: e.ctx.nombre || "", creadoEn: deps.ahora(), eliminado: false,
    origen: origen === "sistema" ? "sistema" : "masterplan",
    ...(miniaturaValida(miniatura) ? { miniatura } : {}),
  });
  return { id, nombre: n, tamano: buffer.length };
}

// Miniaturas que faltan (archivos viejos, PDF, documentos): se las pide al Google Drive de la empresa
// y quedan guardadas para la próxima. Lo que Drive todavía no tiene se reintenta otro día.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function miniaturas(deps, uid, { alcance, ids }) {
  const e = await entrar(deps, uid, alcance);
  const lista = (Array.isArray(ids) ? ids : []).filter(x => typeof x === "string").slice(0, 24);
  const out = {};
  const hace10min = new Date(new Date(deps.ahora()).getTime() - 10 * 60 * 1000).toISOString();
  await Promise.all(lista.map(async (id) => {
    let item;
    try { ({ item } = await elemento(deps, e, "archivo", id)); } catch (x) { return; }
    if (item.miniatura) { out[id] = item.miniatura; return; }
    if (item.sinMiniatura) return;
    try {
      const r = await deps.drive.miniatura(e.ctx.empresaId, item.driveId, 220);
      if (r && r.buffer && r.buffer.length) {
        const m = `data:${/png/.test(r.mime) ? "image/png" : /webp/.test(r.mime) ? "image/webp" : "image/jpeg"};base64,${r.buffer.toString("base64")}`;
        if (miniaturaValida(m)) {
          await deps.store.actualizarArchivo(id, { miniatura: m });
          out[id] = m;
        } else {
          await deps.store.actualizarArchivo(id, { sinMiniatura: true }); // demasiado pesada: queda el ícono
        }
        return;
      }
      // Drive no tiene miniatura (tipo sin vista, o todavía no la generó): no insistir si ya pasó un rato.
      if (!r && String(item.creadoEn || "") < hace10min) await deps.store.actualizarArchivo(id, { sinMiniatura: true });
    } catch (x) { /* sin miniatura: queda el ícono */ }
  }));
  return { miniaturas: out };
}

// La app armó la miniatura de una foto (bajándola una vez) y la deja guardada para todos.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function guardarMiniatura(deps, uid, { alcance, id, miniatura }) {
  const e = await entrar(deps, uid, alcance);
  const { item } = await elemento(deps, e, "archivo", id);
  if (!miniaturaValida(miniatura)) throw error("invalid-argument", "Miniatura inválida.");
  if (!String(item.mime || "").startsWith("image/") || item.miniatura) return { ok: true, sinCambios: true };
  await deps.store.actualizarArchivo(id, { miniatura, sinMiniatura: false });
  return { ok: true };
}

// Busca una carpeta o archivo de esta biblioteca que la persona puede ver.
// cadena = el lugar del elemento: para una carpeta, ella y las de arriba; para un archivo, su carpeta y las de arriba.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function elemento(deps, e, tipo, id, { incluirPapelera = false } = {}) {
  if (tipo === "carpeta") {
    const cad = await cadena(deps, e, id);
    if (!incluirPapelera && cad.some(c => c.eliminado)) throw error("not-found", "La carpeta está en la papelera.");
    if (!P.puedeVerCadena(cad, e.ctx.uid, e.admin) || !P.puedeVer(P.nivelAca(e, cad))) throw error("permission-denied", "No tenés acceso a esta carpeta.");
    return { tipo, item: cad[0], cadena: cad };
  }
  if (tipo === "archivo") {
    const a = await deps.store.archivo(id);
    if (!a || a.empresaId !== e.ctx.empresaId || a.alcance !== e.alcance) throw error("not-found", "El archivo no existe.");
    if (!incluirPapelera && a.eliminado) throw error("not-found", "El archivo está en la papelera.");
    const cad = a.carpetaId ? await cadena(deps, e, a.carpetaId) : [];
    if (!incluirPapelera && cad.some(c => c.eliminado)) throw error("not-found", "El archivo está en la papelera.");
    if (!P.puedeVerCadena(cad, e.ctx.uid, e.admin) || !P.puedeVer(P.nivelAca(e, cad))) throw error("permission-denied", "No tenés acceso a este archivo.");
    return { tipo, item: { id, ...a }, cadena: cad };
  }
  throw error("invalid-argument", "Tipo desconocido.");
}

const noTocarArea = (tipo, item) => {
  if (tipo === "carpeta" && item.area) throw error("failed-precondition", "Las carpetas de las áreas no se pueden renombrar, mover ni borrar.");
};

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function renombrar(deps, uid, { alcance, tipo, id, nombre }) {
  const e = await entrar(deps, uid, alcance);
  const n = limpiarNombre(nombre);
  const { item, cadena: cad } = await elemento(deps, e, tipo, id);
  noTocarArea(tipo, item);
  exigir(e, cad, "editar");
  await deps.drive.renombrar(e.ctx.empresaId, item.driveId, n);
  const cambios = { nombre: n, actualizadoEn: deps.ahora() };
  if (tipo === "carpeta") await deps.store.actualizarCarpeta(id, cambios); else await deps.store.actualizarArchivo(id, cambios);
  return { ok: true, nombre: n };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function mover(deps, uid, { alcance, tipo, id, destinoId }) {
  const e = await entrar(deps, uid, alcance);
  const { item, cadena: cad } = await elemento(deps, e, tipo, id);
  noTocarArea(tipo, item);
  exigir(e, cad, "editar");
  const { carpeta: destino, cadena: cadDestino } = await carpetaVisible(deps, e, destinoId || null);
  exigir(e, cadDestino, "editar");
  if (tipo === "carpeta" && cadDestino.some(c => c.id === id)) throw error("invalid-argument", "No se puede mover una carpeta adentro de sí misma.");
  const padreActual = tipo === "carpeta" ? (item.padreId || null) : (item.carpetaId || null);
  if (padreActual === (destinoId || null)) return { ok: true, sinCambios: true };
  await deps.drive.mover(e.ctx.empresaId, item.driveId, destino ? destino.driveId : await raizDrive(deps, e));
  if (tipo === "carpeta") await deps.store.actualizarCarpeta(id, { padreId: destinoId || null, actualizadoEn: deps.ahora() });
  else await deps.store.actualizarArchivo(id, { carpetaId: destinoId || null, actualizadoEn: deps.ahora() });
  return { ok: true };
}

// A la papelera (en la app y en el Drive). El Drive la vacía solo a los 30 días.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function eliminar(deps, uid, { alcance, tipo, id }) {
  const e = await entrar(deps, uid, alcance);
  const { item, cadena: cad } = await elemento(deps, e, tipo, id);
  noTocarArea(tipo, item);
  exigir(e, cad, "editar");
  await deps.drive.papelera(e.ctx.empresaId, item.driveId, true);
  const cambios = { eliminado: true, eliminadoEn: deps.ahora(), eliminadoPor: uid };
  if (tipo === "carpeta") await deps.store.actualizarCarpeta(id, cambios); else await deps.store.actualizarArchivo(id, cambios);
  return { ok: true };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function restaurar(deps, uid, { alcance, tipo, id }) {
  const e = await entrar(deps, uid, alcance);
  const { item, cadena: cad } = await elemento(deps, e, tipo, id, { incluirPapelera: true });
  exigir(e, cad, "editar");
  if (!item.eliminado) return { ok: true, sinCambios: true };
  if (item.fueraDeDrive) throw error("not-found", "Ya no está en el Google Drive de la empresa (lo borraron para siempre o lo sacaron de la carpeta de la biblioteca).");
  // Si la carpeta donde estaba también está en la papelera, vuelve a la carpeta de su área (o al inicio).
  const padreBorrado = tipo === "carpeta" ? cad.slice(1).some(c => c.eliminado) : cad.some(c => c.eliminado);
  let destino = null;
  if (padreBorrado) {
    const arriba = cad[cad.length - 1];
    destino = arriba && arriba.area && !arriba.eliminado && arriba.id !== id ? arriba : null;
    exigir(e, destino ? [destino] : [], "editar");
  }
  await deps.drive.papelera(e.ctx.empresaId, item.driveId, false);
  const cambios = { eliminado: false, eliminadoEn: null, actualizadoEn: deps.ahora() };
  if (padreBorrado) {
    await deps.drive.mover(e.ctx.empresaId, item.driveId, destino ? destino.driveId : await raizDrive(deps, e));
    cambios[tipo === "carpeta" ? "padreId" : "carpetaId"] = destino ? destino.id : null;
  }
  if (tipo === "carpeta") await deps.store.actualizarCarpeta(id, cambios); else await deps.store.actualizarArchivo(id, cambios);
  return { ok: true, alInicio: padreBorrado && !destino, alArea: padreBorrado && destino ? destino.nombre : null };
}

// desdeDrive: lo mandaron a la papelera directo en el Drive · fueraDeDrive: ya no está (no se puede recuperar).
const comoSeElimino = (x) => ({ eliminadoEn: x.eliminadoEn || null, desdeDrive: x.eliminadoPor === "drive", fueraDeDrive: !!x.fueraDeDrive });

// Lo que la persona puede recuperar (lo de los lugares donde puede modificar).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function papelera(deps, uid, { alcance }) {
  const e = await entrar(deps, uid, alcance);
  const { carpetas, archivos } = await deps.store.eliminados(e.ctx.empresaId, alcance);
  const visibles = [];
  const puede = async (tipo, x) => {
    try { const { cadena: cad } = await elemento(deps, e, tipo, x.id, { incluirPapelera: true }); return P.puedeEditar(P.nivelAca(e, cad)); } catch (y) { return false; }
  };
  for (const c of carpetas) if (await puede("carpeta", c)) visibles.push({ tipo: "carpeta", ...publicaCarpeta(c, e.admin), ...comoSeElimino(c) });
  for (const a of archivos) if (await puede("archivo", a)) visibles.push({ tipo: "archivo", ...publicaArchivo(a), ...comoSeElimino(a) });
  // Google Drive vacía su papelera a los 30 días: lo más viejo ya no se puede recuperar.
  const limite = new Date(new Date(deps.ahora()).getTime() - 30 * 24 * 3600 * 1000).toISOString();
  visibles.forEach(v => { v.vencido = !!(v.eliminadoEn && v.eliminadoEn < limite); });
  visibles.sort((a, b) => String(b.eliminadoEn || "").localeCompare(String(a.eliminadoEn || "")));
  return { items: visibles };
}

// Todas las carpetas que la persona ve (para "Mover a…" y para buscar).
// editable = puede poner cosas ahí · raiz = puede poner cosas en el inicio.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function arbol(deps, uid, { alcance }) {
  const e = await entrar(deps, uid, alcance);
  const todas = (await deps.store.todasCarpetas(e.ctx.empresaId, alcance)).filter(c => !c.eliminado);
  const porId = new Map(todas.map(c => [c.id, c]));
  const cadenaDe = (c) => {
    const cad = [];
    let x = c;
    for (let i = 0; x && i < 60; i++) {
      cad.push(x);
      if (!x.padreId) return cad;
      x = porId.get(x.padreId);
    }
    return null; // alguna de arriba está en la papelera o no existe
  };
  const out = [];
  for (const c of todas) {
    const cad = cadenaDe(c);
    if (!cad || !P.puedeVerCadena(cad, uid, e.admin)) continue;
    const n = P.nivelAca(e, cad);
    if (!P.puedeVer(n)) continue;
    out.push({ id: c.id, nombre: c.nombre, padreId: c.padreId || null, area: c.area || null, editable: P.puedeEditar(n) });
  }
  return { carpetas: out, raiz: P.puedeEditar(P.nivelAca(e, [])) };
}

// Busca por nombre en toda la biblioteca (solo lo que la persona puede ver).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function buscar(deps, uid, { alcance, texto }) {
  const e = await entrar(deps, uid, alcance);
  const q = String(texto || "").trim().toLowerCase();
  if (q.length < 2) return { carpetas: [], archivos: [] };
  const { carpetas } = await arbol(deps, uid, { alcance });
  const ok = new Set(carpetas.map(c => c.id));
  const porId = new Map(carpetas.map(c => [c.id, c]));
  const ruta = (id) => { const r = []; for (let x = id ? porId.get(id) : null, i = 0; x && i < 60; i++) { r.unshift(x.nombre); x = x.padreId ? porId.get(x.padreId) : null; } return r.join(" › "); };
  const verInicio = P.puedeVer(P.nivelAca(e, []));
  const archivos = (await deps.store.todosArchivos(e.ctx.empresaId, alcance))
    .filter(a => !a.eliminado && (a.carpetaId ? ok.has(a.carpetaId) : verInicio) && a.nombre.toLowerCase().includes(q))
    .slice(0, 100).map(a => ({ ...publicaArchivo(a), ruta: ruta(a.carpetaId) }));
  return {
    carpetas: carpetas.filter(c => c.nombre.toLowerCase().includes(q)).slice(0, 50).map(c => ({ ...c, ruta: ruta(c.padreId) })),
    archivos,
  };
}

// Quién ve una carpeta (solo dueño / acceso total).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function acceso(deps, uid, { alcance, carpetaId, restringida, personas }) {
  const e = await entrar(deps, uid, alcance, { necesita: "admin" });
  await elemento(deps, e, "carpeta", carpetaId);
  const lista = Array.isArray(personas) ? [...new Set(personas.filter(p => typeof p === "string" && p.length < 200))].slice(0, 500) : [];
  await deps.store.actualizarCarpeta(carpetaId, { restringida: !!restringida, personas: restringida ? lista : [], actualizadoEn: deps.ahora() });
  return { ok: true };
}

// Personas que pueden entrar a esta biblioteca (o a esa carpeta, si se dice cuál): para elegir quién ve una carpeta.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function personas(deps, uid, { alcance, carpetaId }) {
  const e = await entrar(deps, uid, alcance, { necesita: "admin" });
  const cad = carpetaId ? (await elemento(deps, e, "carpeta", carpetaId)).cadena : null;
  const emps = await deps.store.empleadosDe(e.ctx.empresaId);
  const out = [];
  for (const emp of emps) {
    const n = P.nivelEnBiblioteca({ uid: emp.uid, empresaId: e.ctx.empresaId, esDueno: false, empleado: emp }, alcance, e.proyecto);
    const nivel = cad ? P.nivelAca(n, cad) : (P.puedeEntrar(n) ? (P.puedeVer(n.nivel) ? n.nivel : "ver") : "ninguno");
    if (P.puedeVer(nivel)) out.push({ uid: emp.uid, nombre: [emp.nombre, emp.apellido].filter(Boolean).join(" ") || emp.email || "Empleado", nivel, accesoTotal: !!emp.accesoTotal });
  }
  out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { personas: out };
}

// Para ver o bajar un archivo (lo usa el pedido de descarga): devuelve el archivo si la persona puede.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function archivoPermitido(deps, uid, archivoId) {
  const a0 = await deps.store.archivo(archivoId);
  if (!a0) throw error("not-found", "El archivo no existe.");
  const e = await entrar(deps, uid, a0.alcance);
  const { item } = await elemento(deps, e, "archivo", archivoId);
  return { archivo: item, e };
}

// Carpeta por ruta de nombres (ej. ["Reservas", "2026"]); crea las que falten. La usan las otras partes de
// MasterPlan para que todo lo que suban quede siempre en la biblioteca, ordenado.
//   area:    arranca desde la carpeta de esa área (ej. area "comercial" → Comercial › Reservas › 2026)
//   desdeId: arranca desde esa carpeta (lo usa "subir una carpeta entera" de la compu)
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function asegurarRuta(deps, uid, { alcance, ruta, desdeId, area }) {
  const e = await entrar(deps, uid, alcance);
  const partes = (Array.isArray(ruta) ? ruta : []).map(limpiarNombre).slice(0, 20);
  let padreId = desdeId || null;
  if (area) padreId = (await carpetaDeArea(deps, uid, { alcance, area })).carpetaId;
  const { cadena: cad } = await carpetaVisible(deps, e, padreId);
  exigir(e, cad, "editar");
  for (const nombre of partes) {
    const hijas = await deps.store.carpetasHijas(e.ctx.empresaId, alcance, padreId);
    const ya = hijas.find(c => !c.eliminado && c.nombre.toLowerCase() === nombre.toLowerCase());
    padreId = ya ? ya.id : (await crearCarpeta(deps, uid, { alcance, padreId, nombre })).id;
  }
  if (padreId) await carpetaVisible(deps, e, padreId);
  return { carpetaId: padreId };
}

// ── Lo que se hizo DIRECTO en el Google Drive ──
// Si alguien borra, manda a la papelera, cambia el nombre o mueve algo desde el Drive (sin pasar por
// MasterPlan), la lista se pone al día. La app lo pide cada vez que se abre una carpeta, sin hacer esperar.
//  - en la papelera del Drive → a la papelera de MasterPlan (se puede restaurar mientras Google lo guarde)
//  - ya no existe, o lo sacaron de la biblioteca → papelera, marcado "ya no está", y se borra su miniatura
//  - otro nombre → se actualiza · movido a otra carpeta de la biblioteca → se mueve en la lista también
//  - las carpetas de las ÁREAS no se pueden tocar: si las borran, renombran o mueven en el Drive, se arreglan allá
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function sincronizar(deps, uid, { alcance, carpetaId }) {
  const e = await entrar(deps, uid, alcance);
  const { carpeta } = await carpetaVisible(deps, e, carpetaId || null);
  const emp = e.ctx.empresaId;
  let raiz = await deps.store.raiz(emp, alcance);
  if (!carpeta) {
    if (!raiz || !raiz.driveId) return { cambios: 0 }; // todavía no se subió nada
    // La carpeta de la biblioteca entera: si la mandaron a la papelera del Drive, vuelve; si la borraron, se arma otra.
    const est = await deps.drive.estado(emp, raiz.driveId);
    if (est.existe && est.trashed) await deps.drive.papelera(emp, raiz.driveId, false);
    if (!est.existe) {
      await deps.store.guardarRaiz(emp, alcance, { driveId: null });
      await raizDrive(deps, e);
      raiz = await deps.store.raiz(emp, alcance);
    }
  }
  const aca = carpeta ? carpeta.driveId : raiz.driveId;
  const enDrive = new Map((await deps.drive.hijos(emp, aca)).map(f => [f.id, f]));
  const carpetas = (await deps.store.carpetasHijas(emp, alcance, carpetaId || null)).filter(c => !c.eliminado);
  const archivos = (await deps.store.archivosDe(emp, alcance, carpetaId || null)).filter(a => !a.eliminado);
  const ahora = deps.ahora();
  let todas = null;
  let cambios = 0;
  for (const [tipo, lista] of [["carpeta", carpetas], ["archivo", archivos]]) {
    const act = (id, ch) => (tipo === "carpeta" ? deps.store.actualizarCarpeta(id, ch) : deps.store.actualizarArchivo(id, ch));
    const campoPadre = tipo === "carpeta" ? "padreId" : "carpetaId";
    for (const it of lista) {
      const hijo = enDrive.get(it.driveId);
      const f = hijo ? { existe: true, trashed: !!hijo.trashed, name: hijo.name, parents: [aca] } : await deps.drive.estado(emp, it.driveId);
      if (tipo === "carpeta" && it.area) {
        // Carpeta de un área: se deja como estaba (en el Drive).
        if (!f.existe) { await act(it.id, { driveId: await deps.drive.crearCarpeta(emp, it.nombre, aca) }); cambios++; }
        else if (f.trashed) await deps.drive.papelera(emp, it.driveId, false);
        else if (!f.parents.includes(aca)) await deps.drive.mover(emp, it.driveId, aca);
        else if (f.name && f.name !== it.nombre) await deps.drive.renombrar(emp, it.driveId, it.nombre);
        continue;
      }
      if (!f.existe) {
        await act(it.id, { eliminado: true, eliminadoEn: ahora, eliminadoPor: "drive", fueraDeDrive: true, miniatura: null });
        cambios++;
      } else if (f.trashed) {
        await act(it.id, { eliminado: true, eliminadoEn: ahora, eliminadoPor: "drive" });
        cambios++;
      } else if (!f.parents.includes(aca)) {
        if (!todas) todas = await deps.store.todasCarpetas(emp, alcance);
        const destino = todas.find(c => !c.eliminado && c.id !== it.id && f.parents.includes(c.driveId));
        if (destino) await act(it.id, { [campoPadre]: destino.id, actualizadoEn: ahora });
        else if (raiz && raiz.driveId && f.parents.includes(raiz.driveId)) await act(it.id, { [campoPadre]: null, actualizadoEn: ahora });
        else await act(it.id, { eliminado: true, eliminadoEn: ahora, eliminadoPor: "drive", fueraDeDrive: true, miniatura: null });
        cambios++;
      } else if (f.name && f.name !== it.nombre) {
        await act(it.id, { nombre: f.name, actualizadoEn: ahora });
        cambios++;
      }
    }
  }
  return { cambios };
}

// Sacar de la papelera algo que ya no se puede recuperar (ya no está en el Drive, o pasaron los 30 días).
// Borra solo la FICHA de MasterPlan (y lo de adentro, si es una carpeta); el Drive no se toca.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function quitarDeLaLista(deps, uid, { alcance, tipo, id }) {
  const e = await entrar(deps, uid, alcance);
  const { item, cadena: cad } = await elemento(deps, e, tipo, id, { incluirPapelera: true });
  exigir(e, cad, "editar");
  noTocarArea(tipo, item);
  const limite = new Date(new Date(deps.ahora()).getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const vencido = !!(item.eliminadoEn && item.eliminadoEn < limite);
  if (!item.eliminado || !(item.fueraDeDrive || vencido)) throw error("failed-precondition", "Solo se puede quitar de la lista lo que ya no se puede recuperar.");
  if (tipo === "archivo") { await deps.store.borrarArchivo(id); return { ok: true }; }
  const todas = await deps.store.todasCarpetas(e.ctx.empresaId, alcance);
  const sub = new Set([id]);
  for (let crecio = true; crecio;) {
    crecio = false;
    for (const c of todas) if (c.padreId && sub.has(c.padreId) && !sub.has(c.id)) { sub.add(c.id); crecio = true; }
  }
  const archivos = await deps.store.todosArchivos(e.ctx.empresaId, alcance);
  for (const a of archivos) if (sub.has(a.carpetaId)) await deps.store.borrarArchivo(a.id);
  for (const cid of sub) await deps.store.borrarCarpeta(cid);
  return { ok: true };
}

const ACCIONES = { listar, carpetaDeArea, crearCarpeta, subir, renombrar, mover, eliminar, restaurar, papelera, arbol, buscar, acceso, personas, asegurarRuta, miniaturas, guardarMiniatura, sincronizar, quitarDeLaLista };

module.exports = { ACCIONES, archivoPermitido, entrar, MAX_BYTES, error };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
module.exports.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
