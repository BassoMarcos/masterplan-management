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
    id: "administracion", nombre: "Administración", icono: "📊", desc: "Cobro de cuotas, mora, balances",
    paneles: [
      { id: "cobros", nombre: "Cobros y cuotas" },
      { id: "mora", nombre: "Mora" },
      { id: "caja", nombre: "Caja / Balances" },
      { id: "cierres", nombre: "Cierres" },
    ],
  },
  {
    id: "comercial", nombre: "Comercial", icono: "🤝", desc: "Estrategia de ventas y más",
    paneles: [
      { id: "datos", nombre: "Datos" },
      { id: "filtrado", nombre: "Filtrado" },
      { id: "ventas", nombre: "Ventas" },
    ],
  },
  {
    id: "legales", nombre: "Legales", icono: "⚖️", desc: "Contratos, escrituras, verificaciones",
    paneles: [
      { id: "contratos", nombre: "Contratos" },
      { id: "escrituras", nombre: "Escrituras" },
      { id: "verificaciones", nombre: "Verificaciones / trámites" },
    ],
  },
  {
    id: "desarrollos", nombre: "Desarrollos y Obras", icono: "🏗️", desc: "Etapas, lotes, avances de obra",
    paneles: [
      { id: "etapas", nombre: "Etapas" },
      { id: "lotes", nombre: "Manzanas y lotes" },
      { id: "avance", nombre: "Avance de obra" },
      { id: "infraestructura", nombre: "Infraestructura" },
      { id: "agrimensura", nombre: "Agrimensura" },
    ],
  },
];

// Devuelve los sub-paneles de un área por su id.
export function panelesDeArea(areaId) {
  const a = AREAS_DEFAULT.find(x => x.id === areaId);
  return (a && a.paneles) ? a.paneles : [];
}

// Devuelve las áreas que una empresa concreta debe ver, según su config.
export function areasVisibles(empresaData) {
  const config = empresaData?.config || {};
  const ocultas = Array.isArray(config.areasOcultas) ? config.areasOcultas : [];
  return AREAS_DEFAULT.filter(a => !ocultas.includes(a.id));
}

// Helper: ¿esta empresa tiene la personalización activada?
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
function maxNivel(a, b) { return (RANK[a] || 0) >= (RANK[b] || 0) ? (a || "ninguno") : (b || "ninguno"); }

// Lee el permiso crudo de un área dentro de un proyecto (puede ser string viejo u objeto nuevo)
function permisoAreaCrudo(empleadoData, proyectoId, areaId) {
  return empleadoData?.permisos?.proyectos?.[proyectoId]?.[areaId];
}

// Nivel del atajo "toda el área"
function nivelAtajoArea(empleadoData, proyectoId, areaId) {
  const raw = permisoAreaCrudo(empleadoData, proyectoId, areaId);
  if (!raw) return "ninguno";
  if (typeof raw === "string") return raw;          // formato viejo
  return raw._area || "ninguno";
}

// Nivel de acceso del empleado a un SUB-PANEL: combina el atajo de área con el permiso puntual
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
export function empleadoPuedeVerProyecto(empleadoData, proyectoId) {
  if (!empleadoData) return false;
  if (empleadoData.accesoTotal) return true;
  return AREAS_DEFAULT.some(a => empleadoNivelArea(empleadoData, proyectoId, a.id) !== "ninguno");
}

// Áreas visibles para un empleado dentro de un proyecto (respeta también las ocultas de la empresa)
export function areasVisiblesEmpleado(empresaData, empleadoData, proyectoId) {
  const base = areasVisibles(empresaData);
  if (!empleadoData) return base;
  if (empleadoData.accesoTotal) return base;
  return base.filter(a => empleadoNivelArea(empleadoData, proyectoId, a.id) !== "ninguno");
}

// Sub-paneles visibles para un empleado dentro de un área/proyecto
export function panelesVisiblesEmpleado(empleadoData, proyectoId, areaId) {
  const todos = panelesDeArea(areaId);
  if (!empleadoData || empleadoData.accesoTotal) return todos;
  return todos.filter(p => empleadoNivelPanel(empleadoData, proyectoId, areaId, p.id) !== "ninguno");
}

// Devuelve el uid de empresa efectivo (dueño = su uid; empleado = empresaId)
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
export function construirRecorrido(etapasExtra) {
  const extra = Array.isArray(etapasExtra) ? etapasExtra.map(e => ({
    id: e.id, label: e.label, icono: e.icono || "📌", auto: false, base: false,
  })) : [];
  return [...RECORRIDO_BASE, ...extra];
}
