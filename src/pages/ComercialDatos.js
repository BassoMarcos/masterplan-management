import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import { empleadoNivelPanel } from "../config/appConfig";

// Panel de DATOS (Comercial): los dateros cargan contactos crudos (nombre + número).
// Cada dato guarda quién lo cargó. Estado inicial: "crudo".
export default function ComercialDatos() {
  const { proyectoId } = useParams();
  const { currentUser, empresaData, empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [numero, setNumero] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Permiso: si es empleado, ¿puede editar (cargar) o solo ver?
  const nivel = esEmpleado ? empleadoNivelPanel(empleadoData, proyectoId, "comercial", "datos") : "editar";
  const puedeEditar = !esEmpleado || nivel === "editar";
  const esAdmin = !esEmpleado || empleadoData?.accesoTotal;

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const snapP = await getDoc(doc(db, "proyectos", proyectoId));
      if (snapP.exists() && snapP.data().empresaId === empresaUid) {
        setProyecto({ id: snapP.id, ...snapP.data() });
      } else {
        navigate("/proyectos");
        return;
      }
      const q = query(
        collection(db, "comercial_datos"),
        where("empresaId", "==", empresaUid),
        where("proyectoId", "==", proyectoId)
      );
      const snap = await getDocs(q);
      let lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Ordenar por fecha de carga (más nuevo primero)
      lista.sort((a, b) => (b.creadoMs || 0) - (a.creadoMs || 0));
      // Si es empleado NO admin: solo ve los datos que cargó él
      if (esEmpleado && !empleadoData?.accesoTotal) {
        lista = lista.filter(d => d.cargadoPorUid === currentUser.uid);
      }
      setDatos(lista);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [proyectoId, empresaUid, esEmpleado, empleadoData, currentUser, navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  async function agregar() {
    if (!nombre.trim() || !numero.trim()) { alert("Completá nombre y número."); return; }
    setGuardando(true);
    try {
      const nombreQuien = esEmpleado
        ? `${empleadoData?.nombre || ""} ${empleadoData?.apellido || ""}`.trim()
        : (empresaData?.nombre || "Admin");
      await addDoc(collection(db, "comercial_datos"), {
        empresaId: empresaUid,
        proyectoId,
        nombre: nombre.trim(),
        numero: numero.trim(),
        estado: "crudo",
        cargadoPorUid: currentUser.uid,
        cargadoPorNombre: nombreQuien,
        creadoEn: serverTimestamp(),
        creadoMs: Date.now(),
      });
      setNombre(""); setNumero("");
      cargar();
    } catch (e) {
      alert("Error al guardar: " + e.message);
    }
    setGuardando(false);
  }

  async function eliminar(d) {
    if (!window.confirm(`¿Eliminar el dato de ${d.nombre}?`)) return;
    try {
      await deleteDoc(doc(db, "comercial_datos", d.id));
      cargar();
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/comercial`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>📇 Datos</h1>
            <p style={styles.headerSub}>{proyecto?.nombre} · Comercial{!puedeEditar && " · 👁️ Solo lectura"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {puedeEditar && (
          <div style={styles.cargaBox}>
            <div style={styles.cargaTitle}>➕ Cargar un dato</div>
            <div style={styles.cargaRow}>
              <input style={styles.input} placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
              <input style={styles.input} placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} onKeyDown={e => e.key === "Enter" && agregar()} />
              <button style={styles.addBtn} onClick={agregar} disabled={guardando}>{guardando ? "..." : "Agregar"}</button>
            </div>
          </div>
        )}

        <div style={styles.listaHeader}>
          <span style={styles.listaTitulo}>Datos cargados ({datos.length})</span>
        </div>

        {datos.length === 0 ? (
          <p style={styles.empty}>Todavía no hay datos cargados.</p>
        ) : (
          <div style={styles.tabla}>
            <div style={styles.theadRow}>
              <div style={{ ...styles.th, flex: 2 }}>Nombre</div>
              <div style={{ ...styles.th, flex: 1.5 }}>Número</div>
              <div style={{ ...styles.th, flex: 1 }}>Estado</div>
              {esAdmin && <div style={{ ...styles.th, flex: 1.5 }}>Cargado por</div>}
              <div style={{ ...styles.th, flex: 0.6, textAlign: "right" }}></div>
            </div>
            {datos.map(d => (
              <div key={d.id} style={styles.trow}>
                <div style={{ ...styles.td, flex: 2, fontWeight: 600 }}>{d.nombre}</div>
                <div style={{ ...styles.td, flex: 1.5 }}>{d.numero}</div>
                <div style={{ ...styles.td, flex: 1 }}><span style={styles.estadoTag}>{d.estado}</span></div>
                {esAdmin && <div style={{ ...styles.td, flex: 1.5, color: "var(--text2)", fontSize: "12px" }}>{d.cargadoPorNombre}</div>}
                <div style={{ ...styles.td, flex: 0.6, justifyContent: "flex-end" }}>
                  {(esAdmin || (puedeEditar && d.cargadoPorUid === currentUser.uid)) && d.estado === "crudo" && (
                    <button style={styles.delBtn} onClick={() => eliminar(d)} title="Eliminar">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  loading: { padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" },
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "900px", margin: "0 auto", padding: "32px 24px" },
  cargaBox: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "18px", marginBottom: "24px" },
  cargaTitle: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "12px" },
  cargaRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
  input: { flex: 1, minWidth: "140px", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box" },
  addBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
  listaHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
  listaTitulo: { fontSize: "15px", fontWeight: "700", color: "var(--text)" },
  empty: { color: "var(--text2)", fontSize: "14px" },
  tabla: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", overflow: "hidden" },
  theadRow: { display: "flex", padding: "12px 18px", background: "var(--nav)", borderBottom: "1.5px solid var(--border)" },
  th: { fontSize: "11px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.5px" },
  trow: { display: "flex", padding: "12px 18px", borderBottom: "1px solid var(--border)", alignItems: "center" },
  td: { display: "flex", alignItems: "center", fontSize: "14px", color: "var(--text)" },
  estadoTag: { fontSize: "11px", background: "var(--surface)", color: "var(--text2)", padding: "2px 10px", borderRadius: "20px", border: "1px solid var(--border)", textTransform: "capitalize" },
  delBtn: { background: "transparent", border: "1px solid #fca5a5", color: "#dc2626", width: "26px", height: "26px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
};
