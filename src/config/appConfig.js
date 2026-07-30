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
