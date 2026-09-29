// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// BIBLIOTECA — funciones de servidor:
//   biblioteca  (llamada)  → todas las operaciones: listar, crearCarpeta, subir, renombrar, mover, eliminar,
//                            restaurar, papelera, arbol, buscar, acceso, personas, asegurarRuta
//   bibArchivo  (pedido)   → ver o bajar un archivo: GET ?id=<archivo>&modo=ver|bajar
//                            con "Authorization: Bearer <token de Firebase>". Revisa permisos y trae el archivo
//                            del Drive de la empresa. Los empleados no necesitan cuenta de Drive.
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const nucleo = require("./nucleo");
const T = require("./tipos");
const { crearStore, crearDrive } = require("./adaptadores");

const ORIGENES = ["https://masterplanproyects.web.app", "https://masterplanproyects.firebaseapp.com", "http://localhost:3000"];
const CODIGOS = new Set(["invalid-argument", "not-found", "permission-denied", "failed-precondition", "unavailable", "unauthenticated"]);

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function armar({ admin, db, secretos, nuevoOAuthClient }) {
  const deps = () => ({
    store: crearStore(db),
    drive: crearDrive(db, () => nuevoOAuthClient(secretos[0].value(), secretos[1].value())),
    ahora: () => new Date().toISOString(),
  });

  const biblioteca = onCall({ secrets: secretos, region: "us-central1", memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");
    const { accion, ...datos } = request.data || {};
    const fn = nucleo.ACCIONES[accion];
    if (!fn) throw new HttpsError("invalid-argument", "Acción desconocida.");
    try {
      return await fn(deps(), request.auth.uid, datos);
    } catch (e) {
      if (CODIGOS.has(e && e.code)) throw new HttpsError(e.code, e.message);
      console.error("biblioteca", accion, e);
      throw new HttpsError("internal", "No se pudo completar. Probá de nuevo en un rato.");
    }
  });

  const bibArchivo = onRequest({ secrets: secretos, region: "us-central1", memory: "1GiB", timeoutSeconds: 300, invoker: "public" }, async (req, res) => {
    const origen = req.get("origin");
    if (origen && ORIGENES.includes(origen)) {
      res.set("Access-Control-Allow-Origin", origen);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Authorization");
      res.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, X-Nombre");
    }
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") { res.status(405).send("Método no permitido"); return; }
    try {
      const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) { res.status(401).send("Tenés que iniciar sesión."); return; }
      const { uid } = await admin.auth().verifyIdToken(token);
      const id = String(req.query.id || "");
      const modo = req.query.modo === "bajar" ? "bajar" : "ver";
      const d = deps();
      const { archivo, e } = await nucleo.archivoPermitido(d, uid, id);
      const empresaId = e.ctx.empresaId;
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Security-Policy", "sandbox");
      res.set("X-Nombre", encodeURIComponent(archivo.nombre));

      if (modo === "bajar") {
        const g = T.DESCARGA_GOOGLE[archivo.mime];
        const r = g ? await d.drive.exportar(empresaId, archivo.driveId, g.mime) : await d.drive.bajar(empresaId, archivo.driveId);
        const nombre = g && !archivo.nombre.toLowerCase().endsWith(g.ext) ? archivo.nombre + g.ext : archivo.nombre;
        res.set("Content-Type", (g ? g.mime : archivo.mime) || "application/octet-stream");
        res.set("Content-Disposition", T.disposicion("attachment", nombre));
        r.stream.pipe(res);
        return;
      }

      const modoVista = T.modoVista(archivo.mime);
      if (!modoVista) { res.status(415).send("Este tipo de archivo no tiene vista previa: descargalo."); return; }
      let r;
      if (modoVista === "directo") r = await d.drive.bajar(empresaId, archivo.driveId);
      else if (modoVista === "exportar") r = await d.drive.exportar(empresaId, archivo.driveId, "application/pdf");
      else {
        // Word / Excel / PowerPoint: copia convertida a Google (se guarda para la próxima vez) → PDF
        let vistaId = archivo.vistaDriveId;
        if (vistaId) {
          try { r = await d.drive.exportar(empresaId, vistaId, "application/pdf"); } catch (x) { vistaId = null; }
        }
        if (!vistaId) {
          const carpetaVistas = await d.drive.carpetaVistas(empresaId);
          vistaId = await d.drive.copiaConvertida(empresaId, archivo.driveId, T.A_GOOGLE[archivo.mime], carpetaVistas, "vista - " + archivo.nombre);
          await d.store.actualizarArchivo(id, { vistaDriveId: vistaId });
          r = await d.drive.exportar(empresaId, vistaId, "application/pdf");
        }
      }
      res.set("Content-Type", modoVista === "directo" ? (archivo.mime || "application/octet-stream") : "application/pdf");
      res.set("Content-Disposition", T.disposicion("inline", archivo.nombre));
      r.stream.pipe(res);
    } catch (e) {
      const status = { "permission-denied": 403, "not-found": 404, "invalid-argument": 400, "failed-precondition": 409, unavailable: 503 }[e && e.code]
        || (e && /id token|auth/i.test(String(e.code || e.message)) ? 401 : 500);
      if (status === 500) console.error("bibArchivo", e);
      if (!res.headersSent) res.status(status).send(status === 500 ? "No se pudo abrir el archivo." : String(e.message || "Error"));
    }
  });

  return { biblioteca, bibArchivo };
}

module.exports = { armar };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
module.exports.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
