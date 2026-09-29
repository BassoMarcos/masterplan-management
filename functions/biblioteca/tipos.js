// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// BIBLIOTECA — qué se puede previsualizar y cómo.
//   "directo"   → se muestra tal cual (imágenes, PDF, texto, audio, video)
//   "convertir" → Word / Excel / PowerPoint: se hace una copia en Google y se muestra como PDF
//   "exportar"  → archivos de Google (Docs, Hojas, Presentaciones): se muestran como PDF
//   null        → sin vista previa (se descarga)

const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_HOJA = "application/vnd.google-apps.spreadsheet";
const GOOGLE_PRES = "application/vnd.google-apps.presentation";

const A_GOOGLE = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": GOOGLE_DOC,
  "application/msword": GOOGLE_DOC,
  "application/vnd.oasis.opendocument.text": GOOGLE_DOC,
  "application/rtf": GOOGLE_DOC,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": GOOGLE_HOJA,
  "application/vnd.ms-excel": GOOGLE_HOJA,
  "application/vnd.oasis.opendocument.spreadsheet": GOOGLE_HOJA,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": GOOGLE_PRES,
  "application/vnd.ms-powerpoint": GOOGLE_PRES,
  "application/vnd.oasis.opendocument.presentation": GOOGLE_PRES,
};
// Al bajar un archivo de Google, en qué formato de Office sale.
const DESCARGA_GOOGLE = {
  [GOOGLE_DOC]: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx" },
  [GOOGLE_HOJA]: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx" },
  [GOOGLE_PRES]: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ".pptx" },
};

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function modoVista(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/") || m === "application/pdf" || m.startsWith("text/") || m.startsWith("audio/") || m.startsWith("video/")) return "directo";
  if (A_GOOGLE[m]) return "convertir";
  if (DESCARGA_GOOGLE[m]) return "exportar";
  return null;
}

// Nombre seguro para el encabezado de descarga (con tildes y ñ).
function disposicion(tipo, nombre) {
  const n = String(nombre || "archivo");
  const ascii = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(n)}`;
}

module.exports = { modoVista, A_GOOGLE, DESCARGA_GOOGLE, disposicion };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
module.exports.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
