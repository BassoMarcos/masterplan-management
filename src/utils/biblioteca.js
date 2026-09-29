// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// BIBLIOTECA DE DOCUMENTOS — lo que usa la app para hablar con el servidor.
// Los archivos se guardan en el Google Drive DE CADA EMPRESA (carpeta "MasterPlan").
// MasterPlan solo guarda la lista y quién puede ver qué; todo pasa por el servidor
// (funciones "biblioteca" y "bibArchivo"), que revisa los permisos.
//
// Dos bibliotecas:
//   "empresa"        → la general de la empresa (📚 en Mis Proyectos)
//   "p:<proyectoId>" → la de cada proyecto (Legales → Biblioteca de documentos)
//
// Para que algo que se sube desde OTRA parte de MasterPlan aparezca en la biblioteca,
// usar guardarEnBiblioteca({ alcance, ruta: ["Comercial", "Reservas"], archivo }).

import { getFunctions, httpsCallable } from "firebase/functions";
import app, { auth } from "../firebase/config";

const fnBiblioteca = httpsCallable(getFunctions(app, "us-central1"), "biblioteca", { timeout: 300000 });
const URL_ARCHIVO = "https://us-central1-masterplanproyects.cloudfunctions.net/bibArchivo";

export const MAX_MB = 7; // por archivo, subiendo desde la app

/** Llama a una operación de la biblioteca (listar, crearCarpeta, subir, renombrar, mover, ...). */
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export async function bib(accion, datos) {
  try {
    const r = await fnBiblioteca({ accion, ...(datos || {}) });
    return r.data;
  } catch (e) {
    const err = new Error(mensajeError(e));
    err.code = String(e?.code || "").replace(/^functions\//, "");
    throw err;
  }
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function mensajeError(e) {
  const code = String(e?.code || "").replace(/^functions\//, "");
  if (code === "deadline-exceeded") return "Tardó demasiado. Probá de nuevo.";
  if (code === "unavailable" && !e?.message) return "No hay conexión. Probá de nuevo.";
  if (code === "internal" && /^internal$/i.test(String(e?.message || ""))) return "No se pudo completar. Probá de nuevo en un rato.";
  return e?.message || "No se pudo completar.";
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function leerBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

/** Sube un archivo de la compu a una carpeta de la biblioteca (carpetaId null = inicio). */
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export async function subirABiblioteca(alcance, carpetaId, file, origen) {
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`"${file.name}" pesa más de ${MAX_MB} MB. Por ahora se pueden subir archivos de hasta ${MAX_MB} MB.`);
  }
  const base64 = await leerBase64(file);
  return bib("subir", { alcance, carpetaId: carpetaId || null, nombre: file.name, mime: file.type || "", base64, origen });
}

/** Guarda un archivo en la biblioteca, en la carpeta indicada por nombres (la crea si no existe). */
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export async function guardarEnBiblioteca({ alcance, ruta, archivo, origen }) {
  const { carpetaId } = await bib("asegurarRuta", { alcance, ruta: ruta || [] });
  const r = await subirABiblioteca(alcance, carpetaId, archivo, origen);
  return { ...r, carpetaId };
}

/**
 * Trae un archivo para verlo o bajarlo. modo "ver" | "bajar".
 * Devuelve { blob, tipo, nombre }. Los archivos NO son públicos: va con la sesión de la persona.
 */
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export async function traerArchivo(id, modo = "ver") {
  const user = auth.currentUser;
  if (!user) throw new Error("Tenés que iniciar sesión.");
  const token = await user.getIdToken();
  let res;
  try {
    res = await fetch(`${URL_ARCHIVO}?id=${encodeURIComponent(id)}&modo=${modo}`, { headers: { Authorization: "Bearer " + token } });
  } catch (e) {
    throw new Error("No hay conexión con el servidor. Probá de nuevo.");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt && txt.length < 300 ? txt : "No se pudo abrir el archivo.");
  }
  const blob = await res.blob();
  let nombre = "";
  try { nombre = decodeURIComponent(res.headers.get("X-Nombre") || ""); } catch (e) { nombre = ""; }
  return { blob, tipo: res.headers.get("Content-Type") || blob.type, nombre };
}

/** Baja el archivo a la compu. */
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export async function descargarArchivo(archivo) {
  const { blob } = await traerArchivo(archivo.id, "bajar");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo.nombre || "archivo";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Cómo se muestra la vista previa (igual que el servidor, functions/biblioteca/tipos.js).
const OFFICE = /(wordprocessingml|msword|opendocument\.text|rtf|spreadsheetml|ms-excel|opendocument\.spreadsheet|presentationml|ms-powerpoint|opendocument\.presentation)/;
const GOOGLE = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation)$/;
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function tipoVista(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return "imagen";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("text/")) return "texto";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (OFFICE.test(m) || GOOGLE.test(m)) return "documento"; // el servidor lo pasa a PDF
  return null;
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function iconoArchivo(mime, nombre) {
  const m = String(mime || "").toLowerCase();
  const ext = String(nombre || "").toLowerCase().split(".").pop();
  if (m.startsWith("image/")) return "🖼️";
  if (m === "application/pdf" || ext === "pdf") return "📕";
  if (/wordprocessingml|msword|opendocument\.text|google-apps\.document/.test(m) || ["doc", "docx", "odt", "rtf"].includes(ext)) return "📝";
  if (/spreadsheetml|ms-excel|opendocument\.spreadsheet|google-apps\.spreadsheet|csv/.test(m) || ["xls", "xlsx", "ods", "csv"].includes(ext)) return "📊";
  if (/presentationml|ms-powerpoint|opendocument\.presentation|google-apps\.presentation/.test(m) || ["ppt", "pptx", "odp"].includes(ext)) return "📽️";
  if (m.startsWith("video/")) return "🎬";
  if (m.startsWith("audio/")) return "🎵";
  if (/zip|rar|7z|compressed/.test(m) || ["zip", "rar", "7z"].includes(ext)) return "🗜️";
  if (["dwg", "dxf"].includes(ext)) return "📐";
  if (m.startsWith("text/")) return "📃";
  return "📄";
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function tamanoLegible(bytes) {
  const b = Number(bytes || 0);
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
  return (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function fechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
bib.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
