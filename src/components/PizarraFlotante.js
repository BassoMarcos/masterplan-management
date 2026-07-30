import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

const COLORES_DEFAULT = ["#fff8e8", "#ffd9a0", "#a0e8c0", "#a0d8f0", "#f0a0c0"];

const LEYENDA_DEFAULT = [
  { color: "#a0e8c0", texto: "Asignado" },
  { color: "#ffd9a0", texto: "A discutir" },
  { color: "#a0d8f0", texto: "En progreso" },
  { color: "#f0a0c0", texto: "Urgente" },
];

function nowStr() { return new Date().toISOString(); }

function fmtFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// contextoId: identifica QUÉ pizarra es (general, proyecto_ABC, area_administracion...)
// titulo: nombre visible de la pizarra
export default function PizarraFlotante({ contextoId, titulo }) {
  const { currentUser } = useAuth();

  const [abierta, setAbierta] = useState(false);
  const [expandida, setExpandida] = useState(false);
  // Posición y tamaño de la ventana flotante
  const [ventana, setVentana] = useState({ x: window.innerWidth - 660, y: 90, w: 620, h: 480 });

  const [notas, setNotas] = useState([]);
  const [leyenda, setLeyenda] = useState(LEYENDA_DEFAULT);
  const [colorSel, setColorSel] = useState(COLORES_DEFAULT[0]);
  const [cargado, setCargado] = useState(false);

  const guardandoRef = useRef(false);
  const debounceRef = useRef(null);
  const boardRef = useRef(null);

  // Documento en Firestore: pizarras / {empresaId}_{contextoId}
  const docKey = `${currentUser.uid}_${contextoId}`;
  const docRef = useCallback(() => doc(db, "pizarras", docKey), [docKey]);

  // Escucha en tiempo real (solo cuando la pizarra está abierta)
  useEffect(() => {
    if (!abierta) return;
    setCargado(false);
    const unsub = onSnapshot(docRef(), (snap) => {
      if (guardandoRef.current) return;
      if (snap.exists()) {
        const data = snap.data();
        setNotas(Array.isArray(data.notas) ? data.notas : []);
        setLeyenda(Array.isArray(data.leyenda) && data.leyenda.length ? data.leyenda : LEYENDA_DEFAULT);
      } else {
        setNotas([]);
        setLeyenda(LEYENDA_DEFAULT);
      }
      setCargado(true);
    }, (err) => { console.error("Pizarra:", err); setCargado(true); });
    return unsub;
  }, [abierta, docRef]);

  const guardar = useCallback((nuevasNotas, nuevaLeyenda) => {
    guardandoRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await setDoc(docRef(), {
          notas: nuevasNotas,
          leyenda: nuevaLeyenda,
          empresaId: currentUser.uid,
          contexto: contextoId,
          actualizado: nowStr(),
        });
      } catch (e) { console.error("Guardar pizarra:", e); }
      setTimeout(() => { guardandoRef.current = false; }, 400);
    }, 500);
  }, [docRef, currentUser.uid, contextoId]);

  function actualizarNotas(nuevas) { setNotas(nuevas); guardar(nuevas, leyenda); }
  function actualizarLeyenda(nueva) { setLeyenda(nueva); guardar(notas, nueva); }

  function crearNota(x, y) {
    const nueva = {
      id: "n" + Date.now() + Math.random().toString(36).slice(2, 6),
      x, y, w: 150, h: 70, texto: "Nueva nota", color: colorSel, resp: "", editado: nowStr(),
    };
    actualizarNotas([...notas, nueva]);
  }

  function onBoardDoubleClick(e) {
    if (e.target !== boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    crearNota(e.clientX - rect.left - 75, e.clientY - rect.top - 30);
  }

  function editarNota(id, campos) {
    actualizarNotas(notas.map(n => n.id === id ? { ...n, ...campos, editado: nowStr() } : n));
  }
  function borrarNota(id) { actualizarNotas(notas.filter(n => n.id !== id)); }

  // Arrastrar / redimensionar NOTAS
  const dragRef = useRef(null);
  function onNotaMouseDown(e, nota, modo) {
    e.preventDefault();
    const rect = boardRef.current.getBoundingClientRect();
    dragRef.current = {
      id: nota.id, modo, startX: e.clientX, startY: e.clientY,
      origX: nota.x, origY: nota.y, origW: nota.w, origH: nota.h,
      boardW: rect.width, boardH: rect.height,
    };
    window.addEventListener("mousemove", onNotaMove);
    window.addEventListener("mouseup", onNotaUp);
  }
  function onNotaMove(e) {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    setNotas(prev => prev.map(n => {
      if (n.id !== d.id) return n;
      if (d.modo === "move") {
        return { ...n, x: Math.max(0, Math.min(d.origX + dx, d.boardW - n.w)), y: Math.max(0, Math.min(d.origY + dy, d.boardH - n.h)) };
      }
      return { ...n, w: Math.max(110, Math.min(d.origW + dx, 400)), h: Math.max(60, Math.min(d.origH + dy, 400)) };
    }));
  }
  function onNotaUp() {
    window.removeEventListener("mousemove", onNotaMove);
    window.removeEventListener("mouseup", onNotaUp);
    const d = dragRef.current; dragRef.current = null;
    if (d) setNotas(prev => { const f = prev.map(n => n.id === d.id ? { ...n, editado: nowStr() } : n); guardar(f, leyenda); return f; });
  }

  // Arrastrar VENTANA
  const winDragRef = useRef(null);
  function onWinMouseDown(e) {
    if (expandida) return;
    winDragRef.current = { startX: e.clientX, startY: e.clientY, origX: ventana.x, origY: ventana.y };
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);
  }
  function onWinMove(e) {
    const d = winDragRef.current; if (!d) return;
    setVentana(v => ({
      ...v,
      x: Math.max(0, Math.min(d.origX + (e.clientX - d.startX), window.innerWidth - 200)),
      y: Math.max(0, Math.min(d.origY + (e.clientY - d.startY), window.innerHeight - 60)),
    }));
  }
  function onWinUp() {
    window.removeEventListener("mousemove", onWinMove);
    window.removeEventListener("mouseup", onWinUp);
    winDragRef.current = null;
  }

  // Redimensionar VENTANA
  const winResizeRef = useRef(null);
  function onWinResizeDown(e) {
    e.stopPropagation();
    winResizeRef.current = { startX: e.clientX, startY: e.clientY, origW: ventana.w, origH: ventana.h };
    window.addEventListener("mousemove", onWinResizeMove);
    window.addEventListener("mouseup", onWinResizeUp);
  }
  function onWinResizeMove(e) {
    const d = winResizeRef.current; if (!d) return;
    setVentana(v => ({
      ...v,
      w: Math.max(380, Math.min(d.origW + (e.clientX - d.startX), window.innerWidth - 40)),
      h: Math.max(300, Math.min(d.origH + (e.clientY - d.startY), window.innerHeight - 40)),
    }));
  }
  function onWinResizeUp() {
    window.removeEventListener("mousemove", onWinResizeMove);
    window.removeEventListener("mouseup", onWinResizeUp);
    winResizeRef.current = null;
  }

  // Leyenda
  function editarCategoria(i, campos) { actualizarLeyenda(leyenda.map((c, j) => j === i ? { ...c, ...campos } : c)); }
  function agregarCategoria() { actualizarLeyenda([...leyenda, { color: "#cccccc", texto: "Nueva categoría" }]); }
  function borrarCategoria(i) { actualizarLeyenda(leyenda.filter((_, j) => j !== i)); }

  const coloresDisponibles = Array.from(new Set([...COLORES_DEFAULT, ...leyenda.map(c => c.color)]));

  // BURBUJA (cerrada)
  if (!abierta) {
    return (
      <button onClick={() => setAbierta(true)} style={B.burbuja} title={`Pizarra: ${titulo}`}>
        📋
      </button>
    );
  }

  // Estilo de ventana (flotante o expandida)
  const winStyle = expandida
    ? { ...B.ventana, left: 16, top: 16, width: "calc(100vw - 32px)", height: "calc(100vh - 32px)" }
    : { ...B.ventana, left: ventana.x, top: ventana.y, width: ventana.w, height: ventana.h };

  return (
    <div style={winStyle}>
      {/* Barra de título (arrastrable) */}
      <div style={B.titleBar} onMouseDown={onWinMouseDown}>
        <span style={B.titulo}>📋 {titulo}</span>
        <div style={{ display: "flex", gap: "4px" }}>
          <button style={B.winBtn} onClick={() => setExpandida(e => !e)} title={expandida ? "Restaurar" : "Expandir"}>
            {expandida ? "🗗" : "🗖"}
          </button>
          <button style={B.winBtn} onClick={() => { setAbierta(false); setExpandida(false); }} title="Minimizar">▁</button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={B.toolbar}>
        <span style={B.toolLabel}>Color:</span>
        {coloresDisponibles.map(c => (
          <button key={c} onClick={() => setColorSel(c)}
            style={{ ...B.colorDot, background: c, border: colorSel === c ? "2px solid var(--text)" : "2px solid transparent" }} />
        ))}
        <button style={B.addBtn} onClick={() => crearNota(60, 60)}>+ Nota</button>
        <span style={B.hint}>Doble clic para crear donde quieras</span>
      </div>

      {/* Pizarra */}
      <div ref={boardRef} style={B.board} onDoubleClick={onBoardDoubleClick}>
        {!cargado && <div style={B.cargando}>Cargando…</div>}

        {notas.map(nota => (
          <div key={nota.id}
            style={{ ...B.nota, left: nota.x, top: nota.y, width: nota.w, height: nota.h, background: nota.color }}
            onMouseDown={(e) => { if (e.target.classList.contains("nota-body")) return; onNotaMouseDown(e, nota, "move"); }}>
            <div style={B.notaTop}>
              <input value={nota.resp || ""}
                onChange={(e) => editarNota(nota.id, { resp: e.target.value.toUpperCase().slice(0, 3) })}
                placeholder="—" style={B.respChip} title="Iniciales del responsable"
                onMouseDown={(e) => e.stopPropagation()} />
              <span style={B.borrar} onClick={() => borrarNota(nota.id)} title="Borrar">×</span>
            </div>
            <textarea className="nota-body" value={nota.texto}
              onChange={(e) => editarNota(nota.id, { texto: e.target.value })}
              style={B.notaTexto} onMouseDown={(e) => e.stopPropagation()} />
            <div style={B.notaFooter}>{fmtFecha(nota.editado)}</div>
            <div style={B.notaResizer}
              onMouseDown={(e) => { e.stopPropagation(); onNotaMouseDown(e, nota, "resize"); }} />
          </div>
        ))}

        {/* Leyenda */}
        <div style={B.leyenda}>
          <div style={B.leyendaTitulo}>Referencias</div>
          {leyenda.map((cat, i) => (
            <div key={i} style={B.legRow}>
              <label style={{ ...B.legDot, background: cat.color }}>
                <input type="color" value={cat.color}
                  onChange={(e) => editarCategoria(i, { color: e.target.value })}
                  style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
              </label>
              <input value={cat.texto} onChange={(e) => editarCategoria(i, { texto: e.target.value })} style={B.legInput} />
              <span style={B.legDel} onClick={() => borrarCategoria(i)} title="Quitar">×</span>
            </div>
          ))}
          <button style={B.legAdd} onClick={agregarCategoria}>+ categoría</button>
        </div>
      </div>

      {/* Redimensionar ventana */}
      {!expandida && <div style={B.winResizer} onMouseDown={onWinResizeDown} title="Redimensionar" />}
    </div>
  );
}

const B = {
  burbuja: { position: "fixed", right: "24px", bottom: "24px", width: "56px", height: "56px", borderRadius: "50%", background: "var(--acc)", color: "#fff", border: "none", fontSize: "24px", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.35)", zIndex: 9000 },
  ventana: { position: "fixed", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "12px", boxShadow: "0 12px 48px rgba(0,0,0,.45)", zIndex: 9000, display: "flex", flexDirection: "column", overflow: "hidden" },
  titleBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--nav)", color: "var(--text)", cursor: "move", userSelect: "none" },
  titulo: { fontSize: "14px", fontWeight: "700" },
  winBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", borderRadius: "5px", width: "26px", height: "24px", cursor: "pointer", fontSize: "12px", lineHeight: 1 },
  toolbar: { display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", background: "var(--card)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" },
  toolLabel: { fontSize: "11px", color: "var(--text2)" },
  colorDot: { width: "20px", height: "20px", borderRadius: "50%", cursor: "pointer", padding: 0 },
  addBtn: { marginLeft: "6px", background: "var(--acc)", color: "#fff", border: "none", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", cursor: "pointer", fontWeight: "600" },
  hint: { fontSize: "10px", color: "var(--text3)", marginLeft: "4px" },
  board: { position: "relative", flex: 1, overflow: "hidden", background: "var(--bg)" },
  cargando: { padding: "24px", color: "var(--text2)", fontSize: "13px" },
  nota: { position: "absolute", borderRadius: "5px", boxShadow: "2px 3px 10px rgba(0,0,0,.3)", cursor: "grab", display: "flex", flexDirection: "column", overflow: "hidden" },
  notaTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 5px 0" },
  respChip: { width: "32px", background: "rgba(0,0,0,.12)", border: "none", borderRadius: "10px", fontSize: "10px", fontWeight: "700", color: "#1a2a1a", textAlign: "center", padding: "2px 0", outline: "none" },
  borrar: { width: "17px", height: "17px", borderRadius: "50%", background: "rgba(0,0,0,.15)", color: "#7a1a1a", fontSize: "12px", lineHeight: "17px", textAlign: "center", cursor: "pointer", fontWeight: "700" },
  notaTexto: { flex: 1, background: "transparent", border: "none", resize: "none", outline: "none", padding: "3px 9px", fontFamily: "'Bradley Hand', 'Comic Sans MS', cursive", fontSize: "14px", color: "#1a2a1a", lineHeight: "1.25", cursor: "text" },
  notaFooter: { fontSize: "8px", color: "rgba(0,0,0,.4)", padding: "0 7px 3px", textAlign: "right" },
  notaResizer: { position: "absolute", right: 0, bottom: 0, width: "13px", height: "13px", cursor: "nwse-resize", background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,.25) 50%)" },
  leyenda: { position: "absolute", right: "12px", top: "12px", width: "175px", background: "var(--card)", border: "1px solid var(--border2)", borderRadius: "10px", padding: "10px" },
  leyendaTitulo: { fontFamily: "'Bradley Hand', 'Comic Sans MS', cursive", fontSize: "15px", color: "var(--text)", marginBottom: "8px" },
  legRow: { display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" },
  legDot: { width: "14px", height: "14px", borderRadius: "50%", flexShrink: 0, position: "relative", display: "inline-block", border: "1px solid rgba(0,0,0,.2)", cursor: "pointer" },
  legInput: { flex: 1, background: "transparent", border: "none", borderBottom: "1px dashed var(--border2)", fontSize: "11px", color: "var(--text2)", outline: "none", padding: "1px 0", minWidth: 0 },
  legDel: { color: "var(--text3)", cursor: "pointer", fontSize: "13px", fontWeight: "700" },
  legAdd: { marginTop: "5px", background: "transparent", border: "1px dashed var(--border2)", color: "var(--text2)", borderRadius: "6px", padding: "3px 6px", fontSize: "10px", cursor: "pointer", width: "100%" },
  winResizer: { position: "absolute", right: 0, bottom: 0, width: "18px", height: "18px", cursor: "nwse-resize", background: "linear-gradient(135deg, transparent 45%, var(--text3) 45%, var(--text3) 55%, transparent 55%)" },
};
