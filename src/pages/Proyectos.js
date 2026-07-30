import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";

const ICONOS = ["🏘️","🏗️","🌳","🏡","🏢","🌆","🏖️","🏔️","🌾","🏙️","🏠","🌿"];

export default function Proyectos() {
  const { currentUser, empresaData, logout } = useAuth();
  const navigate = useNavigate();

  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [icono, setIcono] = useState("🏘️");
  const [fotoPreview, setFotoPreview] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cargarProyectos = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "proyectos"), where("empresaId", "==", currentUser.uid));
      const snap = await getDocs(q);
      setProyectos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [currentUser.uid]);

  useEffect(() => {
    cargarProyectos();
  }, [cargarProyectos]);

  function handleFoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleCrear(e) {
    e.preventDefault();
    if (!nombre.trim()) { setError("Ingresá un nombre para el proyecto"); return; }
    setGuardando(true);
    setError("");
    try {
      await addDoc(collection(db, "proyectos"), {
        nombre: nombre.trim(),
        icono: fotoPreview ? null : icono,
        logo: fotoPreview || null,
        empresaId: currentUser.uid,
        creadoEn: serverTimestamp()
      });
      setNombre("");
      setIcono("🏘️");
      setFotoPreview(null);
      setShowModal(false);
      cargarProyectos();
    } catch (e) {
      setError("Error al crear el proyecto. Intentá de nuevo.");
    }
    setGuardando(false);
  }

  function cerrarModal() {
    setShowModal(false);
    setNombre("");
    setIcono("🏘️");
    setFotoPreview(null);
    setError("");
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: "22px" }}>🏗️</span>
          <div>
            <h1 style={styles.headerTitle}>MasterPlan</h1>
            <p style={styles.headerSub}>{empresaData?.nombre || "Mi Empresa"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={styles.titulo}>Mis Proyectos</h2>
            <p style={styles.subtitulo}>Seleccioná un proyecto para trabajar</p>
          </div>
          <button style={styles.pizarraBtn} onClick={() => navigate("/pizarra")}>📋 Pizarra de organización</button>
        </div>
        {loading ? (
          <p style={styles.cargando}>Cargando proyectos...</p>
        ) : (
          <div style={styles.grilla}>
            {proyectos.map(p => (
              <div
                key={p.id}
                style={styles.tarjeta}
                onClick={() => navigate(`/proyecto/${p.id}`)}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                <div style={styles.tarjetaIcono}>
                  {p.logo
                    ? <img src={p.logo} alt={p.nombre} style={styles.logoImg} />
                    : <span style={{ fontSize: "48px" }}>{p.icono}</span>
                  }
                </div>
                <h3 style={styles.tarjetaNombre}>{p.nombre}</h3>
                <p style={styles.tarjetaSub}>Ver proyecto →</p>
              </div>
            ))}
            <div
              style={styles.tarjetaAgregar}
              onClick={() => setShowModal(true)}
              onMouseEnter={e => e.currentTarget.style.background = "#e8f0fe"}
              onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}
            >
              <span style={styles.masIcono}>+</span>
              <p style={styles.masTexto}>Nuevo proyecto</p>
            </div>
          </div>
        )}
      </main>

      {showModal && (
        <div style={styles.overlay} onClick={cerrarModal}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitulo}>Nuevo Proyecto</h3>
              <button style={styles.cerrarBtn} onClick={cerrarModal}>✕</button>
            </div>
            <form onSubmit={handleCrear} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>Nombre del proyecto *</label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="Ej: Barrio Las Acacias"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Logo o imagen del proyecto</label>
                <div style={styles.logoArea}>
                  {fotoPreview
                    ? <img src={fotoPreview} alt="preview" style={styles.preview} />
                    : <span style={{ fontSize: "56px" }}>{icono}</span>
                  }
                </div>
                <label style={styles.uploadBtn}>
                  📷 Subir imagen
                  <input type="file" accept="image/*" onChange={handleFoto} style={{ display: "none" }} />
                </label>
                {fotoPreview && (
                  <button type="button" style={styles.quitarBtn} onClick={() => setFotoPreview(null)}>
                    Quitar imagen
                  </button>
                )}
              </div>
              {!fotoPreview && (
                <div style={styles.field}>
                  <label style={styles.label}>O elegí un ícono</label>
                  <div style={styles.iconosGrid}>
                    {ICONOS.map(ic => (
                      <button
                        key={ic}
                        type="button"
                        style={{ ...styles.iconoBtn, ...(icono === ic ? styles.iconoBtnActive : {}) }}
                        onClick={() => setIcono(ic)}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {error && <p style={styles.error}>{error}</p>}
              <button type="submit" style={styles.crearBtn} disabled={guardando}>
                {guardando ? "Creando..." : "Crear Proyecto"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: {
    background: "var(--nav)", color: "var(--text)", padding: "16px 32px",
    display: "flex", alignItems: "center", justifyContent: "space-between"
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "12px" },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "13px", color: "var(--text2)" },
  logoutBtn: {
    background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)",
    padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px"
  },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" },
  titulo: { fontSize: "28px", fontWeight: "700", color: "var(--text)", margin: "0 0 8px" },
  subtitulo: { fontSize: "15px", color: "var(--text2)", margin: "0 0 40px" },
  cargando: { color: "var(--text2)", fontSize: "15px" },
  grilla: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px" },
  tarjeta: {
    background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px",
    padding: "32px 20px 24px", textAlign: "center", cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
  },
  tarjetaIcono: { marginBottom: "16px", height: "64px", display: "flex", alignItems: "center", justifyContent: "center" },
  logoImg: { width: "64px", height: "64px", borderRadius: "12px", objectFit: "cover" },
  tarjetaNombre: { fontSize: "16px", fontWeight: "700", color: "var(--text)", margin: "0 0 6px" },
  tarjetaSub: { fontSize: "13px", color: "var(--acc2)", margin: 0 },
  tarjetaAgregar: {
    background: "var(--surface)", border: "2px dashed var(--border2)", borderRadius: "16px",
    padding: "32px 20px 24px", textAlign: "center", cursor: "pointer",
    transition: "background 0.2s", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", minHeight: "180px"
  },
  masIcono: { fontSize: "40px", color: "var(--text2)", lineHeight: 1, marginBottom: "12px" },
  masTexto: { fontSize: "14px", color: "var(--text2)", margin: 0, fontWeight: "600" },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px"
  },
  modal: {
    background: "var(--surface)", borderRadius: "16px", width: "100%", maxWidth: "480px",
    maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
  },
  modalHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 24px 0"
  },
  modalTitulo: { margin: 0, fontSize: "20px", fontWeight: "700", color: "var(--text)" },
  cerrarBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text2)", padding: "4px 8px" },
  form: { padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: "20px" },
  field: { display: "flex", flexDirection: "column", gap: "8px" },
  label: { fontSize: "13px", fontWeight: "600", color: "var(--text2)" },
  input: { padding: "12px 14px", border: "1.5px solid var(--border2)", borderRadius: "8px", fontSize: "14px", outline: "none", fontFamily: "inherit", background: "var(--card)", color: "var(--text)" },
  logoArea: { height: "100px", border: "1.5px solid var(--border2)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--card)" },
  preview: { width: "90px", height: "90px", borderRadius: "10px", objectFit: "cover" },
  uploadBtn: { display: "inline-block", padding: "8px 16px", background: "var(--hov)", border: "1px solid var(--border2)", borderRadius: "8px", fontSize: "13px", cursor: "pointer", textAlign: "center", fontWeight: "500", color: "var(--text)" },
  quitarBtn: { background: "none", border: "none", color: "#ef4444", fontSize: "13px", cursor: "pointer", textDecoration: "underline", padding: 0 },
  iconosGrid: { display: "flex", flexWrap: "wrap", gap: "8px" },
  iconoBtn: { fontSize: "28px", padding: "8px", borderRadius: "8px", border: "2px solid transparent", background: "var(--hov)", cursor: "pointer", transition: "all 0.15s" },
  iconoBtnActive: { border: "2px solid var(--acc)", background: "var(--blu-bg)" },
  error: { background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", margin: 0 },
  crearBtn: { padding: "13px", background: "var(--acc)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: "600", cursor: "pointer" },
  pizarraBtn: { padding: "12px 18px", background: "var(--card)", color: "var(--text)", border: "1.5px solid var(--border2)", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }
};
