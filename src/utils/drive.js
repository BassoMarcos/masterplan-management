// Integración con Google Drive.
// Cada empresa conecta su propia cuenta; los archivos se guardan en SU Drive,
// dentro de una carpeta "MasterPlan". Ver REGLAS.md.

const CLIENT_ID = "681398558610-f5u16d326fq594mvvagk08s0km4t1u6p.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const CARPETA_RAIZ = "MasterPlan";

let tokenClient = null;
// La conexión es POR EMPRESA: cada una autoriza su propio Drive.
// { [empresaUid]: { token, expira } }
const sesiones = {};
let empresaActual = null;

// Define con qué empresa se está trabajando (llamar al entrar a la app)
export function setEmpresaDrive(uid) {
  empresaActual = uid || null;
}

function sesion() {
  if (!empresaActual) return null;
  return sesiones[empresaActual] || null;
}

// Carga el script de Google Identity Services una sola vez
function cargarGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existente = document.getElementById("gis-script");
    if (existente) { existente.addEventListener("load", () => resolve()); return; }
    const s = document.createElement("script");
    s.id = "gis-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(s);
  });
}

// Pide autorización al usuario (abre la ventana de Google)
export async function conectarDrive() {
  await cargarGIS();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        if (!empresaActual) { reject(new Error("No hay empresa seleccionada")); return; }
        sesiones[empresaActual] = {
          token: resp.access_token,
          expira: Date.now() + (resp.expires_in || 3600) * 1000,
        };
        resolve(resp.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

// Devuelve un token válido (pide de nuevo si venció)
export async function obtenerToken() {
  const s = sesion();
  if (s && Date.now() < s.expira - 60000) return s.token;
  await cargarGIS();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        if (!empresaActual) { reject(new Error("No hay empresa seleccionada")); return; }
        sesiones[empresaActual] = {
          token: resp.access_token,
          expira: Date.now() + (resp.expires_in || 3600) * 1000,
        };
        resolve(resp.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

// Devuelve el email de la cuenta de Drive conectada
export async function emailConectado() {
  const s = sesion();
  if (!s) return null;
  if (s.email) return s.email;
  try {
    const r = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)", {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    s.email = data.user?.emailAddress || null;
    return s.email;
  } catch { return null; }
}

export function hayConexion() {
  const s = sesion();
  return !!s && Date.now() < s.expira;
}

export function desconectar() {
  const s = sesion();
  if (s?.token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(s.token, () => {});
  }
  if (empresaActual) delete sesiones[empresaActual];
}

// Busca (o crea) una carpeta dentro de Drive. Devuelve su id.
async function buscarOCrearCarpeta(nombre, padreId = null) {
  const token = await obtenerToken();
  const qPadre = padreId ? ` and '${padreId}' in parents` : "";
  const q = encodeURIComponent(`name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false${qPadre}`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  if (data.files && data.files.length > 0) return data.files[0].id;

  // No existe: la creamos
  const body = { name: nombre, mimeType: "application/vnd.google-apps.folder" };
  if (padreId) body.parents = [padreId];
  const rc = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const creada = await rc.json();
  return creada.id;
}

// Sube un archivo a Drive dentro de MasterPlan/<subcarpeta>. Devuelve {id, link}.
export async function subirArchivo(file, subcarpeta = "General") {
  const token = await obtenerToken();
  const raizId = await buscarOCrearCarpeta(CARPETA_RAIZ);
  const carpetaId = await buscarOCrearCarpeta(subcarpeta, raizId);

  const metadata = { name: file.name, parents: [carpetaId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!r.ok) throw new Error("No se pudo subir el archivo a Drive");
  const data = await r.json();

  // Dejarlo accesible por link para poder mostrarlo en la app
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  }).catch(() => {});

  return {
    id: data.id,
    nombre: data.name,
    link: data.webViewLink,
    // URL directa para mostrar imágenes
    verUrl: `https://drive.google.com/uc?export=view&id=${data.id}`,
  };
}
