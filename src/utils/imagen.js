// Achica una imagen antes de guardarla en Firestore (límite: 1 MB por registro).
// Un logo se muestra a 64 px: con 256 px de lado se ve nítido incluso en pantallas de alta
// definición, y pesa ~10-30 KB en vez de los megas de una foto de celular.
// Usa WebP (liviano y con transparencia); si el navegador no lo soporta, PNG.
export function comprimirImagen(file, ladoMax = 256, calidad = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("El archivo no es una imagen."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * escala));
      const h = Math.max(1, Math.round(img.height * escala));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let dataUrl = canvas.toDataURL("image/webp", calidad);
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/png");
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen. Probá con un JPG o PNG."));
    };
    img.src = url;
  });
}
