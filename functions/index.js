/**
 * Funciones de servidor para MasterPlan.
 * Integración con Google Drive: cada empresa conecta su cuenta una vez y
 * la app puede subir archivos a SU Drive sin pedirle permiso de nuevo.
 * Ver REGLAS.md del repo.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { google } = require("googleapis");

admin.initializeApp();
const db = admin.firestore();

// Secretos configurados en Firebase (no van en el código)
const OAUTH_CLIENT_ID = defineSecret("OAUTH_CLIENT_ID");
const OAUTH_CLIENT_SECRET = defineSecret("OAUTH_CLIENT_SECRET");

function nuevoOAuthClient(clientId, clientSecret) {
  // "postmessage" es el redirect que usa el flujo de código desde el navegador
  return new google.auth.OAuth2(clientId, clientSecret, "postmessage");
}

/** Verifica que quien llama esté logueado y devuelve el uid de su empresa. */
async function empresaDelUsuario(uid) {
  // ¿Es dueño de empresa?
  const emp = await db.collection("empresas").doc(uid).get();
  if (emp.exists) return uid;
  // ¿Es empleado aprobado?
  const empleado = await db.collection("empleados").doc(uid).get();
  if (empleado.exists && empleado.data().estado === "aprobado") {
    return empleado.data().empresaId;
  }
  throw new HttpsError("permission-denied", "No pertenecés a ninguna empresa.");
}

/**
 * Guarda la conexión de Drive de una empresa.
 * Recibe el "code" que devuelve Google al autorizar y lo cambia por un
 * permiso renovable que queda guardado.
 */
exports.drivePorConectar = onCall(
  { secrets: [OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET], region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");
    const { code } = request.data || {};
    if (!code) throw new HttpsError("invalid-argument", "Falta el código de autorización.");

    const empresaId = await empresaDelUsuario(request.auth.uid);

    const oauth2 = nuevoOAuthClient(OAUTH_CLIENT_ID.value(), OAUTH_CLIENT_SECRET.value());
    let tokens;
    try {
      const r = await oauth2.getToken(code);
      tokens = r.tokens;
    } catch (e) {
      throw new HttpsError("invalid-argument", "No se pudo validar la autorización de Google.");
    }
    if (!tokens.refresh_token) {
      throw new HttpsError("failed-precondition", "Google no devolvió un permiso renovable. Probá desconectar y conectar de nuevo.");
    }

    // Traer el email de la cuenta conectada
    oauth2.setCredentials(tokens);
    let email = null;
    try {
      const drive = google.drive({ version: "v3", auth: oauth2 });
      const about = await drive.about.get({ fields: "user(emailAddress)" });
      email = about.data.user?.emailAddress || null;
    } catch (e) { /* no es crítico */ }

    await db.collection("drive_conexiones").doc(empresaId).set({
      refreshToken: tokens.refresh_token,
      email,
      conectadoEn: new Date().toISOString(),
      conectadoPor: request.auth.uid,
    });

    return { ok: true, email };
  }
);

/** Devuelve si la empresa tiene Drive conectado y con qué cuenta. */
exports.driveEstado = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");
  const empresaId = await empresaDelUsuario(request.auth.uid);
  const snap = await db.collection("drive_conexiones").doc(empresaId).get();
  if (!snap.exists) return { conectado: false };
  return { conectado: true, email: snap.data().email || null };
});

/** Desconecta el Drive de la empresa. */
exports.driveDesconectar = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");
  const empresaId = await empresaDelUsuario(request.auth.uid);
  await db.collection("drive_conexiones").doc(empresaId).delete();
  return { ok: true };
});

/** Busca o crea una carpeta dentro del Drive de la empresa. */
async function buscarOCrearCarpeta(drive, nombre, padreId) {
  const qPadre = padreId ? ` and '${padreId}' in parents` : "";
  const res = await drive.files.list({
    q: `name='${nombre.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${qPadre}`,
    fields: "files(id,name)",
  });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
  const creada = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: "application/vnd.google-apps.folder",
      ...(padreId ? { parents: [padreId] } : {}),
    },
    fields: "id",
  });
  return creada.data.id;
}

/**
 * Sube un archivo al Drive de la empresa.
 * Recibe el archivo en base64 para no depender de la cuenta del empleado.
 */
exports.driveSubir = onCall(
  { secrets: [OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET], region: "us-central1", memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");
    const { nombre, tipo, contenidoBase64, subcarpeta } = request.data || {};
    if (!nombre || !contenidoBase64) throw new HttpsError("invalid-argument", "Falta el archivo.");

    const empresaId = await empresaDelUsuario(request.auth.uid);
    const snap = await db.collection("drive_conexiones").doc(empresaId).get();
    if (!snap.exists) throw new HttpsError("failed-precondition", "La empresa no tiene Drive conectado.");

    const oauth2 = nuevoOAuthClient(OAUTH_CLIENT_ID.value(), OAUTH_CLIENT_SECRET.value());
    oauth2.setCredentials({ refresh_token: snap.data().refreshToken });
    const drive = google.drive({ version: "v3", auth: oauth2 });

    const raizId = await buscarOCrearCarpeta(drive, "MasterPlan", null);
    const carpetaId = await buscarOCrearCarpeta(drive, subcarpeta || "General", raizId);

    const { Readable } = require("stream");
    const buffer = Buffer.from(contenidoBase64, "base64");
    const archivo = await drive.files.create({
      requestBody: { name: nombre, parents: [carpetaId] },
      media: { mimeType: tipo || "application/octet-stream", body: Readable.from(buffer) },
      fields: "id,name,webViewLink",
    });

    // Dejarlo visible por link para poder mostrarlo en la app
    try {
      await drive.permissions.create({
        fileId: archivo.data.id,
        requestBody: { role: "reader", type: "anyone" },
      });
    } catch (e) { /* no es crítico */ }

    return {
      id: archivo.data.id,
      nombre: archivo.data.name,
      link: archivo.data.webViewLink,
      verUrl: `https://drive.google.com/uc?export=view&id=${archivo.data.id}`,
    };
  }
);
