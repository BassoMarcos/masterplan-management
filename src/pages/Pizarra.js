import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";

const COLORES_DEFAULT = ["#fff8e8", "#ffd9a0", "#a0e8c0", "#a0d8f0", "#f0a0c0"];

const LEYENDA_DEFAULT = [
  { color: "#a0e8c0", texto: "Asignado" },
  { color: "#ffd9a0", texto: "A discutir" },
  { color: "#a0d8f0", texto: "En progreso" },
  { color: "#f0a0c0", texto: "Urgente" },
];

function nowStr() {
  return new Date().toISOString();
}

function fmtFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export default function Pizarra() {
  const { currentUser, empresaData, logout } = useAuth();
  const navigate = useNavigate();
  const boardRef = useRef(null);

  const [notas, setNotas] = useState([]);
  const [leyenda, setLeyenda] = useState(LEYENDA_DEFAULT);
  const [colorSel, setColorSel] = useState(COLORES_DEFAULT[0]);
  const [cargado, setCargado] = useState(false);

  // Guardado (con debounce y bandera para no pisar lo entrante mientras arrastramos)
  const guardandoRef = useRef(false);
  const debounceRef = useRef(null);

  const docRef = useCallback(
    () => doc(db, "pizarras", currentUser.uid),
    [currentUser.uid]
  );

  // Escucha en tiempo real
  useEffect(() => {
    const unsub = onSnapshot(docRef(), (snap) => {
      // Si el cambio lo hicimos nosotros mismos, no lo re-aplicamos
      if (guardandoRef.current) return;
      if (snap.exists()) {
        const data = snap.data();
        setNotas(Array.isArray(data.notas) ? data.notas : []);
        setLeyenda(Array.isArray(data.leyenda) && data.leyenda.length ? data.leyenda : LEYENDA_DEFAULT);
      }
      setCargado(true);
    }, (err) => {
      console.error("Error escuchando pizarra:", err);
      setCargado(true);
    });
    return unsub;
  }, [docRef]);

  // Guardar en Firestore (debounced)
  const guardar = useCallback((nuevasNotas, nuevaLeyenda) => {
    guardandoRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await setDoc(docRef(), {
          notas: nuevasNotas,
          leyenda: nuevaLeyenda,
          empresaId: currentUser.uid,
          actualizado: nowStr(),
        });
      } catch (e) {
        console.error("Error guardando pizarra:", e);
      }
      // liberamos la bandera un toque después de guardar
      setTimeout(() => { guardandoRef.current = false; }, 400);
    }, 500);
  }, [docRef, currentUser.uid]);

  function actualizarNotas(nuevas) {
    setNotas(nuevas);
    guardar(nuevas, leyenda);
  }

  function actualizarLeyenda(nueva) {
    setLeyenda(nueva);
    guardar(notas, nueva);
  }

  // Crear nota
  function crearNota(x, y) {
    const nueva = {
      id: "n" + Date.now() + Math.random().toString(36).slice(2, 6),
      x, y, w: 150, h: 70,
      texto: "Nueva nota",
      color: colorSel,
      resp: "",
      editado: nowStr(),
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

  function borrarNota(id) {
    actualizarNotas(notas.filter(n => n.id !== id));
  }

  // Arrastrar / redimensionar
  const dragRef = useRef(null);

  function onNotaMouseDown(e, nota, modo) {
    e.preventDefault();
    const rect = boardRef.current.getBoundingClientRect();
    dragRef.current = {
      id: nota.id, modo,
      startX: e.clientX, startY: e.clientY,
      origX: nota.x, origY: nota.y, origW: nota.w, origH: nota.h,
      boardW: rect.width, boardH: rect.height,
    };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setNotas(prev => prev.map(n => {
      if (n.id !== d.id) return n;
      if (d.modo === "move") {
        let x = Math.max(0, Math.min(d.origX + dx, d.boardW - n.w));
        let y = Math.max(0, Math.min(d.origY + dy, d.boardH - n.h));
        return { ...n, x, y };
      } else {
        let w = Math.max(110, Math.min(d.origW + dx, 400));
        let h = Math.max(60, Math.min(d.origH + dy, 400));
        return { ...n, w, h };
      }
    }));
  }

  function onDragEnd() {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    const d = dragRef.current;
    dragRef.current = null;
    if (d) {
      // persistir el estado final
      setNotas(prev => {
        const final = prev.map(n => n.id === d.id ? { ...n, editado: nowStr() } : n);
        guardar(final, leyenda);
        return final;
      });
    }
  }

  // Leyenda
  function editarCategoria(i, campos) {
    actualizarLeyenda(leyenda.map((c, j) => j === i ? { ...c, ...campos } : c));
  }
  function agregarCategoria() {
    actualizarLeyenda([...leyenda, { color: "#cccccc", texto: "Nueva categoría" }]);
  }
  function borrarCategoria(i) {
    actualizarLeyenda(leyenda.filter((_, j) => j !== i));
  }

  // Colores disponibles = default + los de la leyenda (sin repetir)
  const coloresDisponibles = Array.from(new Set([...COLORES_DEFAULT, ...leyenda.map(c => c.color)]));

  return (
    <div style={S.container}>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <button style={S.backBtn} onClick={() => navigate("/proyectos")}>← Volver</button>
          <h1 style={S.headerTitle}>Pizarra · {empresaData?.nombre || "Mi Empresa"}</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ThemeSelector />
          <button style={S.logoutBtn} onClick={async () => { await logout(); navigate("/"); }}>Salir</button>
        </div>
      </header>

      <div style={S.toolbar}>
        <span style={S.toolLabel}>Color:</span>
        {coloresDisponibles.map(c => (
          <button
            key={c}
            onClick={() => setColorSel(c)}
            style={{ ...S.colorDot, background: c, border: colorSel === c ? "2px solid var(--text)" : "2px solid transparent" }}
            title={c}
          />
        ))}
        <button style={S.addBtn} onClick={() => crearNota(80, 80)}>+ Nota</button>
        <span style={S.hint}>Doble clic en la pizarra para crear una nota donde quieras</span>
      </div>

      <div ref={boardRef} style={S.board} onDoubleClick={onBoardDoubleClick}>
        {!cargado && <div style={S.cargando}>Cargando pizarra…</div>}

        {notas.map(nota => (
          <div
            key={nota.id}
            style={{ ...S.nota, left: nota.x, top: nota.y, width: nota.w, height: nota.h, background: nota.color }}
            onMouseDown={(e) => { if (e.target.classList.contains("nota-body")) return; onNotaMouseDown(e, nota, "move"); }}
          >
            <div style={S.notaTop}>
              <input
                value={nota.resp || ""}
                onChange={(e) => editarNota(nota.id, { resp: e.target.value.toUpperCase().slice(0, 3) })}
                placeholder="—"
                style={S.respChip}
                title="Iniciales del responsable"
                onMouseDown={(e) => e.stopPropagation()}
              />
              <span style={S.borrar} onClick={() => borrarNota(nota.id)} title="Borrar nota">×</span>
            </div>
            <textarea
              className="nota-body"
              value={nota.texto}
              onChange={(e) => editarNota(nota.id, { texto: e.target.value })}
              style={S.notaTexto}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <div style={S.notaFooter}>{fmtFecha(nota.editado)}</div>
            <div
              style={S.resizer}
              onMouseDown={(e) => { e.stopPropagation(); onNotaMouseDown(e, nota, "resize"); }}
              title="Redimensionar"
            />
          </div>
        ))}

        <div style={S.leyenda}>
          <div style={S.leyendaTitulo}>Referencias</div>
          {leyenda.map((cat, i) => (
            <div key={i} style={S.legRow}>
              <label style={{ ...S.legDot, background: cat.color, cursor: "pointer" }}>
                <input
                  type="color"
                  value={cat.color}
                  onChange={(e) => editarCategoria(i, { color: e.target.value })}
                  style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                />
              </label>
              <input
                value={cat.texto}
                onChange={(e) => editarCategoria(i, { texto: e.target.value })}
                style={S.legInput}
              />
              <span style={S.legDel} onClick={() => borrarCategoria(i)} title="Quitar">×</span>
            </div>
          ))}
          <button style={S.legAdd} onClick={agregarCategoria}>+ categoría</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  container: { minHeight: "100vh", background: "var(--bg)", fontFamily: "'Segoe UI', sans-serif", display: "flex", flexDirection: "column" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  backBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  headerTitle: { margin: 0, fontSize: "18px", fontWeight: "700" },
  logoutBtn: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  toolbar: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 28px", background: "var(--surface)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" },
  toolLabel: { fontSize: "12px", color: "var(--text2)", marginRight: "2px" },
  colorDot: { width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer", padding: 0 },
  addBtn: { marginLeft: "10px", background: "var(--acc)", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "13px", cursor: "pointer", fontWeight: "600" },
  hint: { fontSize: "12px", color: "var(--text3)", marginLeft: "10px" },
  board: { position: "relative", flex: 1, overflow: "hidden", minHeight: "500px" },
  cargando: { padding: "40px", color: "var(--text2)" },
  nota: { position: "absolute", borderRadius: "5px", boxShadow: "2px 3px 10px rgba(0,0,0,.3)", cursor: "grab", display: "flex", flexDirection: "column", overflow: "hidden" },
  notaTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 0" },
  respChip: { width: "34px", background: "rgba(0,0,0,.12)", border: "none", borderRadius: "10px", fontSize: "11px", fontWeight: "700", color: "#1a2a1a", textAlign: "center", padding: "2px 0", outline: "none" },
  borrar: { width: "18px", height: "18px", borderRadius: "50%", background: "rgba(0,0,0,.15)", color: "#7a1a1a", fontSize: "13px", lineHeight: "18px", textAlign: "center", cursor: "pointer", fontWeight: "700" },
  notaTexto: { flex: 1, background: "transparent", border: "none", resize: "none", outline: "none", padding: "4px 10px", fontFamily: "'Bradley Hand', 'Comic Sans MS', cursive", fontSize: "15px", color: "#1a2a1a", lineHeight: "1.25", cursor: "text" },
  notaFooter: { fontSize: "9px", color: "rgba(0,0,0,.4)", padding: "0 8px 3px", textAlign: "right" },
  resizer: { position: "absolute", right: 0, bottom: 0, width: "14px", height: "14px", cursor: "nwse-resize", background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,.25) 50%)" },
  leyenda: { position: "absolute", right: "18px", top: "18px", width: "190px", background: "var(--card)", border: "1px solid var(--border2)", borderRadius: "10px", padding: "12px" },
  leyendaTitulo: { fontFamily: "'Bradley Hand', 'Comic Sans MS', cursive", fontSize: "16px", color: "var(--text)", marginBottom: "10px" },
  legRow: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" },
  legDot: { width: "15px", height: "15px", borderRadius: "50%", flexShrink: 0, position: "relative", display: "inline-block", border: "1px solid rgba(0,0,0,.2)" },
  legInput: { flex: 1, background: "transparent", border: "none", borderBottom: "1px dashed var(--border2)", fontSize: "12px", color: "var(--text2)", outline: "none", padding: "1px 0" },
  legDel: { color: "var(--text3)", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
  legAdd: { marginTop: "6px", background: "transparent", border: "1px dashed var(--border2)", color: "var(--text2)", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", cursor: "pointer", width: "100%" },
};
