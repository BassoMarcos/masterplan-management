// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// BIBLIOTECA — quién puede qué (sin Firebase ni Drive: se puede probar solo).
//
// Dos bibliotecas:
//   alcance "empresa"      → la general de la empresa. Permiso del empleado: permisos.bibliotecaGeneral.
//   alcance "p:<proyecto>" → la de cada proyecto (📚 en la pantalla del proyecto, para todas las áreas).
//                            Permiso: permisos.proyectos[<proyecto>]._biblioteca. Si nunca se guardó, vale
//                            el viejo (Legales → panel "documentacion"), así nadie pierde el acceso que tenía.
// Niveles: "ninguno" | "ver" | "editar". Dueño de la empresa y empleados con acceso total: "editar" + admin.
// Dentro, cada carpeta puede estar RESTRINGIDA a ciertas personas: la ven ellas (y los admin) y todo lo
// que tiene adentro. Si una carpeta de más arriba está restringida y la persona no está, no ve nada de abajo.

const RANGO = { ninguno: 0, ver: 1, editar: 2 };
const maxNivel = (a, b) => ((RANGO[a] || 0) >= (RANGO[b] || 0) ? (a || "ninguno") : (b || "ninguno"));

// Misma regla que appConfig.panelActivoEnProyecto (el panel puede estar apagado en el proyecto).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function panelActivo(proyecto, areaId, panelId) {
  const areas = proyecto && proyecto.estructura && proyecto.estructura.areas;
  if (!areas) return true;
  const a = areas[areaId];
  if (!a || !a.activa) return false;
  if (!Array.isArray(a.paneles)) return true;
  if (Array.isArray(a.conocidos) && !a.conocidos.includes(panelId)) return true;
  return a.paneles.includes(panelId);
}

// Nivel del empleado en un panel (atajo del área + permiso puntual), como empleadoNivelPanel del front.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function nivelPanelEmpleado(empleado, proyectoId, areaId, panelId) {
  const raw = empleado && empleado.permisos && empleado.permisos.proyectos && empleado.permisos.proyectos[proyectoId] && empleado.permisos.proyectos[proyectoId][areaId];
  if (!raw) return "ninguno";
  const nivelArea = typeof raw === "string" ? raw : (raw._area || "ninguno");
  const nivelPanel = (typeof raw === "object" && raw[panelId]) ? raw[panelId] : "ninguno";
  return maxNivel(nivelArea, nivelPanel);
}

/**
 * Nivel de una persona en una biblioteca.
 * ctx = { uid, empresaId, esDueno, empleado }   (empleado = doc de empleados/{uid} o null)
 * proyecto = doc del proyecto (solo para alcance "p:...")
 * Devuelve { nivel, admin }.
 */
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function nivelEnBiblioteca(ctx, alcance, proyecto) {
  const admin = !!(ctx.esDueno || (ctx.empleado && ctx.empleado.accesoTotal));
  if (alcance === "empresa") {
    if (admin) return { nivel: "editar", admin };
    const n = (ctx.empleado && ctx.empleado.permisos && ctx.empleado.permisos.bibliotecaGeneral) || "ninguno";
    return { nivel: RANGO[n] ? n : "ninguno", admin };
  }
  const m = /^p:(.+)$/.exec(String(alcance || ""));
  if (!m || !proyecto || proyecto.empresaId !== ctx.empresaId) return { nivel: "ninguno", admin: false };
  if (admin) return { nivel: "editar", admin };
  // (2026-09-29) La biblioteca del proyecto ya no depende de Legales (ni de que esté prendida).
  const guardado = ctx.empleado && ctx.empleado.permisos && ctx.empleado.permisos.proyectos
    && ctx.empleado.permisos.proyectos[m[1]] && ctx.empleado.permisos.proyectos[m[1]]._biblioteca;
  if (typeof guardado === "string") return { nivel: RANGO[guardado] ? guardado : "ninguno", admin };
  return { nivel: nivelPanelEmpleado(ctx.empleado, m[1], "legales", "documentacion"), admin };
}

/** ¿Puede ver una carpeta? cadena = [carpeta, padre, abuelo, ...] (de la carpeta hacia la raíz). */
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function puedeVerCadena(cadena, uid, admin) {
  if (admin) return true;
  return cadena.every(c => !c.restringida || (Array.isArray(c.personas) && c.personas.includes(uid)));
}

const puedeVer = (nivel) => (RANGO[nivel] || 0) >= 1;
const puedeEditar = (nivel) => (RANGO[nivel] || 0) >= 2;

module.exports = { RANGO, maxNivel, panelActivo, nivelPanelEmpleado, nivelEnBiblioteca, puedeVerCadena, puedeVer, puedeEditar };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
module.exports.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
