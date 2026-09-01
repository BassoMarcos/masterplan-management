import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";

const TIPOS = [
  { id: "texto", label: "Texto", icono: "✏️" },
  { id: "numero", label: "Número", icono: "🔢" },
  { id: "monto", label: "Monto ($)", icono: "💲" },
  { id: "fecha", label: "Fecha", icono: "📅" },
  { id: "opciones", label: "Opciones", icono: "🔘" },
  { id: "sino", label: "Sí / No", icono: "✅" },
];

const ANCHOS = [
  { id: "full", label: "Fila completa", flex: "1 1 100%" },
  { id: "half", label: "Media fila", flex: "1 1 calc(50% - 6px)" },
  { id: "third", label: "Un tercio", flex: "1 1 calc(33.33% - 8px)" },
];

const TITULAR_DEFAULT = ["Apellido y Nombre", "DNI", "Nacionalidad", "Estado civil", "Domicilio", "N°", "Localidad", "Partido", "Contacto"];

export default function ComercialDisenoReserva() {
  const { proyectoId } = useParams();
  const { empleadoData, empresaUid, esEmpleado, logout } = useAuth();
  const navigate = useNavigate();
  const textoRef = useRef(null);

  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [titulo, setTitulo] = useState("Contrato de Reserva");
  // secciones: [{ id, titulo, esTitular, campos: [{id,label,tipo,ancho,opciones}] }]
  const [secciones, setSecciones] = useState([]);
  const [titularLabels, setTitularLabels] = useState(TITULAR_DEFAULT);
  const [textoContrato, setTextoContrato] = useState("");
  const [firmaIzq, setFirmaIzq] = useState("En representación de");
  const [firmaDer, setFirmaDer] = useState("Firma del comprador");
  const [nuevaOpcion, setNuevaOpcion] = useState({});

  // El diseño lo edita el dueño o un empleado con acceso total
  const puedeEditar = !esEmpleado || empleadoData?.accesoTotal;

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const snapP = await getDoc(doc(db, "proyectos", proyectoId));
      if (!snapP.exists() || snapP.data().empresaId !== empresaUid) { navigate("/proyectos"); return; }
      setProyecto({ id: snapP.id, ...snapP.data() });
      const s = await getDoc(doc(db, "comercial_config", `${empresaUid}_${proyectoId}`));
      if (s.exists() && s.data().disenoReservaV2) {
        const dr = s.data().disenoReservaV2;
        if (dr.titulo) setTitulo(dr.titulo);
        if (Array.isArray(dr.secciones)) setSecciones(dr.secciones);
        if (Array.isArray(dr.titularLabels)) setTitularLabels(dr.titularLabels);
        if (typeof dr.textoContrato === "string") setTextoContrato(dr.textoContrato);
        if (dr.firmaIzq) setFirmaIzq(dr.firmaIzq);
        if (dr.firmaDer) setFirmaDer(dr.firmaDer);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [proyectoId, empresaUid, navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Secciones ──
  function agregarSeccion() {
    setSecciones([...secciones, { id: "sec_" + Date.now(), titulo: "Nueva sección", esTitular: false, campos: [] }]);
  }
  function agregarSeccionTitular() {
    if (secciones.some(s => s.esTitular)) { alert("Ya hay una sección de titulares. Al llenar se puede repetir con 'Agregar titular'."); return; }
    setSecciones([...secciones, { id: "tit_" + Date.now(), titulo: "Datos del titular", esTitular: true, campos: [] }]);
  }
  function actualizarSeccion(sid, patch) {
    setSecciones(secciones.map(s => s.id === sid ? { ...s, ...patch } : s));
  }
  function borrarSeccion(sid) {
    if (!window.confirm("¿Borrar esta sección y sus campos?")) return;
    setSecciones(secciones.filter(s => s.id !== sid));
  }
  function moverSeccion(idx, dir) {
    const d = idx + dir;
    if (d < 0 || d >= secciones.length) return;
    const n = [...secciones];
    [n[idx], n[d]] = [n[d], n[idx]];
    setSecciones(n);
  }

  // ── Campos dentro de una sección ──
  function agregarCampo(sid) {
    setSecciones(secciones.map(s => s.id === sid
      ? { ...s, campos: [...s.campos, { id: "cp_" + Date.now(), label: "Nuevo campo", tipo: "texto", ancho: "full", opciones: [] }] }
      : s));
  }
  function actualizarCampo(sid, cid, patch) {
    setSecciones(secciones.map(s => s.id === sid
      ? { ...s, campos: s.campos.map(c => c.id === cid ? { ...c, ...patch } : c) }
      : s));
  }
  function borrarCampo(sid, cid) {
    setSecciones(secciones.map(s => s.id === sid ? { ...s, campos: s.campos.filter(c => c.id !== cid) } : s));
  }
  function moverCampo(sid, idx, dir) {
    setSecciones(secciones.map(s => {
      if (s.id !== sid) return s;
      const d = idx + dir;
      if (d < 0 || d >= s.campos.length) return s;
      const n = [...s.campos];
      [n[idx], n[d]] = [n[d], n[idx]];
      return { ...s, campos: n };
    }));
  }
  function agregarOpcion(sid, cid, texto) {
    const t = (texto || "").trim();
    if (!t) return;
    setSecciones(secciones.map(s => s.id === sid
      ? { ...s, campos: s.campos.map(c => c.id === cid ? { ...c, opciones: [...(c.opciones || []), t] } : c) }
      : s));
  }
  function quitarOpcion(sid, cid, opIdx) {
    setSecciones(secciones.map(s => s.id === sid
      ? { ...s, campos: s.campos.map(c => c.id === cid ? { ...c, opciones: (c.opciones || []).filter((_, i) => i !== opIdx) } : c) }
      : s));
  }

  async function guardar() {
    for (const s of secciones) {
      for (const c of s.campos) {
        if (c.tipo === "opciones" && (!c.opciones || c.opciones.length < 2)) {
          alert(`El campo "${c.label}" es de opciones: cargá al menos 2.`); return;
        }
      }
    }
    setGuardando(true);
    try {
      const ref = doc(db, "comercial_config", `${empresaUid}_${proyectoId}`);
      await setDoc(ref, {
        empresaId: empresaUid,
        proyectoId,
        disenoReservaV2: { titulo, secciones, titularLabels, textoContrato, firmaIzq, firmaDer },
        actualizadoEn: new Date().toISOString(),
      }, { merge: true });
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e) { alert("Error al guardar: " + e.message); }
    setGuardando(false);
  }

  // Lista de todos los campos disponibles para insertar en el texto
  const camposDisponibles = [];
  secciones.forEach(s => {
    if (s.esTitular) {
      titularLabels.forEach(lb => camposDisponibles.push({ etiqueta: `Titular: ${lb}`, valor: lb }));
    } else {
      s.campos.forEach(c => { if (c.label.trim()) camposDisponibles.push({ etiqueta: c.label, valor: c.label }); });
    }
  });

  function insertarCampo(valor) {
    const marca = `{${valor}}`;
    const ta = textoRef.current;
    if (!ta) { setTextoContrato(textoContrato + marca); return; }
    const ini = ta.selectionStart ?? textoContrato.length;
    const fin = ta.selectionEnd ?? textoContrato.length;
    const nuevo = textoContrato.slice(0, ini) + marca + textoContrato.slice(fin);
    setTextoContrato(nuevo);
    // Reponer el cursor después de la marca
    setTimeout(() => { ta.focus(); const pos = ini + marca.length; ta.setSelectionRange(pos, pos); }, 0);
  }

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate(`/proyecto/${proyectoId}/comercial/config_estrategia`)}>← Volver</button>
          <div>
            <h1 style={styles.headerTitle}>📝 Formulario de reserva</h1>
            <p style={styles.headerSub}>{proyecto?.nombre}{!puedeEditar && " · 👁️ Solo lectura"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          {puedeEditar && <button style={styles.guardarBtn} onClick={guardar} disabled={guardando}>{guardando ? "..." : guardadoOk ? "✓ Guardado" : "💾 Guardar"}</button>}
          <button style={styles.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.tituloBox}>
          <label style={styles.lbl}>Título del formulario</label>
          <input style={styles.tituloInput} value={titulo} onChange={e => setTitulo(e.target.value)} disabled={!puedeEditar} />
        </div>

        <div style={styles.bloqueConfig}>
          <label style={styles.lbl}>📄 Texto del contrato (aparece impreso en la reserva)</label>
          {puedeEditar && camposDisponibles.length > 0 && (
            <div style={styles.insertarBox}>
              <div style={styles.insertarHint}>Tocá un campo para insertarlo en el texto (se completa solo con lo que cargue el vendedor):</div>
              <div style={styles.insertarChips}>
                {camposDisponibles.map((c, i) => (
                  <button key={i} style={styles.insertarChip} onClick={() => insertarCampo(c.valor)} title={`Insertar ${c.etiqueta}`}>🏷️ {c.etiqueta}</button>
                ))}
              </div>
            </div>
          )}
          <textarea ref={textoRef} style={styles.textoContratoInput} rows={5} value={textoContrato} onChange={e => setTextoContrato(e.target.value)} disabled={!puedeEditar} placeholder="Escribí acá el texto que siempre va en la reserva. Tocá los campos de arriba para insertar datos." />
        </div>

        {secciones.length === 0 && (
          <div style={styles.vacio}>Todavía no hay secciones. Agregá la primera abajo. 👇</div>
        )}

        {secciones.map((s, sidx) => (
          <div key={s.id} style={{ ...styles.seccion, ...(s.esTitular ? styles.seccionTitular : {}) }}>
            <div style={styles.seccionHead}>
              <input style={styles.seccionTitulo} value={s.titulo} onChange={e => actualizarSeccion(s.id, { titulo: e.target.value })} disabled={!puedeEditar} />
              {s.esTitular && <span style={styles.titularBadge}>👤 Repetible</span>}
              {puedeEditar && (
                <div style={styles.seccionCtrls}>
                  <button style={styles.iconBtn} onClick={() => moverSeccion(sidx, -1)} disabled={sidx === 0}>↑</button>
                  <button style={styles.iconBtn} onClick={() => moverSeccion(sidx, 1)} disabled={sidx === secciones.length - 1}>↓</button>
                  <button style={styles.iconBtnRed} onClick={() => borrarSeccion(s.id)}>🗑️</button>
                </div>
              )}
            </div>

            {s.esTitular ? (
              <div style={styles.titularInfo}>
                Esta sección tiene los datos personales: {titularLabels.join(", ")}. Al llenar la reserva se puede repetir por cada titular.
              </div>
            ) : (
              <>
                {s.campos.map((c, cidx) => (
                  <div key={c.id} style={styles.campoBox}>
                    <div style={styles.campoTop}>
                      <input style={styles.campoLabel} placeholder="Nombre del campo" value={c.label} onChange={e => actualizarCampo(s.id, c.id, { label: e.target.value })} disabled={!puedeEditar} />
                      {puedeEditar && (
                        <div style={styles.campoCtrls}>
                          <button style={styles.iconBtn} onClick={() => moverCampo(s.id, cidx, -1)} disabled={cidx === 0}>↑</button>
                          <button style={styles.iconBtn} onClick={() => moverCampo(s.id, cidx, 1)} disabled={cidx === s.campos.length - 1}>↓</button>
                          <button style={styles.iconBtnRed} onClick={() => borrarCampo(s.id, c.id)}>✕</button>
                        </div>
                      )}
                    </div>
                    <div style={styles.campoOpts}>
                      <select style={styles.miniSelect} value={c.tipo} onChange={e => actualizarCampo(s.id, c.id, { tipo: e.target.value })} disabled={!puedeEditar}>
                        {TIPOS.map(t => <option key={t.id} value={t.id}>{t.icono} {t.label}</option>)}
                      </select>
                      <select style={styles.miniSelect} value={c.ancho} onChange={e => actualizarCampo(s.id, c.id, { ancho: e.target.value })} disabled={!puedeEditar}>
                        {ANCHOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </div>
                    {c.tipo === "opciones" && (
                      <div style={styles.opcBox}>
                        {(c.opciones || []).map((op, oi) => (
                          <span key={oi} style={styles.opcChip}>{op}{puedeEditar && <button style={styles.opcX} onClick={() => quitarOpcion(s.id, c.id, oi)}>✕</button>}</span>
                        ))}
                        {puedeEditar && (
                          <div style={styles.opcAddRow}>
                            <input style={styles.opcInput} placeholder="Agregar opción" value={nuevaOpcion[c.id] || ""} onChange={e => setNuevaOpcion({ ...nuevaOpcion, [c.id]: e.target.value })}
                              onKeyDown={e => { if (e.key === "Enter") { agregarOpcion(s.id, c.id, nuevaOpcion[c.id]); setNuevaOpcion({ ...nuevaOpcion, [c.id]: "" }); } }} />
                            <button style={styles.opcAddBtn} onClick={() => { agregarOpcion(s.id, c.id, nuevaOpcion[c.id]); setNuevaOpcion({ ...nuevaOpcion, [c.id]: "" }); }}>+</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {puedeEditar && <button style={styles.addCampoBtn} onClick={() => agregarCampo(s.id)}>➕ Agregar campo</button>}
              </>
            )}
          </div>
        ))}

        {puedeEditar && (
          <div style={styles.addSecciones}>
            <button style={styles.addSeccionBtn} onClick={agregarSeccion}>➕ Agregar sección</button>
            <button style={styles.addTitularBtn} onClick={agregarSeccionTitular}>👤 Agregar sección de titulares</button>
          </div>
        )}

        <div style={styles.bloqueConfig}>
          <label style={styles.lbl}>✍️ Firmas (al pie de la reserva)</label>
          <div style={styles.firmasRow}>
            <div style={{ flex: 1 }}>
              <span style={styles.firmaMini}>Izquierda</span>
              <input style={styles.inp} value={firmaIzq} onChange={e => setFirmaIzq(e.target.value)} disabled={!puedeEditar} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={styles.firmaMini}>Derecha</span>
              <input style={styles.inp} value={firmaDer} onChange={e => setFirmaDer(e.target.value)} disabled={!puedeEditar} />
            </div>
          </div>
        </div>

        {/* Vista previa (moderna, como la verá el vendedor) */}
        {secciones.length > 0 && (
          <div style={styles.preview}>
            <div style={styles.previewTag}>Vista previa (así la ve el vendedor)</div>
            <div style={styles.previewTitulo}>{titulo}</div>
            {textoContrato.trim() && <div style={styles.previewTexto}>{textoContrato}</div>}
            {secciones.map(s => (
              <div key={s.id} style={styles.previewSeccion}>
                <div style={styles.previewSecTit}>{s.titulo}{s.esTitular && " (Titular 1)"}</div>
                <div style={styles.previewCampos}>
                  {s.esTitular
                    ? titularLabels.map((lb, i) => (
                        <div key={i} style={{ flex: "1 1 calc(50% - 8px)", minWidth: "160px" }}>
                          <label style={styles.previewLabel}>{lb}</label>
                          <div style={styles.previewInput} />
                        </div>
                      ))
                    : s.campos.map(c => {
                        const anchoFlex = (ANCHOS.find(a => a.id === c.ancho) || ANCHOS[0]).flex;
                        return (
                          <div key={c.id} style={{ flex: anchoFlex, minWidth: "160px" }}>
                            <label style={styles.previewLabel}>{c.label}</label>
                            <div style={styles.previewInput} />
                          </div>
                        );
                      })}
                </div>
              </div>
            ))}
            <div style={styles.previewFirmas}>
              <div style={styles.previewFirmaCol}><div style={styles.previewFirmaLinea} /><span style={styles.previewFirmaLbl}>{firmaIzq}</span></div>
              <div style={styles.previewFirmaCol}><div style={styles.previewFirmaLinea} /><span style={styles.previewFirmaLbl}>{firmaDer}</span></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  loading: { padding: 40, fontFamily: "sans-serif", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" },
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  headerTitle: { margin: 0, fontSize: "17px", fontWeight: "700" },
  headerSub: { margin: 0, fontSize: "12px", color: "var(--text2)" },
  guardarBtn: { background: "var(--acc)", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "700" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  main: { maxWidth: "760px", margin: "0 auto", padding: "24px" },
  tituloBox: { marginBottom: "20px" },
  bloqueConfig: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "16px" },
  textoContratoInput: { width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", lineHeight: "1.5" },
  insertarBox: { marginBottom: "10px" },
  insertarHint: { fontSize: "12px", color: "var(--text2)", marginBottom: "8px" },
  insertarChips: { display: "flex", flexWrap: "wrap", gap: "6px" },
  insertarChip: { background: "var(--surface)", border: "1.5px solid var(--acc)", color: "var(--text)", padding: "5px 10px", borderRadius: "16px", cursor: "pointer", fontSize: "12px", fontWeight: "600" },
  firmasRow: { display: "flex", gap: "12px" },
  firmaMini: { display: "block", fontSize: "11px", color: "var(--text2)", marginBottom: "4px" },
  previewTexto: { fontSize: "13px", color: "var(--text)", lineHeight: "1.6", whiteSpace: "pre-wrap", marginBottom: "16px", padding: "0 2px" },
  previewFirmas: { display: "flex", gap: "40px", marginTop: "36px", justifyContent: "space-between" },
  previewFirmaCol: { flex: 1, textAlign: "center" },
  previewFirmaLinea: { borderTop: "1px solid var(--text2)", marginBottom: "6px" },
  previewFirmaLbl: { fontSize: "12px", color: "var(--text2)" },
  lbl: { display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text2)", marginBottom: "6px" },
  tituloInput: { width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "18px", fontWeight: "700", boxSizing: "border-box" },
  vacio: { textAlign: "center", color: "var(--text2)", fontSize: "14px", padding: "30px", background: "var(--card)", borderRadius: "12px", border: "1.5px dashed var(--border2)" },
  seccion: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "14px" },
  seccionTitular: { borderColor: "var(--acc)", borderStyle: "dashed" },
  seccionHead: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" },
  seccionTitulo: { flex: 1, padding: "8px 10px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "15px", fontWeight: "700", boxSizing: "border-box" },
  titularBadge: { fontSize: "11px", background: "var(--surface)", color: "var(--acc)", padding: "3px 8px", borderRadius: "20px", fontWeight: "700", whiteSpace: "nowrap" },
  seccionCtrls: { display: "flex", gap: "4px" },
  titularInfo: { fontSize: "12.5px", color: "var(--text2)", lineHeight: "1.5", background: "var(--surface)", padding: "10px", borderRadius: "8px" },
  campoBox: { background: "var(--surface)", borderRadius: "8px", padding: "10px", marginBottom: "8px" },
  campoTop: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" },
  campoLabel: { flex: 1, padding: "8px 10px", borderRadius: "6px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "14px", boxSizing: "border-box" },
  campoCtrls: { display: "flex", gap: "4px" },
  campoOpts: { display: "flex", gap: "6px" },
  miniSelect: { flex: 1, padding: "7px 8px", borderRadius: "6px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "12px", cursor: "pointer" },
  iconBtn: { background: "var(--bg)", border: "1px solid var(--border2)", color: "var(--text2)", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
  iconBtnRed: { background: "var(--bg)", border: "1px solid #dc2626", color: "#dc2626", width: "28px", height: "28px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
  opcBox: { marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" },
  opcChip: { fontSize: "12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "16px", padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: "4px" },
  opcX: { background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "11px" },
  opcAddRow: { display: "flex", gap: "4px" },
  opcInput: { padding: "6px 8px", borderRadius: "6px", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "12px", width: "140px" },
  opcAddBtn: { background: "var(--acc)", color: "#fff", border: "none", width: "30px", borderRadius: "6px", cursor: "pointer", fontSize: "16px" },
  addCampoBtn: { background: "transparent", border: "1.5px dashed var(--border2)", color: "var(--text)", padding: "9px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", width: "100%", marginTop: "4px" },
  addSecciones: { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" },
  addSeccionBtn: { flex: 1, background: "var(--acc)", color: "#fff", border: "none", padding: "12px", borderRadius: "10px", cursor: "pointer", fontSize: "14px", fontWeight: "700", minWidth: "160px" },
  addTitularBtn: { flex: 1, background: "transparent", border: "1.5px solid var(--acc)", color: "var(--text)", padding: "12px", borderRadius: "10px", cursor: "pointer", fontSize: "14px", fontWeight: "700", minWidth: "160px" },
  preview: { marginTop: "28px" },
  previewTag: { fontSize: "12px", fontWeight: "700", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" },
  previewHoja: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "20px" },
  previewTitulo: { fontSize: "20px", fontWeight: "800", marginBottom: "16px", color: "var(--text)" },
  previewSeccion: { background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "16px 18px", marginBottom: "12px" },
  previewSecTit: { fontSize: "12px", fontWeight: "700", color: "var(--acc)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.4px" },
  previewCampos: { display: "flex", flexWrap: "wrap", gap: "12px 16px" },
  previewLabel: { display: "block", fontSize: "11px", fontWeight: "600", color: "var(--text2)", marginBottom: "4px" },
  previewInput: { height: "34px", borderRadius: "9px", border: "1.5px solid var(--border)", background: "var(--bg)" },
};
