// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// BIBLIOTECA — las operaciones (tipo explorador de la compu). No habla directo con Firestore ni con Drive:
// recibe "deps" = { store, drive } (ver adaptadores.js). Así se puede probar con memoria.
//
// Datos (solo los toca el servidor; las reglas de Firestore no dejan leerlos ni escribirlos desde la app):
//   biblioteca_carpetas/{id}  { empresaId, alcance, padreId|null, nombre, driveId, restringida, personas[],
//                               eliminado, eliminadoEn, creadoPor, creadoPorNombre, creadoEn, actualizadoEn }
//   biblioteca_archivos/{id}  { empresaId, alcance, carpetaId|null, nombre, mime, tamano, driveId,
//                               subidoPor, subidoPorNombre, creadoEn, eliminado, eliminadoEn, vistaDriveId? }
//   biblioteca_raices/{empresaId}__{alcance}  { driveId }   (carpeta de esa biblioteca en el Drive)
// Los archivos viven SIEMPRE en el Drive de la empresa; acá queda el índice y los permisos.

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

// Quién es, de qué empresa, y qué nivel tiene en esta biblioteca.
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
  const { nivel, admin } = P.nivelEnBiblioteca(ctx, alcance, proyecto);
  if (necesita === "admin" ? !admin : necesita === "editar" ? !P.puedeEditar(nivel) : !P.puedeVer(nivel)) {
    throw error("permission-denied", necesita === "admin" ? "Solo el dueño o alguien con acceso total puede hacer esto." : necesita === "editar" ? "Tenés permiso solo para ver esta biblioteca." : "No tenés acceso a esta biblioteca.");
  }
  return { ctx, proyecto, nivel, admin, alcance };
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

// Carpeta que se puede ver (y no está en la papelera, ni ella ni las de arriba). null = raíz.
async function carpetaVisible(deps, e, carpetaId) {
  if (!carpetaId) return { carpeta: null, cadena: [] };
  const cad = await cadena(deps, e, carpetaId);
  if (cad.some(c => c.eliminado)) throw error("not-found", "La carpeta está en la papelera.");
  if (!P.puedeVerCadena(cad, e.ctx.uid, e.admin)) throw error("permission-denied", "No tenés acceso a esta carpeta.");
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

const publicaCarpeta = (c, admin) => ({
  id: c.id, nombre: c.nombre, padreId: c.padreId || null, restringida: !!c.restringida,
  personas: admin ? (c.personas || []) : undefined, creadoPorNombre: c.creadoPorNombre || "", creadoEn: c.creadoEn || null,
});
const publicaArchivo = (a) => ({
  id: a.id, nombre: a.nombre, carpetaId: a.carpetaId || null, mime: a.mime || "application/octet-stream",
  tamano: a.tamano || 0, subidoPorNombre: a.subidoPorNombre || "", creadoEn: a.creadoEn || null, origen: a.origen || "masterplan",
});

// ── Operaciones ──

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function listar(deps, uid, { alcance, carpetaId }) {
  const e = await entrar(deps, uid, alcance);
  const { carpeta, cadena: cad } = await carpetaVisible(deps, e, carpetaId || null);
  const hijas = (await deps.store.carpetasHijas(e.ctx.empresaId, alcance, carpetaId || null))
    .filter(c => !c.eliminado && P.puedeVerCadena([c], uid, e.admin))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" }));
  const archivos = (await deps.store.archivosDe(e.ctx.empresaId, alcance, carpetaId || null))
    .filter(a => !a.eliminado)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" }));
  return {
    nivel: e.nivel, admin: e.admin,
    carpeta: carpeta ? publicaCarpeta(carpeta, e.admin) : null,
    ruta: cad.slice().reverse().map(c => ({ id: c.id, nombre: c.nombre })),
    carpetas: hijas.map(c => publicaCarpeta(c, e.admin)),
    archivos: archivos.map(publicaArchivo),
  };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function crearCarpeta(deps, uid, { alcance, padreId, nombre }) {
  const e = await entrar(deps, uid, alcance, { necesita: "editar" });
  const n = limpiarNombre(nombre);
  const { carpeta: padre } = await carpetaVisible(deps, e, padreId || null);
  const driveId = await deps.drive.crearCarpeta(e.ctx.empresaId, n, padre ? padre.driveId : await raizDrive(deps, e));
  const ahora = deps.ahora();
  const id = await deps.store.crearCarpeta({
    empresaId: e.ctx.empresaId, alcance, padreId: padreId || null, nombre: n, driveId,
    restringida: false, personas: [], eliminado: false, creadoPor: uid, creadoPorNombre: e.ctx.nombre || "", creadoEn: ahora, actualizadoEn: ahora,
  });
  return { id, nombre: n };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function subir(deps, uid, { alcance, carpetaId, nombre, mime, base64, origen }) {
  const e = await entrar(deps, uid, alcance, { necesita: "editar" });
  const n = limpiarNombre(nombre);
  if (typeof base64 !== "string" || !base64) throw error("invalid-argument", "Falta el archivo.");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_BYTES) throw error("invalid-argument", `"${n}" pesa más de 7 MB: por ahora no se puede subir desde la app.`);
  const { carpeta } = await carpetaVisible(deps, e, carpetaId || null);
  const padreDrive = carpeta ? carpeta.driveId : await raizDrive(deps, e);
  const tipo = String(mime || "application/octet-stream").slice(0, 120);
  const r = await deps.drive.subir(e.ctx.empresaId, n, tipo, buffer, padreDrive);
  const id = await deps.store.crearArchivo({
    empresaId: e.ctx.empresaId, alcance, carpetaId: carpetaId || null, nombre: n, mime: tipo, tamano: buffer.length,
    driveId: r.driveId, subidoPor: uid, subidoPorNombre: e.ctx.nombre || "", creadoEn: deps.ahora(), eliminado: false,
    origen: origen === "sistema" ? "sistema" : "masterplan",
  });
  return { id, nombre: n, tamano: buffer.length };
}

// Busca una carpeta o archivo de esta biblioteca que la persona puede tocar.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function elemento(deps, e, tipo, id, { incluirPapelera = false } = {}) {
  if (tipo === "carpeta") {
    const cad = await cadena(deps, e, id);
    if (!incluirPapelera && cad.some(c => c.eliminado)) throw error("not-found", "La carpeta está en la papelera.");
    if (!P.puedeVerCadena(cad, e.ctx.uid, e.admin)) throw error("permission-denied", "No tenés acceso a esta carpeta.");
    return { tipo, item: cad[0], cadena: cad };
  }
  if (tipo === "archivo") {
    const a = await deps.store.archivo(id);
    if (!a || a.empresaId !== e.ctx.empresaId || a.alcance !== e.alcance) throw error("not-found", "El archivo no existe.");
    if (!incluirPapelera && a.eliminado) throw error("not-found", "El archivo está en la papelera.");
    const cad = a.carpetaId ? await cadena(deps, e, a.carpetaId) : [];
    if (!incluirPapelera && cad.some(c => c.eliminado)) throw error("not-found", "El archivo está en la papelera.");
    if (!P.puedeVerCadena(cad, e.ctx.uid, e.admin)) throw error("permission-denied", "No tenés acceso a este archivo.");
    return { tipo, item: { id, ...a }, cadena: cad };
  }
  throw error("invalid-argument", "Tipo desconocido.");
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function renombrar(deps, uid, { alcance, tipo, id, nombre }) {
  const e = await entrar(deps, uid, alcance, { necesita: "editar" });
  const n = limpiarNombre(nombre);
  const { item } = await elemento(deps, e, tipo, id);
  await deps.drive.renombrar(e.ctx.empresaId, item.driveId, n);
  const cambios = { nombre: n, actualizadoEn: deps.ahora() };
  if (tipo === "carpeta") await deps.store.actualizarCarpeta(id, cambios); else await deps.store.actualizarArchivo(id, cambios);
  return { ok: true, nombre: n };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function mover(deps, uid, { alcance, tipo, id, destinoId }) {
  const e = await entrar(deps, uid, alcance, { necesita: "editar" });
  const { item } = await elemento(deps, e, tipo, id);
  const { carpeta: destino, cadena: cadDestino } = await carpetaVisible(deps, e, destinoId || null);
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
  const e = await entrar(deps, uid, alcance, { necesita: "editar" });
  const { item } = await elemento(deps, e, tipo, id);
  await deps.drive.papelera(e.ctx.empresaId, item.driveId, true);
  const cambios = { eliminado: true, eliminadoEn: deps.ahora(), eliminadoPor: uid };
  if (tipo === "carpeta") await deps.store.actualizarCarpeta(id, cambios); else await deps.store.actualizarArchivo(id, cambios);
  return { ok: true };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function restaurar(deps, uid, { alcance, tipo, id }) {
  const e = await entrar(deps, uid, alcance, { necesita: "editar" });
  const { item, cadena: cad } = await elemento(deps, e, tipo, id, { incluirPapelera: true });
  if (!item.eliminado) return { ok: true, sinCambios: true };
  await deps.drive.papelera(e.ctx.empresaId, item.driveId, false);
  // Si la carpeta donde estaba también está en la papelera (o ya no existe), vuelve al inicio de la biblioteca.
  const padreBorrado = tipo === "carpeta" ? cad.slice(1).some(c => c.eliminado) : cad.some(c => c.eliminado);
  const cambios = { eliminado: false, eliminadoEn: null, actualizadoEn: deps.ahora() };
  if (padreBorrado) {
    await deps.drive.mover(e.ctx.empresaId, item.driveId, await raizDrive(deps, e));
    if (tipo === "carpeta") cambios.padreId = null; else cambios.carpetaId = null;
  }
  if (tipo === "carpeta") await deps.store.actualizarCarpeta(id, cambios); else await deps.store.actualizarArchivo(id, cambios);
  return { ok: true, alInicio: padreBorrado };
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function papelera(deps, uid, { alcance }) {
  const e = await entrar(deps, uid, alcance, { necesita: "editar" });
  const { carpetas, archivos } = await deps.store.eliminados(e.ctx.empresaId, alcance);
  const visibles = [];
  for (const c of carpetas) {
    try { await elemento(deps, e, "carpeta", c.id, { incluirPapelera: true }); visibles.push({ tipo: "carpeta", ...publicaCarpeta(c, e.admin), eliminadoEn: c.eliminadoEn || null }); } catch (x) { /* sin acceso */ }
  }
  for (const a of archivos) {
    try { await elemento(deps, e, "archivo", a.id, { incluirPapelera: true }); visibles.push({ tipo: "archivo", ...publicaArchivo(a), eliminadoEn: a.eliminadoEn || null }); } catch (x) { /* sin acceso */ }
  }
  // Google Drive vacía su papelera a los 30 días: lo más viejo ya no se puede recuperar.
  const limite = new Date(new Date(deps.ahora()).getTime() - 30 * 24 * 3600 * 1000).toISOString();
  visibles.forEach(v => { v.vencido = !!(v.eliminadoEn && v.eliminadoEn < limite); });
  visibles.sort((a, b) => String(b.eliminadoEn || "").localeCompare(String(a.eliminadoEn || "")));
  return { items: visibles };
}

// Todas las carpetas que la persona ve (para "Mover a…").
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function arbol(deps, uid, { alcance }) {
  const e = await entrar(deps, uid, alcance);
  const todas = (await deps.store.todasCarpetas(e.ctx.empresaId, alcance)).filter(c => !c.eliminado);
  const porId = new Map(todas.map(c => [c.id, c]));
  // Visible = se puede ver toda la cadena hasta la raíz, y ninguna carpeta de arriba está en la papelera.
  const visible = (c) => {
    const cad = [];
    let x = c;
    for (let i = 0; x && i < 60; i++) {
      cad.push(x);
      if (!x.padreId) break;
      x = porId.get(x.padreId);
      if (!x) return false;
    }
    return P.puedeVerCadena(cad, uid, e.admin);
  };
  return { carpetas: todas.filter(visible).map(c => ({ id: c.id, nombre: c.nombre, padreId: c.padreId || null })) };
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
  const archivos = (await deps.store.todosArchivos(e.ctx.empresaId, alcance))
    .filter(a => !a.eliminado && (!a.carpetaId || ok.has(a.carpetaId)) && a.nombre.toLowerCase().includes(q))
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

// Personas que pueden entrar a esta biblioteca (para elegir quién ve una carpeta).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function personas(deps, uid, { alcance }) {
  const e = await entrar(deps, uid, alcance, { necesita: "admin" });
  const emps = await deps.store.empleadosDe(e.ctx.empresaId);
  const out = [];
  for (const emp of emps) {
    const n = P.nivelEnBiblioteca({ uid: emp.uid, empresaId: e.ctx.empresaId, esDueno: false, empleado: emp }, alcance, e.proyecto);
    if (P.puedeVer(n.nivel)) out.push({ uid: emp.uid, nombre: [emp.nombre, emp.apellido].filter(Boolean).join(" ") || emp.email || "Empleado", nivel: n.nivel, accesoTotal: !!emp.accesoTotal });
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

// Carpeta por ruta de nombres (ej. ["Comercial", "Reservas"]); crea las que falten. La usan las otras
// partes de MasterPlan para que todo lo que suban quede siempre en la biblioteca, ordenado.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// desdeId: arranca desde esa carpeta en vez del inicio (lo usa "subir una carpeta entera" de la compu).
async function asegurarRuta(deps, uid, { alcance, ruta, desdeId }) {
  const e = await entrar(deps, uid, alcance, { necesita: "editar" });
  const partes = (Array.isArray(ruta) ? ruta : []).map(limpiarNombre).slice(0, 20);
  if (desdeId) await carpetaVisible(deps, e, desdeId);
  let padreId = desdeId || null;
  for (const nombre of partes) {
    const hijas = await deps.store.carpetasHijas(e.ctx.empresaId, alcance, padreId);
    const ya = hijas.find(c => !c.eliminado && c.nombre.toLowerCase() === nombre.toLowerCase());
    padreId = ya ? ya.id : (await crearCarpeta(deps, uid, { alcance, padreId, nombre })).id;
  }
  if (padreId) await carpetaVisible(deps, e, padreId);
  return { carpetaId: padreId };
}

const ACCIONES = { listar, crearCarpeta, subir, renombrar, mover, eliminar, restaurar, papelera, arbol, buscar, acceso, personas, asegurarRuta };

module.exports = { ACCIONES, archivoPermitido, entrar, MAX_BYTES, error };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
module.exports.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
