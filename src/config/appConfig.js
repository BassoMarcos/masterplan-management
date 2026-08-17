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

export const AREAS_DEFAULT = [
  { id: "administracion", nombre: "Administración", icono: "📊", desc: "Cobro de cuotas, mora, balances" },
  { id: "comercial", nombre: "Comercial", icono: "🤝", desc: "Reservas, boletos, clientes" },
  { id: "legales", nombre: "Legales", icono: "⚖️", desc: "Contratos, escrituras, verificaciones" },
  { id: "desarrollos", nombre: "Desarrollos y Obras", icono: "🏗️", desc: "Etapas, lotes, avances de obra" },
];

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
// PERMISOS DE EMPLEADO
//
// Estructura del permiso de un empleado (empleados/{uid}):
//   accesoTotal: true            -> ve y edita todo, como un dueño
//   permisos: {
//     proyectos: {
//       "<proyectoId>": { administracion: "editar", comercial: "ver", ... }
//     }
//   }
// Niveles por área: "ninguno" | "ver" | "editar"
// ───────────────────────────────────────────────────────────────

// ¿El empleado puede ver este proyecto? (tiene al menos un área con acceso)
export function empleadoPuedeVerProyecto(empleadoData, proyectoId) {
  if (!empleadoData) return false;
  if (empleadoData.accesoTotal) return true;
  const proy = empleadoData.permisos?.proyectos?.[proyectoId];
  if (!proy) return false;
  return Object.values(proy).some(nivel => nivel && nivel !== "ninguno");
}

// Nivel de acceso del empleado a un área dentro de un proyecto: "ninguno" | "ver" | "editar"
export function empleadoNivelArea(empleadoData, proyectoId, areaId) {
  if (!empleadoData) return "ninguno";
  if (empleadoData.accesoTotal) return "editar";
  const nivel = empleadoData.permisos?.proyectos?.[proyectoId]?.[areaId];
  return nivel || "ninguno";
}

// Áreas visibles para un empleado dentro de un proyecto (respeta también las ocultas de la empresa)
export function areasVisiblesEmpleado(empresaData, empleadoData, proyectoId) {
  const base = areasVisibles(empresaData);
  if (!empleadoData) return base;
  if (empleadoData.accesoTotal) return base;
  return base.filter(a => empleadoNivelArea(empleadoData, proyectoId, a.id) !== "ninguno");
}

// Devuelve el uid de empresa efectivo (dueño = su uid; empleado = empresaId)
export function uidEmpresaEfectivo(currentUser, empleadoData) {
  return empleadoData?.empresaId || currentUser?.uid || null;
}
