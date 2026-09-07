import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { collection, query, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { panelesVisiblesEmpleado } from "../config/appConfig";

// Campanita de notificaciones: novedades del sistema + avisos de trabajo.
export default function Notificaciones() {
  const { currentUser, empleadoData, empresaUid, esEmpleado } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState([]);
  const [leidas, setLeidas] = useState({}); // { notifId: true }
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!currentUser) return;
    setCargando(true);
    try {
      // 1. Notificaciones generales (actualizaciones)
      const q = query(collection(db, "notificaciones"));
      const snap = await getDocs(q);
      let lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Filtrar por empresa puntual
      lista = lista.filter(n => !n.soloEmpresaId || n.soloEmpresaId === empresaUid);

      // Filtrar por destinatario puntual (avisos de trabajo)
      lista = lista.filter(n => !n.paraUid || n.paraUid === currentUser.uid);

      // Filtrar por paneles si es empleado normal
      if (esEmpleado && !empleadoData?.accesoTotal) {
        lista = lista.filter(n => {
          if (n.paraUid === currentUser.uid) return true; // avisos personales siempre
          if (!Array.isArray(n.paneles) || n.paneles.length === 0) return true; // para todos
          // ¿tiene acceso a alguno de esos paneles en algún proyecto?
          const proyectos = Object.keys(empleadoData?.permisos?.proyectos || {});
          return proyectos.some(pid => {
            const vis = panelesVisiblesEmpleado(empleadoData, pid, n.areas?.[0] || "comercial");
            return vis.some(p => n.paneles.includes(p.id));
          });
        });
      }

      lista.sort((a, b) => (b.fechaMs || 0) - (a.fechaMs || 0));
      setItems(lista.slice(0, 50));

      // 2. Estado de leídas del usuario
      const snapL = await getDoc(doc(db, "notif_leidas", currentUser.uid));
      setLeidas(snapL.exists() ? (snapL.data().leidas || {}) : {});
    } catch (e) {
      console.error("notificaciones:", e);
    }
    setCargando(false);
  }, [currentUser, empleadoData, empresaUid, esEmpleado]);

  useEffect(() => { cargar(); }, [cargar]);

  const noLeidas = items.filter(n => !leidas[n.id]).length;

  async function marcarLeida(id) {
    const nuevas = { ...leidas, [id]: true };
    setLeidas(nuevas);
    try { await setDoc(doc(db, "notif_leidas", currentUser.uid), { leidas: nuevas }, { merge: true }); } catch (e) { /* ignora */ }
  }

  async function marcarTodasLeidas() {
    const nuevas = { ...leidas };
    items.forEach(n => { nuevas[n.id] = true; });
    setLeidas(nuevas);
    try { await setDoc(doc(db, "notif_leidas", currentUser.uid), { leidas: nuevas }, { merge: true }); } catch (e) { /* ignora */ }
  }

  async function limpiarTodas() {
    if (!window.confirm("¿Limpiar todas las notificaciones de tu lista?")) return;
    const ocultas = {};
    items.forEach(n => { ocultas[n.id] = true; });
    try { await setDoc(doc(db, "notif_leidas", currentUser.uid), { leidas: { ...leidas, ...ocultas }, ocultas }, { merge: true }); } catch (e) { /* ignora */ }
    setItems([]);
    setAbierto(false);
  }

  function abrirDetalle(n) {
    setDetalle(n);
    if (!leidas[n.id]) marcarLeida(n.id);
  }

  function tiempoRelativo(ms) {
    if (!ms) return "";
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "recién";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `hace ${d} d`;
    return new Date(ms).toLocaleDateString();
  }

  return (
    <div style={styles.wrap}>
      <button style={styles.campana} onClick={() => { setAbierto(!abierto); if (!abierto) cargar(); }} title="Notificaciones">
        🔔
        {noLeidas > 0 && <span style={styles.contador}>{noLeidas > 9 ? "9+" : noLeidas}</span>}
      </button>

      {abierto && (
        <>
          <div style={styles.backdrop} onClick={() => setAbierto(false)} />
          <div style={styles.panel}>
            <div style={styles.panelHead}>
              <span style={styles.panelTit}>Notificaciones</span>
              {items.length > 0 && (
                <div style={styles.panelAcciones}>
                  {noLeidas > 0 && <button style={styles.accionMini} onClick={marcarTodasLeidas}>Marcar leídas</button>}
                  <button style={styles.accionMini} onClick={limpiarTodas}>Limpiar</button>
                </div>
              )}
            </div>
            <div style={styles.lista}>
              {cargando ? (
                <div style={styles.vacio}>Cargando…</div>
              ) : items.length === 0 ? (
                <div style={styles.vacio}>No tenés notificaciones.</div>
              ) : (
                items.map(n => (
                  <div key={n.id} style={{ ...styles.item, ...(leidas[n.id] ? {} : styles.itemNoLeida) }} onClick={() => abrirDetalle(n)}>
                    <div style={styles.itemIcono}>{n.tipo === "trabajo" ? "📌" : "✨"}</div>
                    <div style={styles.itemCuerpo}>
                      <div style={styles.itemTitulo}>{n.titulo}</div>
                      <div style={styles.itemFecha}>{tiempoRelativo(n.fechaMs)}</div>
                    </div>
                    {!leidas[n.id] && <span style={styles.puntoNoLeida} />}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {detalle && (
        <div style={styles.detOverlay} onClick={() => setDetalle(null)}>
          <div style={styles.detModal} onClick={e => e.stopPropagation()}>
            <button style={styles.detCerrar} onClick={() => setDetalle(null)}>✕</button>
            <div style={styles.detIcono}>{detalle.tipo === "trabajo" ? "📌" : "✨"}</div>
            <div style={styles.detTitulo}>{detalle.titulo}</div>
            <div style={styles.detFecha}>{tiempoRelativo(detalle.fechaMs)}</div>
            <div style={styles.detTexto}>{detalle.detalle}</div>
            <button style={styles.detBtn} onClick={() => setDetalle(null)}>Entendido</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: "relative", display: "inline-block" },
  campana: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", width: "38px", height: "38px", borderRadius: "8px", cursor: "pointer", fontSize: "17px", position: "relative" },
  contador: { position: "absolute", top: "-5px", right: "-5px", background: "#dc2626", color: "#fff", fontSize: "10px", fontWeight: "700", minWidth: "17px", height: "17px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" },
  backdrop: { position: "fixed", inset: 0, zIndex: 2500 },
  panel: { position: "absolute", top: "46px", right: 0, width: "330px", maxWidth: "88vw", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", boxShadow: "0 12px 40px rgba(0,0,0,0.35)", zIndex: 2600, overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1.5px solid var(--border)", gap: "8px" },
  panelTit: { fontSize: "14px", fontWeight: "700", color: "var(--text)" },
  panelAcciones: { display: "flex", gap: "6px" },
  accionMini: { background: "transparent", border: "none", color: "var(--acc)", cursor: "pointer", fontSize: "11.5px", fontWeight: "600" },
  lista: { maxHeight: "380px", overflowY: "auto" },
  vacio: { padding: "24px 14px", textAlign: "center", color: "var(--text2)", fontSize: "13px" },
  item: { display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer" },
  itemNoLeida: { background: "var(--surface)" },
  itemIcono: { fontSize: "18px", flexShrink: 0 },
  itemCuerpo: { flex: 1, minWidth: 0 },
  itemTitulo: { fontSize: "13.5px", color: "var(--text)", fontWeight: "600", lineHeight: "1.3" },
  itemFecha: { fontSize: "11px", color: "var(--text2)", marginTop: "3px" },
  puntoNoLeida: { width: "8px", height: "8px", borderRadius: "50%", background: "var(--acc)", flexShrink: 0 },
  detOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3500, padding: "20px" },
  detModal: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "26px", maxWidth: "420px", width: "100%", position: "relative", textAlign: "center" },
  detCerrar: { position: "absolute", top: "14px", right: "14px", background: "transparent", border: "none", color: "var(--text2)", fontSize: "16px", cursor: "pointer" },
  detIcono: { fontSize: "38px", marginBottom: "10px" },
  detTitulo: { fontSize: "18px", fontWeight: "700", color: "var(--text)", marginBottom: "4px" },
  detFecha: { fontSize: "12px", color: "var(--text2)", marginBottom: "14px" },
  detTexto: { fontSize: "14px", color: "var(--text)", lineHeight: "1.6", textAlign: "left", background: "var(--surface)", padding: "14px", borderRadius: "10px", whiteSpace: "pre-wrap" },
  detBtn: { marginTop: "18px", background: "var(--acc)", color: "#fff", border: "none", padding: "11px 24px", borderRadius: "9px", cursor: "pointer", fontSize: "14px", fontWeight: "700", width: "100%" },
};
