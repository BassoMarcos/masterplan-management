// Pruebas de las reglas de Firestore (corren en el emulador antes de publicarlas; ver .github/workflows/deploy-reglas.yml).
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, writeBatch, query, where } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "demo-reglas",
  firestore: { rules: fs.readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8089 },
});

// Datos de base (sin reglas)
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "proyectos/p1"), { nombre: "Los Robles", empresaId: "empA" });
  await setDoc(doc(db, "proyectos/p2"), { nombre: "Otro", empresaId: "empB" });
  await setDoc(doc(db, "empleados/emp1"), { empresaId: "empA", estado: "aprobado" });
  await setDoc(doc(db, "empleados/emp2"), { empresaId: "empA", estado: "pendiente" });
  await setDoc(doc(db, "empleados/emp3"), { empresaId: "empB", estado: "aprobado" });
  await setDoc(doc(db, "proyectos/p1/lotes/l1"), { etapa: "Etapa 1", manzana: "M1", numero: "1" });
});

const como = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore();
const dueñoA = como("empA"), dueñoB = como("empB"), empleadoA = como("emp1"), pendienteA = como("emp2"),
  empleadoB = como("emp3"), superadmin = como("xyz", "marky.basso98@gmail.com"), anonimo = env.unauthenticatedContext().firestore();

const res = [];
async function caso(nombre, esperado, fn) {
  try { await (esperado ? assertSucceeds(fn()) : assertFails(fn())); res.push(["✅", nombre]); }
  catch (e) { res.push(["❌", nombre + " — " + (e.message || e).slice(0, 120)]); }
}

// LOTES (lo nuevo)
await caso("Dueño lee sus lotes", true, () => getDocs(collection(dueñoA, "proyectos/p1/lotes")));
await caso("Dueño crea un lote", true, () => setDoc(doc(dueñoA, "proyectos/p1/lotes/l2"), { numero: "2" }));
await caso("Empleado aprobado lee lotes", true, () => getDocs(collection(empleadoA, "proyectos/p1/lotes")));
await caso("Empleado aprobado guarda lote", true, () => setDoc(doc(empleadoA, "proyectos/p1/lotes/l3"), { numero: "3" }));
await caso("Empleado PENDIENTE no puede leer", false, () => getDocs(collection(pendienteA, "proyectos/p1/lotes")));
await caso("Otra empresa NO lee lotes ajenos", false, () => getDocs(collection(dueñoB, "proyectos/p1/lotes")));
await caso("Empleado de otra empresa NO escribe", false, () => setDoc(doc(empleadoB, "proyectos/p1/lotes/x"), { numero: "9" }));
await caso("Sin sesión NO lee", false, () => getDocs(collection(anonimo, "proyectos/p1/lotes")));
await caso("SuperAdmin lee", true, () => getDocs(collection(superadmin, "proyectos/p1/lotes")));

// Desarrollos y Obras (antes sin permiso) y cajones futuros más profundos
await caso("Dueño guarda una etapa de Desarrollos", true, () => setDoc(doc(dueñoA, "proyectos/p1/desarrollos_etapas/e1"), { nombre: "Etapa 1" }));
await caso("Dueño guarda cuota dentro de un contrato (futuro)", true, () => setDoc(doc(dueñoA, "proyectos/p1/contratos/c1/cuotas/q1"), { n: 1 }));
await caso("Otra empresa NO toca contratos ajenos", false, () => getDoc(doc(dueñoB, "proyectos/p1/contratos/c1/cuotas/q1")));

// Guardado del asistente: 200 lotes + el proyecto, en una sola tanda
await caso("Dueño: tanda de 200 lotes + proyecto", true, () => {
  const b = writeBatch(dueñoA);
  for (let i = 0; i < 200; i++) b.set(doc(dueñoA, `proyectos/p1/lotes/t${i}`), { numero: String(i) });
  b.update(doc(dueñoA, "proyectos/p1"), { asistente: { completo: true } });
  return b.commit();
});
await caso("Empleado aprobado: tanda de 200 lotes + proyecto", true, () => {
  const b = writeBatch(empleadoA);
  for (let i = 0; i < 200; i++) b.set(doc(empleadoA, `proyectos/p1/lotes/u${i}`), { numero: String(i) });
  b.update(doc(empleadoA, "proyectos/p1"), { nombre: "Los Robles" });
  return b.commit();
});

// Lo que ya existía sigue igual
await caso("Dueño lee su proyecto", true, () => getDoc(doc(dueñoA, "proyectos/p1")));
await caso("Otra empresa NO lee el proyecto ajeno", false, () => getDoc(doc(dueñoB, "proyectos/p1")));
await caso("Dueño renombra su proyecto", true, () => updateDoc(doc(dueñoA, "proyectos/p1"), { nombre: "Nuevo" }));
await caso("Crear proyecto nuevo", true, () => setDoc(doc(dueñoA, "proyectos/p9"), { nombre: "N", empresaId: "empA" }));

// EMPLEADOS (2026-09-29): nadie se aprueba ni se da permisos solo
const nuevo = como("nuevo1"), intruso = como("intruso1"), totalA = como("tot1");
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "empleados/tot1"), { empresaId: "empA", estado: "aprobado", accesoTotal: true, permisos: {} });
  await setDoc(doc(db, "empleados/emp4"), { empresaId: "empA", estado: "pendiente", accesoTotal: false, permisos: {}, emailVerificado: false });
});
const solicitud = { empresaId: "empA", empresaNombre: "A", email: "n@x.com", nombre: "N", apellido: "N", estado: "pendiente", legajo: "", permisos: {}, accesoTotal: false, creadoEn: "x", emailVerificado: false };
await caso("Empleado nuevo crea su solicitud pendiente (como la app)", true, () => setDoc(doc(nuevo, "empleados/nuevo1"), solicitud));
await caso("NO puede crearse ya aprobado", false, () => setDoc(doc(intruso, "empleados/intruso1"), { ...solicitud, estado: "aprobado" }));
await caso("NO puede crearse con acceso total", false, () => setDoc(doc(intruso, "empleados/intruso1"), { ...solicitud, accesoTotal: true }));
await caso("NO puede crearse con permisos", false, () => setDoc(doc(intruso, "empleados/intruso1"), { ...solicitud, permisos: { proyectos: { p1: {} } } }));
await caso("NO puede crear la solicitud de otro", false, () => setDoc(doc(intruso, "empleados/otro"), solicitud));
await caso("Empleado marca su email verificado (como la app)", true, async () => {
  const d = (await getDoc(doc(pendienteA, "empleados/emp2"))).data();
  return setDoc(doc(pendienteA, "empleados/emp2"), { ...d, emailVerificado: true });
});
await caso("Pendiente NO se aprueba solo", false, () => updateDoc(doc(pendienteA, "empleados/emp2"), { estado: "aprobado" }));
await caso("Empleado NO se da acceso total", false, () => updateDoc(doc(empleadoA, "empleados/emp1"), { accesoTotal: true }));
await caso("Empleado NO se da permisos", false, () => updateDoc(doc(empleadoA, "empleados/emp1"), { permisos: { bibliotecaGeneral: "editar" } }));
await caso("Empleado NO se cambia de empresa", false, () => updateDoc(doc(empleadoA, "empleados/emp1"), { empresaId: "empB" }));
await caso("Dueño aprueba con permisos (como la app)", true, () => updateDoc(doc(dueñoA, "empleados/emp4"), { estado: "aprobado", legajo: "7", nombre: "A", apellido: "B", permisos: { bibliotecaGeneral: "ver" }, accesoTotal: false, aprobadoEn: "x" }));
await caso("Dueño da de baja", true, () => updateDoc(doc(dueñoA, "empleados/emp4"), { estado: "baja" }));
await caso("Dueño NO pasa un empleado a otra empresa", false, () => updateDoc(doc(dueñoA, "empleados/emp4"), { empresaId: "empB", estado: "aprobado" }));
await caso("Otra empresa NO lee empleados ajenos", false, () => getDoc(doc(dueñoB, "empleados/emp1")));
await caso("Otra empresa NO toca empleados ajenos", false, () => updateDoc(doc(dueñoB, "empleados/emp1"), { estado: "baja" }));
await caso("Acceso total aprueba a otro de su empresa", true, () => updateDoc(doc(totalA, "empleados/emp4"), { estado: "aprobado" }));
await caso("Dueño lista sus empleados", true, () => getDocs(query(collection(dueñoA, "empleados"), where("empresaId", "==", "empA"))));
await caso("Dueño rechaza una solicitud", true, () => deleteDoc(doc(dueñoA, "empleados/nuevo1")));

// BIBLIOTECA (2026-09-29): solo el servidor la toca
for (const col of ["biblioteca_carpetas", "biblioteca_archivos", "biblioteca_raices"]) {
  await caso(`Dueño NO lee ${col} directo`, false, () => getDocs(query(collection(dueñoA, col), where("empresaId", "==", "empA"))));
  await caso(`Dueño NO escribe ${col} directo`, false, () => setDoc(doc(dueñoA, `${col}/x`), { empresaId: "empA" }));
  await caso(`SuperAdmin tampoco escribe ${col} directo`, false, () => setDoc(doc(superadmin, `${col}/x`), { empresaId: "empA" }));
}

res.forEach(r => console.log(r[0], r[1]));
console.log(res.every(r => r[0] === "✅") ? "\nTODAS LAS PRUEBAS OK (" + res.length + ")" : "\nHAY FALLAS");
await env.cleanup();
process.exit(res.every(r => r[0] === "✅") ? 0 : 1);
