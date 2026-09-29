// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// QUÉ SE CONFIGURA EN CADA ÁREA (sin pantallas).
// Es la lista que usan ⚙️ Configuración (central, de un área o de la empresa) y los botones ⚙️
// de cada área. Para sumar una opción nueva a un área, se agrega acá como un ítem de su grupo
// (y su pantalla en Configuracion.js). Un área nueva de AREAS_DEFAULT aparece sola (con
// "Lo que viene" hasta que tenga opciones).
import { AREAS_DEFAULT, areasVisibles, areaActivaEnProyecto, panelActivoEnProyecto } from "./appConfig";

// Secciones de Administración ("grupo" = el título chico que las agrupa en las pestañas).
export const SECCIONES_ADMIN = [
  { grupo: "Cuotas", id: "financiacion", icono: "💳", nombre: "Financiación", resumen: "Monedas e incrementos" },
  { grupo: "Cuotas", id: "mora", icono: "⚠️", nombre: "Mora", resumen: "Interés por atraso" },
  { grupo: "Cuotas", id: "avisosMora", icono: "📲", nombre: "Avisos de mora", resumen: "Grupos de morosos y WhatsApp" },
  { grupo: "Cuotas", id: "adelantos", icono: "⏩", nombre: "Adelantos", resumen: "Pagar cuotas antes" },
  { grupo: "Cuotas", id: "transferencias", icono: "🏦", nombre: "Transferencias", resumen: "Impuesto sobre transferencias" },
  { grupo: "Cobros", id: "permisos", icono: "🔐", nombre: "Permisos de cobro", resumen: "Quién puede hacer qué" },
  { grupo: "Cobros", id: "diferencias", icono: "⚖️", nombre: "Diferencias al cobrar", resumen: "Saldo a favor o en contra" },
  { grupo: "Cobros", id: "recibos", icono: "🧾", nombre: "Recibos", resumen: "Comprobante del pago" },
  { grupo: "Cobros", id: "cierre", icono: "🗓️", nombre: "Cierre del mes", resumen: "Respaldos y simulador" },
  { grupo: "Casos", id: "especiales", icono: "⭐", nombre: "Casos especiales", resumen: "Préstamos, escalonado, etc." },
  { grupo: "Casos", id: "terminados", icono: "🏁", nombre: "Lotes terminados", resumen: "Certificado de fin de pago" },
  { grupo: "Plata", id: "distribucion", icono: "📊", nombre: "Dueños", resumen: "Distribución de ganancias" },
  { grupo: "Plata", id: "cajas", icono: "🗃️", nombre: "Cajas separadas", resumen: "Lotes que no van a la caja central" },
];

// Lo que se va a sumar a cada área (acordado con Marcos, ESQUEMA_ADMIN_FYJ.md §13).
export const LO_QUE_VIENE = {
  desarrollos: [
    "Etapas con fecha de lanzamiento y de posesión",
    "Ficha de cada lote: superficie, frente y fondo, esquina, catastro",
    "Estados del lote con su color (se sincroniza con Comercial y el plano)",
    "Plano del loteo pintado según el estado de cada lote",
    "Servicios de cada etapa (agua, luz, gas, cloacas, calles) y su avance",
    "Trámites: mensura, subdivisión, factibilidades (se sincroniza con Legales)",
    "Reglas para construir: retiros, altura máxima",
    "Agenda de proveedores, contratistas y contactos",
  ],
  comercial: [
    "Lista de precios por lote, etapa o zona (se sincroniza con Administración)",
    "Precio de contado y financiado, descuento por contado",
    "Anticipo mínimo y cuotas máximas por defecto (se completan solos al elegir el lote)",
    "Reserva: cuántos días dura, seña, si se devuelve",
    "Vendedores: comisión y cuándo se paga",
    "Qué lotes se muestran a la venta",
    "Datos que se le piden al cliente (con opción de agregar)",
    "De dónde llegan los contactos y motivos de descarte",
    "Aviso cuando un contacto pasa días sin atención",
    "Mensajes de WhatsApp para el seguimiento",
    "Meta de ventas por mes",
  ],
  legales: [
    "Datos de la desarrolladora y quiénes firman",
    "Modelos de documentos: reserva, boleto, cesión, posesión, intimación (y agregar más)",
    "Pasos hasta la escritura y qué destraba cada uno",
    "Papeles que se le piden al cliente",
    "Escribanías, cuánto cobran y quién paga",
    "Mora legal: carta documento y rescisión (se sincroniza con Administración)",
    "Firma en persona o digital",
  ],
  empresa: [
    "Logo, colores, teléfono y mail de la empresa",
    "Avisos: qué se notifica y a quién",
    "Cambiar el mail de la cuenta",
  ],
};

const item = (id, icono, nombre, resumen, extra) => ({ id, icono, nombre, resumen, ...(extra || {}) });
const pronto = (area) => item("pronto", "🔜", "Lo que viene", "Opciones que se suman más adelante", { lista: LO_QUE_VIENE[area] || [] });

// Empresa: vale para TODOS los proyectos (cuenta, código para empleados, Drive, empleados).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function grupoEmpresa() {
  return {
    id: "empresa", icono: "🏢", nombre: "Empresa", resumen: "Cuenta, empleados, Drive", puedeEditar: true,
    items: [
      item("cuenta", "👤", "Cuenta", "Mail y contraseña"),
      item("codigo", "🔑", "Código de la empresa", "Para que tu equipo se registre"),
      item("drive", "📁", "Google Drive", "Dónde se guardan los archivos"),
      item("empleados", "👥", "Empleados y permisos", "Quién entra y qué ve"),
      pronto("empresa"),
    ],
  };
}

// Opciones de cada área dentro de un proyecto (según permisos). [] = esa persona no configura nada ahí.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function itemsDeArea(areaId, { proyecto, esAdminEf, nivel }) {
  const items = [];
  if (areaId === "desarrollos") {
    const n = nivel("desarrollos", "lotes");
    if (panelActivoEnProyecto(proyecto, "desarrollos", "lotes") && n !== "ninguno") {
      items.push(item("lotes", "🧩", "Manzanas y lotes", "La lista de lotes del proyecto", { puedeEditar: n === "editar" }));
    }
  } else if (areaId === "administracion") {
    const n = nivel("administracion", "configuracion");
    if (n !== "ninguno") SECCIONES_ADMIN.forEach(x => items.push(item(x.id, x.icono, x.nombre, x.resumen, { subgrupo: x.grupo, puedeEditar: n === "editar" })));
  } else if (areaId === "comercial") {
    const nv = nivel("comercial", "ventas");
    const nf = nivel("comercial", "filtrado");
    if (nv !== "ninguno") items.push(item("recorrido", "🛤️", "Recorrido y reserva", "Etapas, WhatsApp de firma, formulario de reserva", { puedeEditar: nv === "editar" }));
    if (nf !== "ninguno") items.push(item("filtro", "🔍", "Formulario de filtro", "Preguntas del primer llamado", { puedeEditar: nf === "editar" }));
  }
  if (esAdminEf && areaId !== "administracion") items.push(pronto(areaId));
  return items;
}

// Todos los grupos de ⚙️ Configuración de un proyecto: Proyecto, cada área activa (en el orden
// de AREAS_DEFAULT) y Empresa. nivel(area, panel) → "ninguno" | "ver" | "editar".
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function armarGrupos({ proyecto, empresaData, esAdminEf, nivel }) {
  const habil = areasVisibles(empresaData).map(a => a.id);
  const activa = (id) => habil.includes(id) && areaActivaEnProyecto(proyecto, id);
  const lotesEnDesarrollos = activa("desarrollos") && panelActivoEnProyecto(proyecto, "desarrollos", "lotes");
  const usaLotes = activa("administracion") || activa("comercial") || activa("desarrollos");
  const grupos = [];

  if (esAdminEf) {
    const items = [
      item("datos", "📝", "Datos del proyecto", "Tipo, dirección, localidad"),
      item("areas", "🧱", "Áreas y paneles", "Qué usa este proyecto"),
    ];
    if (usaLotes && !lotesEnDesarrollos) items.push(item("lotes", "🧩", "Lotes", "La lista de lotes del proyecto"));
    grupos.push({ id: "proyecto", icono: "📁", nombre: "Proyecto", resumen: "Datos, áreas y paneles", items, puedeEditar: true });
  }

  AREAS_DEFAULT.forEach(a => {
    if (!activa(a.id)) return;
    const items = itemsDeArea(a.id, { proyecto, esAdminEf, nivel });
    if (items.length) grupos.push({ id: a.id, icono: a.icono, nombre: a.nombre, resumen: a.desc, items, puedeEditar: true });
  });

  if (esAdminEf) grupos.push(grupoEmpresa());
  return grupos;
}

// ¿Esta persona tiene algo para configurar en esa área? (para mostrar el ⚙️ en la entrada del área)
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function tieneConfiguracion(areaId, ctx) {
  return armarGrupos(ctx).some(g => g.id === areaId);
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
grupoEmpresa.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
