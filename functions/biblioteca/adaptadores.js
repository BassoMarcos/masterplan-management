// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// BIBLIOTECA — conexión real con Firestore (índice y permisos) y con el Drive de cada empresa.
const { drive: driveApi } = require("@googleapis/drive"); // solo Drive: carga mucho más rápido que "googleapis"
const { Readable } = require("stream");

// Conexiones con el Drive de cada empresa que quedan abiertas entre pedidos (mientras el servidor
// esté despierto): así no hay que pedirle a Google una llave nueva en cada foto que se abre.
const CONEXIONES = new Map(); // empresaId → { refreshToken, drive, auth, leidaEn }
const RELEER_MS = 5 * 60 * 1000;

const CARPETA = "application/vnd.google-apps.folder";

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function crearStore(db) {
  const col = (n) => db.collection(n);
  const conId = (d) => ({ id: d.id, ...d.data() });
  const q = async (ref) => (await ref.get()).docs.map(conId);
  return {
    async contexto(uid) {
      const emp = await col("empresas").doc(uid).get();
      if (emp.exists) return { uid, empresaId: uid, esDueno: true, empleado: null, nombre: emp.data().nombre || emp.data().email || "Dueño" };
      const e = await col("empleados").doc(uid).get();
      if (e.exists && e.data().estado === "aprobado" && e.data().empresaId) {
        return { uid, empresaId: e.data().empresaId, esDueno: false, empleado: e.data(), nombre: [e.data().nombre, e.data().apellido].filter(Boolean).join(" ") || e.data().email || "Empleado" };
      }
      return null;
    },
    async proyecto(id) { const d = await col("proyectos").doc(id).get(); return d.exists ? d.data() : null; },
    async raiz(empresaId, alcance) { const d = await col("biblioteca_raices").doc(`${empresaId}__${alcance}`).get(); return d.exists ? d.data() : null; },
    async guardarRaiz(empresaId, alcance, data) { await col("biblioteca_raices").doc(`${empresaId}__${alcance}`).set({ ...data, empresaId, alcance }); },
    async carpeta(id) { const d = await col("biblioteca_carpetas").doc(id).get(); return d.exists ? d.data() : null; },
    async carpetasHijas(empresaId, alcance, padreId) {
      return q(col("biblioteca_carpetas").where("empresaId", "==", empresaId).where("alcance", "==", alcance).where("padreId", "==", padreId || null));
    },
    async crearCarpeta(data) { return (await col("biblioteca_carpetas").add(data)).id; },
    async actualizarCarpeta(id, cambios) { await col("biblioteca_carpetas").doc(id).update(cambios); },
    async archivo(id) { const d = await col("biblioteca_archivos").doc(id).get(); return d.exists ? d.data() : null; },
    async archivosDe(empresaId, alcance, carpetaId) {
      return q(col("biblioteca_archivos").where("empresaId", "==", empresaId).where("alcance", "==", alcance).where("carpetaId", "==", carpetaId || null));
    },
    async crearArchivo(data) { return (await col("biblioteca_archivos").add(data)).id; },
    async actualizarArchivo(id, cambios) { await col("biblioteca_archivos").doc(id).update(cambios); },
    async eliminados(empresaId, alcance) {
      const base = (n) => col(n).where("empresaId", "==", empresaId).where("alcance", "==", alcance).where("eliminado", "==", true);
      return { carpetas: await q(base("biblioteca_carpetas")), archivos: await q(base("biblioteca_archivos")) };
    },
    async todasCarpetas(empresaId, alcance) { return q(col("biblioteca_carpetas").where("empresaId", "==", empresaId).where("alcance", "==", alcance)); },
    async todosArchivos(empresaId, alcance) { return q(col("biblioteca_archivos").where("empresaId", "==", empresaId).where("alcance", "==", alcance)); },
    async empleadosDe(empresaId) {
      return (await q(col("empleados").where("empresaId", "==", empresaId).where("estado", "==", "aprobado"))).map(e => ({ uid: e.id, ...e }));
    },
  };
}

// Drive de la empresa, con la llave guardada al conectar (drive_conexiones/{empresaId}).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function crearDrive(db, nuevoOAuthClient) {
  async function cliente(empresaId) {
    const ya = CONEXIONES.get(empresaId);
    if (ya && Date.now() - ya.leidaEn < RELEER_MS) return ya;
    const snap = await db.collection("drive_conexiones").doc(empresaId).get();
    if (!snap.exists) { CONEXIONES.delete(empresaId); const e = new Error("La empresa no tiene el Google Drive conectado. Conectalo en ⚙️ Configuración → Empresa → Google Drive."); e.code = "failed-precondition"; throw e; }
    const refreshToken = snap.data().refreshToken;
    if (ya && ya.refreshToken === refreshToken) { ya.leidaEn = Date.now(); return ya; }
    const auth = nuevoOAuthClient();
    auth.setCredentials({ refresh_token: refreshToken });
    const c = { refreshToken, auth, drive: driveApi({ version: "v3", auth }), leidaEn: Date.now() };
    CONEXIONES.set(empresaId, c);
    return c;
  }
  // Traduce los errores de Google a algo que se entienda.
  const conDrive = async (empresaId, fn) => {
    try { const c = await cliente(empresaId); return await fn(c.drive, c.auth); }
    catch (e) {
      if (e && e.code === "failed-precondition") throw e;
      const txt = String((e && e.message) || "") + " " + JSON.stringify((e && e.response && e.response.data) || {});
      if (/invalid_grant/.test(txt)) CONEXIONES.delete(empresaId); // la próxima vez relee la conexión (por si la reconectaron)
      const status = Number((e && (e.status || (e.response && e.response.status))) || e.code || 0);
      if (status === 404 || /File not found/i.test(txt)) {
        const nf = new Error("Ya no está en el Google Drive de la empresa (lo borraron desde el Drive, o pasaron más de 30 días en la papelera).");
        nf.code = "not-found";
        throw nf;
      }
      const err = new Error(/invalid_grant/.test(txt)
        ? "La conexión con Google Drive se venció. Volvé a conectarla en ⚙️ Configuración → Empresa → Google Drive."
        : "Google Drive no respondió bien: " + ((e && e.message) || "error desconocido"));
      err.code = /invalid_grant/.test(txt) ? "failed-precondition" : "unavailable";
      throw err;
    }
  };
  async function buscarOCrear(drive, nombre, padreId) {
    const qPadre = padreId ? ` and '${padreId}' in parents` : "";
    const res = await drive.files.list({ q: `name='${nombre.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType='${CARPETA}' and trashed=false${qPadre}`, fields: "files(id)" });
    if (res.data.files && res.data.files.length) return res.data.files[0].id;
    return (await drive.files.create({ requestBody: { name: nombre, mimeType: CARPETA, ...(padreId ? { parents: [padreId] } : {}) }, fields: "id" })).data.id;
  }
  return {
    carpetaMasterPlan: (empresaId) => conDrive(empresaId, d => buscarOCrear(d, "MasterPlan", null)),
    carpetaVistas: (empresaId) => conDrive(empresaId, async d => buscarOCrear(d, "Vistas previas (no tocar)", await buscarOCrear(d, "MasterPlan", null))),
    crearCarpeta: (empresaId, nombre, padreId) => conDrive(empresaId, async d =>
      (await d.files.create({ requestBody: { name: nombre, mimeType: CARPETA, parents: [padreId] }, fields: "id" })).data.id),
    subir: (empresaId, nombre, mime, buffer, padreId) => conDrive(empresaId, async d => {
      const r = await d.files.create({ requestBody: { name: nombre, parents: [padreId] }, media: { mimeType: mime, body: Readable.from(buffer) }, fields: "id,size" });
      return { driveId: r.data.id };
    }),
    renombrar: (empresaId, driveId, nombre) => conDrive(empresaId, d => d.files.update({ fileId: driveId, requestBody: { name: nombre }, fields: "id" })),
    mover: (empresaId, driveId, nuevoPadre) => conDrive(empresaId, async d => {
      const f = await d.files.get({ fileId: driveId, fields: "parents" });
      const viejos = (f.data.parents || []).join(",");
      await d.files.update({ fileId: driveId, addParents: nuevoPadre, removeParents: viejos, fields: "id" });
    }),
    papelera: (empresaId, driveId, enPapelera) => conDrive(empresaId, d => d.files.update({ fileId: driveId, requestBody: { trashed: !!enPapelera }, fields: "id" })),
    // Contenido original (stream). El tipo ya está guardado en la lista: no se le pregunta a Drive (es más rápido).
    bajar: (empresaId, driveId) => conDrive(empresaId, async d => {
      const r = await d.files.get({ fileId: driveId, alt: "media" }, { responseType: "stream" });
      return { stream: r.data };
    }),
    // Miniatura que arma Google Drive (fotos, PDF, documentos, videos). null = Drive no tiene (todavía).
    miniatura: (empresaId, driveId, tam) => conDrive(empresaId, async (d, auth) => {
      const f = await d.files.get({ fileId: driveId, fields: "thumbnailLink" });
      const link = f.data.thumbnailLink;
      if (!link) return null;
      try {
        const r = await auth.request({ url: link.replace(/=s\d+$/, "") + "=s" + (tam || 220), responseType: "arraybuffer" });
        const h = r.headers || {};
        const mime = (typeof h.get === "function" ? h.get("content-type") : h["content-type"]) || "image/jpeg";
        return { buffer: Buffer.from(r.data), mime };
      } catch (e) {
        console.warn("miniatura: Drive no entregó la imagen chica", (e && (e.status || (e.response && e.response.status))) || "", String((e && e.message) || "").slice(0, 120));
        throw e;
      }
    }),
    exportar: (empresaId, driveId, mime) => conDrive(empresaId, async d => {
      const r = await d.files.export({ fileId: driveId, mimeType: mime }, { responseType: "stream" });
      return { stream: r.data, mime };
    }),
    // Copia convertida a Google (Docs/Hojas/Presentaciones) para poder mostrarla como PDF.
    copiaConvertida: (empresaId, driveId, mimeGoogle, carpetaId, nombre) => conDrive(empresaId, async d =>
      (await d.files.copy({ fileId: driveId, requestBody: { mimeType: mimeGoogle, parents: [carpetaId], name: nombre }, fields: "id" })).data.id),
  };
}

module.exports = { crearStore, crearDrive };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
module.exports.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
