import { db } from "../firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// Crea una notificación. Ver REGLAS.md del repo.
// tipo: "actualizacion" | "trabajo"
export async function crearNotificacion({ tipo = "trabajo", titulo, detalle, areas = [], paneles = [], soloEmpresaId = null, paraUid = null }) {
  try {
    await addDoc(collection(db, "notificaciones"), {
      tipo, titulo, detalle,
      areas, paneles,
      soloEmpresaId, paraUid,
      fecha: serverTimestamp(),
      fechaMs: Date.now(),
    });
  } catch (e) {
    console.error("No se pudo crear la notificación:", e);
  }
}
