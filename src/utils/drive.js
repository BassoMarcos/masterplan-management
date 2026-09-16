// Integración con Google Drive.
// La empresa conecta su cuenta UNA vez; el permiso queda guardado en el servidor
// y cualquier empleado puede subir archivos al Drive de la empresa. Ver REGLAS.md.

import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../firebase/config";

const CLIENT_ID = "681398558610-f5u16d326fq594mvvagk08s0km4t1u6p.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const functions = getFunctions(app, "us-central1");
const fnConectar = httpsCallable(functions, "drivePorConectar");
const fnEstado = httpsCallable(functions, "driveEstado");
const fnDesconectar = httpsCallable(functions, "driveDesconectar");
const fnSubir = httpsCallable(functions, "driveSubir");

// Carga el script de Google Identity Services una sola vez
function cargarGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existente = document.getElementById("gis-script");
    if (existente) { existente.addEventListener("load", () => resolve()); return; }
    const s = document.createElement("script");
    s.id = "gis-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Google"));
    document.head.appendChild(s);
  });
}

/** Abre la ventana de Google para que la empresa autorice su Drive. */
export async function conectarDrive() {
  await cargarGIS();
  const code = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ux_mode: "popup",
      callback: (resp) => {
        if (resp.error || !resp.code) { reject(new Error(resp.error || "No se autorizó")); return; }
        resolve(resp.code);
      },
    });
    client.requestCode();
  });
  // El servidor cambia el código por un permiso permanente y lo guarda
  const r = await fnConectar({ code });
  return r.data; // { ok, email }
}

/** Consulta si la empresa tiene Drive conectado. */
export async function estadoDrive() {
  try {
    const r = await fnEstado();
    return r.data; // { conectado, email }
  } catch (e) {
    return { conectado: false };
  }
}

/** Desconecta el Drive de la empresa. */
export async function desconectarDrive() {
  await fnDesconectar();
}

/** Sube un archivo al Drive de la empresa (pasa por el servidor). */
export async function subirArchivo(file, subcarpeta = "General") {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
  const r = await fnSubir({
    nombre: file.name,
    tipo: file.type,
    contenidoBase64: base64,
    subcarpeta,
  });
  return r.data; // { id, nombre, link, verUrl }
}
