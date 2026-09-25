// Pruebas de las reglas de Firestore (corren en el emulador antes de publicarlas; ver .github/workflows/deploy-reglas.yml).
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, writeBatch } from "firebase/firestore";
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

res.forEach(r => console.log(r[0], r[1]));
console.log(res.every(r => r[0] === "✅") ? "\nTODAS LAS PRUEBAS OK (" + res.length + ")" : "\nHAY FALLAS");
await env.cleanup();
process.exit(res.every(r => r[0] === "✅") ? 0 : 1);
