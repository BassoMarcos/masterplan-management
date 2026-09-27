import { useState } from "react";
import {
  nuevoIdLote,
  claveLote,
  cmpNatural,
  parseLetras,
  numerosDeRango,
  partirLote,
  agruparLotes,
} from "../config/adminConfigLogica";
import { Campo, SelectorPartes, SeccionTitulo, estilosConfig as s } from "../pages/AdministracionConfig";

// Editor de la lista única de lotes del proyecto (proyectos/{id}/lotes): etapas, manzanas y números.
// Vive en Desarrollos → Manzanas y lotes. No maneja cajas: eso es de Administración (Cajas separadas).
// Solo edita en memoria ("editarLotes"); guardar lo hace la pantalla que lo usa.
export default function EditorLotes({ lotes, editarLotes, dis, cargando, errorCarga }) {
  // Formulario de alta
  const [modo, setModo] = useState("rango");
  const [etapa, setEtapa] = useState("");
  const [manzana, setManzana] = useState("");
  const [desde, setDesde] = useState("1");
  const [hasta, setHasta] = useState("");
  const [letrasAlta, setLetrasAlta] = useState("");
  const [numero, setNumero] = useState("");
  const [letrasPartir, setLetrasPartir] = useState("");
  const [msgPartir, setMsgPartir] = useState("");
  const [msgAlta, setMsgAlta] = useState("");

  // Selección y filtro por etapa
  const [sel, setSel] = useState(() => new Set());
  const [filtro, setFiltro] = useState("");

  if (cargando) {
    return (
      <div>
        <SeccionTitulo icono="🧩" nombre="Manzanas y lotes" desc="Cargando lotes…" />
      </div>
    );
  }

  const etapasExistentes = [...new Set(lotes.map(l => l.etapa).filter(Boolean))].sort(cmpNatural);
  const manzanasExistentes = [...new Set(lotes.filter(l => !etapa.trim() || l.etapa.toLowerCase() === etapa.trim().toLowerCase()).map(l => l.manzana).filter(Boolean))].sort(cmpNatural);

  function crear() {
    const et = etapa.trim();
    const mz = manzana.trim();
    if (!et) { setMsgAlta("Escribí la etapa (por ejemplo: Etapa 1)."); return; }
    let numeros = [];
    if (modo === "rango") {
      const d = Number(desde);
      const h = Number(hasta);
      if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h < d) { setMsgAlta("Revisá los números: \"del\" tiene que ser 1 o más, y \"al\" igual o mayor."); return; }
      const pl = parseLetras(letrasAlta);
      if (pl.error) { setMsgAlta(pl.error); return; }
      if ((h - d + 1) * Math.max(1, pl.letras.length) > 500) { setMsgAlta("Se pueden crear hasta 500 lotes por vez."); return; }
      numeros = numerosDeRango(d, h, pl.letras);
    } else {
      if (!numero.trim()) { setMsgAlta("Escribí el número del lote (por ejemplo: 4B)."); return; }
      numeros = [numero.trim()];
    }
    const existentes = new Set(lotes.map(claveLote));
    const nuevos = [];
    let repetidos = 0;
    numeros.forEach(n => {
      const l = { id: nuevoIdLote(), etapa: et, manzana: mz, numero: n, cajaId: null };
      const k = claveLote(l);
      if (existentes.has(k)) repetidos++;
      else { nuevos.push(l); existentes.add(k); }
    });
    if (nuevos.length) editarLotes(c => c.concat(nuevos));
    const donde = `${et}${mz ? " · " + mz : ""}`;
    if (nuevos.length && repetidos) setMsgAlta(`✓ ${nuevos.length} lote(s) agregados en ${donde}. ${repetidos} ya existían y no se repitieron.`);
    else if (nuevos.length) setMsgAlta(`✓ ${nuevos.length} lote(s) agregados en ${donde}. Acordate de guardar.`);
    else setMsgAlta(`Esos lotes ya existían en ${donde}: no se agregó nada.`);
    if (modo === "uno") setNumero("");
  }

  const visibles = filtro ? lotes.filter(l => l.etapa === filtro) : lotes;
  const grupos = agruparLotes(visibles);

  function toggle(id) {
    setSel(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleGrupo(ids) {
    setSel(prev => {
      const n = new Set(prev);
      const todos = ids.every(id => n.has(id));
      ids.forEach(id => { if (todos) n.delete(id); else n.add(id); });
      return n;
    });
  }
  const selLotes = lotes.filter(l => sel.has(l.id));
  const unico = selLotes.length === 1 ? selLotes[0] : null;

  function eliminarSeleccionados() {
    const enCaja = selLotes.filter(l => l.cajaId).length;
    const aviso = enCaja ? `\n\nOjo: ${enCaja} de esos lotes están en una caja separada de Administración.` : "";
    if (!window.confirm(`¿Eliminar ${selLotes.length} lote(s)? Se borran al guardar los cambios.${aviso}`)) return;
    editarLotes(c => c.filter(l => !sel.has(l.id)));
    setSel(new Set());
  }
  function editarUnico(campo, valor) {
    editarLotes(c => { c.forEach(l => { if (l.id === unico.id) l[campo] = valor; }); });
  }
  function partir() {
    const pl = parseLetras(letrasPartir);
    if (pl.error) { setMsgPartir(pl.error); return; }
    if (!pl.letras.length) { setMsgPartir("Elegí en cuántas partes."); return; }
    const r = partirLote(lotes, unico.id, pl.letras);
    if (!r.creados) { setMsgPartir("Esas letras ya existían: no se agregó nada."); return; }
    editarLotes(() => r.lotes);
    if (r.reemplazado) setSel(new Set());
    setLetrasPartir("");
    setMsgPartir(`✓ ${r.creados} lote(s) nuevos${r.reemplazado ? " (el lote sin letra se reemplazó)" : ""}. Acordate de guardar.`);
  }

  return (
    <div>
      <SeccionTitulo
        icono="🧩"
        nombre="Manzanas y lotes"
        desc="La lista única de lotes del proyecto, por etapa y manzana. Comercial, Legales y Administración usan esta misma lista."
      />

      {errorCarga && <p style={{ ...s.nota, color: "var(--red, #dc2626)", marginTop: 0 }}>{errorCarga}</p>}

      {!dis && !errorCarga && (
        <div style={s.bloque}>
          <div style={s.h3}>Agregar lotes</div>
          <div style={s.modoFila}>
            <button type="button" onClick={() => setModo("rango")} style={{ ...s.modoBtn, ...(modo === "rango" ? s.modoBtnOn : {}) }}>Varios (del … al …)</button>
            <button type="button" onClick={() => setModo("uno")} style={{ ...s.modoBtn, ...(modo === "uno" ? s.modoBtnOn : {}) }}>Uno suelto (ej. 4B)</button>
          </div>
          <div style={s.grid}>
            <Campo label="Etapa *">
              <input style={s.input} list="mp-etapas" placeholder="Ej: Etapa 1" value={etapa} onChange={e => setEtapa(e.target.value)} />
            </Campo>
            <Campo label="Manzana (si tiene)">
              <input style={s.input} list="mp-manzanas" placeholder="Ej: M1" value={manzana} onChange={e => setManzana(e.target.value)} />
            </Campo>
            {modo === "rango" ? (
              <>
                <Campo label="Del lote">
                  <input style={s.input} type="number" min="1" value={desde} onChange={e => setDesde(e.target.value)} />
                </Campo>
                <Campo label="Al lote">
                  <input style={s.input} type="number" min="1" placeholder="Ej: 20" value={hasta} onChange={e => setHasta(e.target.value)} />
                </Campo>
                <Campo label="¿Están partidos?">
                  <SelectorPartes value={letrasAlta} onChange={setLetrasAlta} />
                </Campo>
              </>
            ) : (
              <Campo label="Número de lote">
                <input style={s.input} placeholder="Ej: 4B" value={numero} onChange={e => setNumero(e.target.value)} />
              </Campo>
            )}
          </div>
          <datalist id="mp-etapas">{etapasExistentes.map(e => <option key={e} value={e} />)}</datalist>
          <datalist id="mp-manzanas">{manzanasExistentes.map(m => <option key={m} value={m} />)}</datalist>
          {modo === "rango" && (() => {
            const d = Number(desde);
            const h = Number(hasta);
            const pl = parseLetras(letrasAlta);
            if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h < d || pl.error) return null;
            const nums = numerosDeRango(d, h, pl.letras);
            const muestra = nums.length > 10 ? nums.slice(0, 8).join(", ") + ` … ${nums[nums.length - 1]}` : nums.join(", ");
            return <p style={s.nota}>Se van a crear {nums.length} lote(s): {muestra}</p>;
          })()}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" style={s.btnSec} onClick={crear}>+ Agregar</button>
            {msgAlta && <span style={{ fontSize: 13, color: "var(--text2)" }}>{msgAlta}</span>}
          </div>
        </div>
      )}

      {lotes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
          <span style={s.resumenLotes}>{lotes.length} lote(s)</span>
          {etapasExistentes.length > 1 && (
            <select style={{ ...s.input, width: "auto" }} value={filtro} onChange={e => setFiltro(e.target.value)}>
              <option value="">Todas las etapas</option>
              {etapasExistentes.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
          {!dis && visibles.length > 0 && (
            <button type="button" style={s.quitar} onClick={() => toggleGrupo(visibles.map(l => l.id))}>Seleccionar / quitar todos los que se ven</button>
          )}
        </div>
      )}

      {!dis && selLotes.length > 0 && (
        <div style={s.barraSel}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>{selLotes.length} seleccionado(s)</b>
            <button type="button" style={s.quitar} onClick={() => setSel(new Set())}>Quitar selección</button>
            <button type="button" style={{ ...s.quitar, color: "var(--red, #dc2626)" }} onClick={eliminarSeleccionados}>Eliminar</button>
          </div>
          {unico && (
            <div style={{ ...s.grid, marginTop: 10 }}>
              <Campo label="Etapa">
                <input style={s.input} value={unico.etapa} onChange={e => editarUnico("etapa", e.target.value)} />
              </Campo>
              <Campo label="Manzana">
                <input style={s.input} value={unico.manzana} onChange={e => editarUnico("manzana", e.target.value)} />
              </Campo>
              <Campo label="Número">
                <input style={s.input} value={unico.numero} onChange={e => editarUnico("numero", e.target.value)} />
              </Campo>
            </div>
          )}
          {unico && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <Campo label={`Partir el lote ${(String(unico.numero).match(/^\d+/) || [unico.numero])[0]} en`}>
                <SelectorPartes value={letrasPartir} onChange={v => { setLetrasPartir(v); setMsgPartir(""); }} sinEntero />
              </Campo>
              <button type="button" style={s.btnSec} onClick={partir}>Partir</button>
              {msgPartir && <span style={{ fontSize: 13, color: "var(--text2)" }}>{msgPartir}</span>}
            </div>
          )}
        </div>
      )}

      {!errorCarga && lotes.length === 0 && <p style={s.vacio}>Todavía no hay lotes. Agregá los primeros con el formulario de arriba.</p>}

      {grupos.map(g => (
        <div key={g.etapa} style={{ marginTop: 16 }}>
          <div style={s.etapaTitulo}>{g.etapa}</div>
          {g.manzanas.map(({ manzana: mz, lotes: grupo }) => {
            const ids = grupo.map(l => l.id);
            return (
              <div key={mz || "_sin"} style={s.mzBloque}>
                <div style={s.mzTop}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{mz || "Sin manzana"}</span>
                  <span style={{ fontSize: 12, color: "var(--text2)" }}>{grupo.length} lote(s)</span>
                  {!dis && <button type="button" style={s.linkBtn} onClick={() => toggleGrupo(ids)}>Seleccionar {mz ? "manzana" : "grupo"}</button>}
                </div>
                <div style={s.chips}>
                  {grupo.map(l => {
                    const on = sel.has(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => { if (!dis) toggle(l.id); }}
                        style={{
                          ...s.chip,
                          border: "2px solid var(--border2)",
                          ...(on ? { background: "var(--acc)", color: "#fff" } : {}),
                          cursor: dis ? "default" : "pointer",
                        }}
                      >
                        {l.numero}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
