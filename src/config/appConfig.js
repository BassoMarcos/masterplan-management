// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// Configuración central de MasterPlan.
//
// Cómo funciona:
// - Existe un esquema POR DEFECTO (las áreas que ve cualquier empresa).
// - Cada empresa puede tener, en su documento de Firestore (empresas/{uid}),
//   un campo `config` que ajusta lo que ve ESA empresa, sin afectar a las demás.
// - Si la empresa no tiene `config`, usa el default.
//
// Campo config soportado (por ahora):
//   config = {
//     personalizada: true/false,   // interruptor maestro (lo controla SuperAdmin)
//     areasOcultas: ["legales"],   // ids de áreas que esta empresa NO ve
//   }
//
// Regla de oro: el código nunca dice "F&J ve esto". El código pregunta
// "¿qué tiene configurado esta empresa?" y actúa según eso.

// Cada área tiene sus SUB-PANELES declarados acá. Para agregar un panel nuevo
// (o un área nueva), solo se edita esta lista: el sistema de permisos y las
// vistas lo toman automáticamente, sin tocar más código.
export const AREAS_DEFAULT = [
  {
    id: "administracion", nombre: "Administración", icono: "📊", desc: "Gerencia, Administración y Cobranzas",
    paneles: [
      { id: "gerencia", nombre: "Gerencia" },
      { id: "administracion", nombre: "Administración" },
      { id: "cobranzas", nombre: "Cobranzas" },
      { id: "configuracion", nombre: "Configuración" },
    ],
  },
  {
    id: "comercial", nombre: "Comercial", icono: "🤝", desc: "Contactos, filtrado y ventas",
    paneles: [
      { id: "datos", nombre: "Carga de Datos" },
      { id: "filtrado", nombre: "Filtrado" },
      { id: "ventas", nombre: "Ventas" },
    ],
  },
  {
    id: "legales", nombre: "Legales", icono: "⚖️", desc: "Contratos, escrituras, trámites y documentos",
    paneles: [
      { id: "contratos", nombre: "Contratos", icono: "📑", desc: "Boletos, cesiones y adendas" },
      { id: "escrituras", nombre: "Escrituras", icono: "🖋️", desc: "Escrituración de lotes" },
      { id: "verificaciones", nombre: "Verificaciones / trámites", icono: "✅", desc: "Chequeos y trámites legales" },
      { id: "documentacion", nombre: "Biblioteca de documentos", icono: "🗂️", desc: "Carpetas y archivos para todos" },
    ],
  },
  {
    id: "desarrollos", nombre: "Desarrollos y Obras", icono: "🏗️", desc: "Etapas, lotes, avances de obra",
    paneles: [
      { id: "etapas", nombre: "Etapas", icono: "📐", desc: "Etapas del desarrollo" },
      { id: "lotes", nombre: "Manzanas y lotes", icono: "🧩", desc: "La lista de lotes del proyecto" },
      { id: "avance", nombre: "Avance de obra", icono: "🚧", desc: "Progreso de la obra" },
      { id: "infraestructura", nombre: "Infraestructura", icono: "🔌", desc: "Agua, luz, calles" },
      { id: "agrimensura", nombre: "Agrimensura", icono: "📏", desc: "Mensuras y planos" },
    ],
  },
];

// Devuelve los sub-paneles de un área por su id.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function panelesDeArea(areaId) {
  const a = AREAS_DEFAULT.find(x => x.id === areaId);
  return (a && a.paneles) ? a.paneles : [];
}

// Devuelve las áreas que una empresa concreta debe ver, según su config.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function areasVisibles(empresaData) {
  const config = empresaData?.config || {};
  const ocultas = Array.isArray(config.areasOcultas) ? config.areasOcultas : [];
  return AREAS_DEFAULT.filter(a => !ocultas.includes(a.id));
}

// Helper: ¿esta empresa tiene la personalización activada?
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function esPersonalizada(empresaData) {
  return !!(empresaData?.config?.personalizada);
}

// ───────────────────────────────────────────────────────────────
// PERMISOS DE EMPLEADO  (autoextensible: áreas y sub-paneles se leen de AREAS_DEFAULT)
//
// Estructura del permiso de un empleado (empleados/{uid}):
//   accesoTotal: true            -> ve y edita todo, como un dueño
//   permisos: {
//     proyectos: {
//       "<proyectoId>": {
//         "<areaId>": {
//           _area: "editar"|"ver"|"ninguno",   // atajo: aplica a TODA el área (paneles actuales y futuros)
//           "<panelId>": "editar"|"ver"|"ninguno"  // permiso puntual de un sub-panel
//         }
//       }
//     }
//   }
// Niveles: "ninguno" | "ver" | "editar"
//
// Compatibilidad: si el área guarda un string ("editar"/"ver") en vez de un objeto,
// se interpreta como el atajo _area (formato viejo). Nada se rompe.
// ───────────────────────────────────────────────────────────────

const RANK = { ninguno: 0, ver: 1, editar: 2 };
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function maxNivel(a, b) { return (RANK[a] || 0) >= (RANK[b] || 0) ? (a || "ninguno") : (b || "ninguno"); }

// Lee el permiso crudo de un área dentro de un proyecto (puede ser string viejo u objeto nuevo)
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function permisoAreaCrudo(empleadoData, proyectoId, areaId) {
  return empleadoData?.permisos?.proyectos?.[proyectoId]?.[areaId];
}

// Nivel del atajo "toda el área"
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function nivelAtajoArea(empleadoData, proyectoId, areaId) {
  const raw = permisoAreaCrudo(empleadoData, proyectoId, areaId);
  if (!raw) return "ninguno";
  if (typeof raw === "string") return raw;          // formato viejo
  return raw._area || "ninguno";
}

// Nivel de acceso del empleado a un SUB-PANEL: combina el atajo de área con el permiso puntual
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function empleadoNivelPanel(empleadoData, proyectoId, areaId, panelId) {
  if (!empleadoData) return "ninguno";
  if (empleadoData.accesoTotal) return "editar";
  const raw = permisoAreaCrudo(empleadoData, proyectoId, areaId);
  if (!raw) return "ninguno";
  const nivelArea = typeof raw === "string" ? raw : (raw._area || "ninguno");
  const nivelPanel = (typeof raw === "object" && raw[panelId]) ? raw[panelId] : "ninguno";
  return maxNivel(nivelArea, nivelPanel);
}

// Nivel de acceso del empleado a un ÁREA (el mayor entre el atajo y cualquiera de sus paneles)
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function empleadoNivelArea(empleadoData, proyectoId, areaId) {
  if (!empleadoData) return "ninguno";
  if (empleadoData.accesoTotal) return "editar";
  let nivel = nivelAtajoArea(empleadoData, proyectoId, areaId);
  panelesDeArea(areaId).forEach(p => {
    nivel = maxNivel(nivel, empleadoNivelPanel(empleadoData, proyectoId, areaId, p.id));
  });
  return nivel;
}

// ¿El empleado puede ver este proyecto? (tiene al menos un área/panel con acceso)
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function empleadoPuedeVerProyecto(empleadoData, proyectoId) {
  if (!empleadoData) return false;
  if (empleadoData.accesoTotal) return true;
  return AREAS_DEFAULT.some(a => empleadoNivelArea(empleadoData, proyectoId, a.id) !== "ninguno");
}

// Áreas visibles para un empleado dentro de un proyecto (respeta también las ocultas de la empresa)
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function areasVisiblesEmpleado(empresaData, empleadoData, proyectoId) {
  const base = areasVisibles(empresaData);
  if (!empleadoData) return base;
  if (empleadoData.accesoTotal) return base;
  return base.filter(a => empleadoNivelArea(empleadoData, proyectoId, a.id) !== "ninguno");
}

// ───────────────────────────────────────────────────────────────
// ÁREAS Y PANELES POR PROYECTO
// Cada proyecto elige qué áreas y qué paneles usa (se elige en el asistente de proyecto nuevo):
//   proyectos/{id}.estructura = { areas: { "<areaId>": { activa: true|false, paneles: ["<panelId>", ...], conocidos: [...] } } }
// "conocidos" = los paneles que existían cuando se guardó: un panel que se agrega DESPUÉS a la app
// (no está en "conocidos") arranca prendido en los proyectos que ya existían.
// Siempre DENTRO de lo que el SuperAdmin habilitó para la empresa (areasVisibles): un proyecto
// no puede usar un área que la empresa no tiene. Ej.: una empresa que solo vende apaga Administración.
// Proyectos sin "estructura" (los creados antes del asistente) ven todo, como hasta ahora.
// ───────────────────────────────────────────────────────────────

// Paneles que no se pueden apagar mientras el área esté activa.
export const PANELES_SIEMPRE = { administracion: ["configuracion"] };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function areaActivaEnProyecto(proyecto, areaId) {
  const areas = proyecto?.estructura?.areas;
  if (!areas) return true;
  return !!(areas[areaId] && areas[areaId].activa);
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function panelActivoEnProyecto(proyecto, areaId, panelId) {
  if (!areaActivaEnProyecto(proyecto, areaId)) return false;
  if ((PANELES_SIEMPRE[areaId] || []).includes(panelId)) return true;
  const a = proyecto?.estructura?.areas?.[areaId];
  if (!a || !Array.isArray(a.paneles)) return true;
  if (Array.isArray(a.conocidos) && !a.conocidos.includes(panelId)) return true;
  return a.paneles.includes(panelId);
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function areasDelProyecto(areas, proyecto) {
  return areas.filter(a => areaActivaEnProyecto(proyecto, a.id));
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function panelesDelProyecto(paneles, proyecto, areaId) {
  return paneles.filter(p => panelActivoEnProyecto(proyecto, areaId, p.id));
}

// Punto de partida del asistente: lo que ya tenga el proyecto o, si es nuevo,
// todas las áreas que la empresa tiene habilitadas, con todos sus paneles.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function estructuraInicial(proyecto, areasHabilitadas) {
  const areas = {};
  areasHabilitadas.forEach(a => {
    const guardada = proyecto?.estructura?.areas?.[a.id];
    const nuevos = Array.isArray(guardada?.conocidos) ? a.paneles.map(p => p.id).filter(id => !guardada.conocidos.includes(id)) : [];
    areas[a.id] = guardada
      ? { activa: !!guardada.activa, paneles: Array.isArray(guardada.paneles) ? guardada.paneles.concat(nuevos) : a.paneles.map(p => p.id) }
      : { activa: !proyecto?.estructura, paneles: a.paneles.map(p => p.id) };
  });
  return { areas };
}

// "" si está bien, o el problema (lo usan el asistente y ⚙️ Configuración → Áreas y paneles).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function validarEstructura(estructura, areasHabilitadas) {
  const activas = Object.keys(estructura.areas).filter(id => estructura.areas[id].activa && areasHabilitadas.some(a => a.id === id));
  if (!activas.length) return "Elegí al menos un área.";
  for (const id of activas) {
    const area = AREAS_DEFAULT.find(a => a.id === id);
    const elegibles = area.paneles.filter(pn => !(PANELES_SIEMPRE[id] || []).includes(pn.id));
    if (elegibles.length && !elegibles.some(pn => estructura.areas[id].paneles.includes(pn.id))) return `En ${area.nombre}, elegí al menos un panel.`;
  }
  return "";
}

// Lo que se guarda en proyectos/{id}.estructura: todas las áreas, en orden, solo las habilitadas.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function limpiarEstructura(estructura, areasHabilitadas) {
  const out = { areas: {} };
  AREAS_DEFAULT.forEach(a => {
    const x = estructura.areas[a.id];
    const habil = areasHabilitadas.some(h => h.id === a.id);
    out.areas[a.id] = {
      activa: !!(x && x.activa && habil),
      paneles: x ? a.paneles.map(p => p.id).filter(id => x.paneles.includes(id) || (PANELES_SIEMPRE[a.id] || []).includes(id)) : [],
      conocidos: a.paneles.map(p => p.id),
    };
  });
  return out;
}

// Sub-paneles visibles para un empleado dentro de un área/proyecto
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function panelesVisiblesEmpleado(empleadoData, proyectoId, areaId) {
  const todos = panelesDeArea(areaId);
  if (!empleadoData || empleadoData.accesoTotal) return todos;
  return todos.filter(p => empleadoNivelPanel(empleadoData, proyectoId, areaId, p.id) !== "ninguno");
}

// Devuelve el uid de empresa efectivo (dueño = su uid; empleado = empresaId)
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function uidEmpresaEfectivo(currentUser, empleadoData) {
  return empleadoData?.empresaId || currentUser?.uid || null;
}

// ───────────────────────────────────────────────────────────────
// RECORRIDO DEL CONTACTO (Comercial → Ventas)
// Las 8 etapas base. Las 3 primeras son automáticas y NO se tocan.
// El admin puede agregar etapas nuevas (título + fecha/hora + nota), que se
// guardan en comercial_config y se suman al final. Las base no se borran.
// ───────────────────────────────────────────────────────────────
export const RECORRIDO_BASE = [
  { id: "contacto", label: "Contacto", icono: "📇", auto: true, base: true },
  { id: "filtro", label: "Filtro", icono: "🔍", auto: true, base: true },
  { id: "llamado", label: "Llamado", icono: "📞", auto: true, base: true },
  { id: "visita", label: "Visita programada", icono: "📅", auto: false, base: true },
  { id: "compra", label: "Compra confirmada", icono: "🤝", auto: false, base: true },
  { id: "reserva", label: "Reserva", icono: "📝", auto: false, base: true },
  { id: "firma_prog", label: "Firma programada", icono: "🗓️", auto: false, base: true },
  { id: "firma", label: "Firma / Venta", icono: "✅", auto: false, base: true },
];

// Combina las etapas base con las personalizadas guardadas en la config.
// etapasExtra: array de { id, label } guardado en comercial_config.recorridoExtra
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function construirRecorrido(etapasExtra) {
  const extra = Array.isArray(etapasExtra) ? etapasExtra.map(e => ({
    id: e.id, label: e.label, icono: e.icono || "📌", auto: false, base: false,
  })) : [];
  return [...RECORRIDO_BASE, ...extra];
}

// Qué pasos automáticos (contacto/filtro/llamado) tiene un dato según su pipeline
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function pasosAutomaticosDe(d) {
  const hechos = { contacto: true };
  const filtrado = (d.respuestasFiltro && Object.keys(d.respuestasFiltro).length > 0) || d.filtradoEn || ["filtrado", "en_venta", "vendido"].includes(d.estado);
  if (filtrado) hechos.filtro = true;
  if (d.ventaEstado || d.vendedorUid) hechos.llamado = true;
  return hechos;
}

// Índice de la etapa actual (última alcanzada) de un dato, dado un recorrido
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function etapaActualIdxDe(d, recorrido) {
  const auto = pasosAutomaticosDe(d);
  const rec = d.recorrido || {};
  let idx = 0;
  recorrido.forEach((p, i) => {
    if (p.auto ? auto[p.id] : rec[p.id]) idx = i;
  });
  return idx;
}

// Etiqueta de la etapa actual de un dato (para mostrar el mismo estado en todos lados)
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function etiquetaEtapa(d, etapasExtra) {
  const recorrido = construirRecorrido(etapasExtra);
  const idx = etapaActualIdxDe(d, recorrido);
  const paso = recorrido[idx];
  // Si la compra fue rechazada, mostrar "Descartado"
  if (d.recorrido?.compra?.resultado === "rechazo") return "Descartado";
  return paso ? paso.label : "Contacto";
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
panelesDeArea.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
