// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, collection, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { areaActivaEnProyecto } from "../config/appConfig";
import { SECCIONES_ADMIN } from "../config/configuracionGrupos";
import { s, Campo, SeccionTitulo } from "../components/configUI";
import {
  TopeMora, SeccionAvisosMora, SeccionAdelantos, SeccionPermisos, SeccionDiferencias,
  SeccionRecibos, SeccionCierre, SeccionEspeciales, SeccionTerminados,
} from "./AdministracionConfigCobros";
import {
  COLORES,
  TIPOS_INCREMENTO,
  MONEDAS,
  CADA_MESES_MAX,
  OPCIONES_PARTES,
  ajustarGrupos,
  textoGrupo,
  MODOS_AUMENTO,
  BASES_MORA,
  rebalancearDuenos,
  quitarDueno,
  textoCalendario,
  MESES_CORTO,
  nuevoId,
  completarConfig,
  num,
  validar,
  loteLimpio,
  etiquetaLote,
  validarLotes,
  diffLotes,
  normalizar,
  agruparLotes,
} from "../config/adminConfigLogica";

// Configuración de la parte administrativa de un proyecto.
// Cada empresa/proyecto define SUS reglas (financiación, mora, transferencias, cajas especiales).
// Se guarda en proyectos/{id}.adminConfig. Todavía no mueve plata: es la base sobre la que
// después se arman clientes, cobros, cajas y cierres.
//
// Vive dentro de ⚙️ Configuración (Configuracion.js): la lista de secciones y las pestañas las dibuja esa pantalla;
// acá solo va el detalle de la sección elegida y el botón de guardar.
//
// Financiación = las REGLAS del proyecto por moneda (pesos / dólares): si aumentan, cómo y cada
// cuánto, con los grupos de aumento automáticos. La cantidad de cuotas, el valor y a qué grupo va
// cada cliente se definen al FIRMAR cada lote (contrato), no acá.
//
// Lotes: lista única del proyecto en proyectos/{id}/lotes ({etapa, manzana, numero, cajaId}).
// Se cargan en Desarrollos → Manzanas y lotes (o en la configuración del proyecto si no usa
// Desarrollos). Acá solo se elige en qué caja va cada lote (Cajas separadas); ese cambio se
// guarda junto con la configuración (mismo botón, misma tanda).

// La lista de secciones (SECCIONES_ADMIN) está en config/configuracionGrupos.js y la dibuja ⚙️ Configuración.

// Guarda configuración y lotes juntos (lo usan esta pantalla y el asistente de proyecto nuevo).
// - Lotes: solo se escribe lo que cambió (nuevos, modificados, borrados).
// - "extra": otros campos del documento del proyecto que se guardan en la misma tanda.
// Firestore acepta hasta 500 escrituras por tanda: si entra todo en una, se guarda todo junto
// (o nada); si son muchos lotes, se parte y el documento del proyecto va en la última.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export async function guardarConfigYLotes({ proyectoId, limpia, cambioCfg, lotesIni, lotes, extra }) {
  const ops = diffLotes(lotesIni, lotes);
  const col = collection(db, "proyectos", proyectoId, "lotes");
  const camposProyecto = {
    ...(cambioCfg ? { adminConfig: limpia, adminConfigActualizado: serverTimestamp() } : {}),
    ...(extra || {}),
  };
  const tocaProyecto = Object.keys(camposProyecto).length > 0;
  const LIM = 450;
  const tandas = [];
  for (let i = 0; i < ops.length; i += LIM) tandas.push(ops.slice(i, i + LIM));
  if (tandas.length === 0) tandas.push([]);
  for (let t = 0; t < tandas.length; t++) {
    const b = writeBatch(db);
    tandas[t].forEach(op => {
      const ref = doc(col, op.id);
      if (op.tipo === "del") b.delete(ref);
      else if (op.tipo === "upd") b.update(ref, { ...op.data, actualizado: serverTimestamp() });
      else b.set(ref, { ...op.data, actualizado: serverTimestamp() });
    });
    if (t === tandas.length - 1 && tocaProyecto) b.update(doc(db, "proyectos", proyectoId), camposProyecto);
    await b.commit();
  }
}

// Mensaje claro según por qué falló el guardado (lo usan también el asistente y Desarrollos).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function mensajeErrorGuardar(e) {
  if (e && e.code === "permission-denied") return "No se pudo guardar: falta permiso en las reglas de Firebase. Avisale a Mark.";
  if (e && e.code === "not-found") return "Alguien borró uno de estos lotes mientras editabas. Recargá la página y volvé a hacer el cambio.";
  return "No se pudo guardar. Revisá tu conexión e intentá de nuevo.";
}

// seccion / onSeccion: qué sección se ve (la elige la lista de la pantalla central).
// onSucio(true|false): avisa si hay cambios sin guardar. irALotes(): lleva a donde se cargan los lotes.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export default function AdministracionConfig({ proyecto, puedeEditar, onGuardado, seccion, onSeccion, onSucio, irALotes }) {
  const [inicial, setInicial] = useState(() => completarConfig(proyecto?.adminConfig));
  // Arranca desde el MISMO objeto que "inicial": si se armara dos veces, los ids nuevos
  // saldrían distintos y aparecería "cambios sin guardar" sin haber tocado nada.
  const [cfg, setCfg] = useState(inicial);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lotesIni, setLotesIni] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [lotesCargando, setLotesCargando] = useState(true);
  const [lotesErrorCarga, setLotesErrorCarga] = useState("");

  const proyectoId = proyecto.id;
  const activa = SECCIONES_ADMIN.some(x => x.id === seccion) ? seccion : "financiacion";
  const setActiva = (id) => { if (onSeccion) onSeccion(id); };

  useEffect(() => {
    let vivo = true;
    async function cargarLotes() {
      try {
        const snap = await getDocs(collection(db, "proyectos", proyectoId, "lotes"));
        const arr = snap.docs.map(d => loteLimpio(d.id, d.data()));
        if (vivo) { setLotesIni(arr); setLotes(arr); }
      } catch (e) {
        if (vivo) {
          setLotesErrorCarga(e && e.code === "permission-denied"
            ? "No hay permiso para leer los lotes de este proyecto (revisar las reglas de Firebase)."
            : "No se pudieron cargar los lotes. Recargá la página.");
        }
      }
      if (vivo) setLotesCargando(false);
    }
    cargarLotes();
    return () => { vivo = false; };
  }, [proyectoId]);

  const cambioCfg = JSON.stringify(cfg) !== JSON.stringify(inicial);
  const cambioLotes = JSON.stringify(lotes) !== JSON.stringify(lotesIni);
  const cambio = cambioCfg || cambioLotes;
  const dis = !puedeEditar;

  useEffect(() => { if (onSucio) onSucio(cambio); }, [cambio, onSucio]);

  function editar(fn) {
    setOk(false);
    setError("");
    setCfg(prev => {
      const copia = JSON.parse(JSON.stringify(prev));
      fn(copia);
      return copia;
    });
  }

  function editarLotes(fn) {
    setOk(false);
    setError("");
    setLotes(prev => {
      const copia = prev.map(l => ({ ...l }));
      const r = fn(copia);
      return r || copia;
    });
  }

  async function guardar() {
    const err = validar(cfg) || validarLotes(lotes, cfg);
    if (err) { setError(err.mensaje); setActiva(err.seccion); return; }
    setGuardando(true);
    setError("");
    try {
      const limpia = normalizar(cfg);
      await guardarConfigYLotes({ proyectoId, limpia, cambioCfg, lotesIni, lotes });
      const completa = completarConfig(limpia);
      const lotesGuardados = lotes.map(l => loteLimpio(l.id, l));
      setInicial(completa);
      setCfg(completa);
      setLotesIni(lotesGuardados);
      setLotes(lotesGuardados);
      setOk(true);
      if (onGuardado && cambioCfg) onGuardado(limpia);
    } catch (e) {
      setError(mensajeErrorGuardar(e));
    }
    setGuardando(false);
  }

  function descartar() {
    setCfg(inicial);
    setLotes(lotesIni);
    setError("");
    setOk(false);
  }

  return (
    <div style={s.wrap}>
      {!puedeEditar && <p style={{ ...s.nota, marginTop: 0 }}><b>Solo lectura:</b> no tenés permiso para cambiar estas opciones.</p>}
      <div>
        {activa === "financiacion" && <SeccionFinanciacion cfg={cfg} editar={editar} dis={dis} />}
        {activa === "mora" && <SeccionMora cfg={cfg} editar={editar} dis={dis} />}
        {activa === "avisosMora" && <SeccionAvisosMora cfg={cfg} editar={editar} dis={dis} />}
        {activa === "adelantos" && <SeccionAdelantos cfg={cfg} editar={editar} dis={dis} />}
        {activa === "transferencias" && <SeccionTransferencias cfg={cfg} editar={editar} dis={dis} />}
        {activa === "permisos" && <SeccionPermisos cfg={cfg} editar={editar} dis={dis} />}
        {activa === "diferencias" && <SeccionDiferencias cfg={cfg} editar={editar} dis={dis} />}
        {activa === "recibos" && <SeccionRecibos cfg={cfg} editar={editar} dis={dis} />}
        {activa === "cierre" && <SeccionCierre cfg={cfg} editar={editar} dis={dis} />}
        {activa === "especiales" && <SeccionEspeciales cfg={cfg} editar={editar} dis={dis} />}
        {activa === "terminados" && <SeccionTerminados cfg={cfg} editar={editar} dis={dis} />}
        {activa === "distribucion" && <SeccionDistribucion cfg={cfg} editar={editar} dis={dis} />}
        {activa === "cajas" && (
          <SeccionCajas
            cfg={cfg} editar={editar} dis={dis} lotes={lotes} editarLotes={editarLotes} lotesCargando={lotesCargando}
            errorLotes={lotesErrorCarga}
            avisoLotes={<>
              Los lotes se cargan en{" "}
              <button type="button" style={s.linkBtnInline} onClick={() => irALotes && irALotes()}>
                {areaActivaEnProyecto(proyecto, "desarrollos") ? "Desarrollos → Manzanas y lotes" : "Proyecto → Lotes"}
              </button>.
            </>}
          />
        )}
      </div>

      <p style={s.nota}>
        Todavía esta configuración no mueve plata: es la base sobre la que se van a armar clientes, cobros y cierres.
        Cómo se aplica un cambio a mitad de mes se define antes de habilitar cobros.
      </p>

      {puedeEditar && (
        <div style={s.barra}>
          <div style={{ flex: 1, fontSize: 13 }}>
            {error && <span style={{ color: "var(--red, #dc2626)" }}>{error}</span>}
            {!error && ok && <span style={{ color: "var(--green, #16a34a)" }}>✓ Cambios guardados</span>}
            {!error && !ok && cambio && <span style={{ color: "var(--text2)" }}>Tenés cambios sin guardar</span>}
          </div>
          <button type="button" style={s.btnSec} onClick={descartar} disabled={!cambio || guardando}>Descartar</button>
          <button type="button" style={{ ...s.btnPri, opacity: (cambio && !guardando) ? 1 : 0.5 }} onClick={guardar} disabled={!cambio || guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionFinanciacion({ cfg, editar, dis, sinTitulo }) {
  const encendidas = MONEDAS.filter(m => cfg.financiacion[m.id].habilitada);
  return (
    <div>
      {!sinTitulo && (
        <SeccionTitulo
          icono="💳"
          nombre="Financiación"
          desc="Las reglas de las cuotas del proyecto, por moneda. La cantidad de cuotas, el valor de la cuota y el grupo de aumento de cada cliente se ponen al firmar cada lote."
        />
      )}
      <div style={s.h3}>¿En qué moneda se pueden pagar las cuotas?</div>
      <div style={{ ...s.modoFila, marginBottom: 14 }}>
        {MONEDAS.map(m => {
          const on = cfg.financiacion[m.id].habilitada;
          return (
            <button
              key={m.id}
              type="button"
              disabled={dis}
              onClick={() => editar(c => { c.financiacion[m.id].habilitada = !on; })}
              style={{ ...s.modoBtn, ...(on ? s.modoBtnOn : {}) }}
            >
              {on ? "✓ " : ""}{m.nombre}
            </button>
          );
        })}
      </div>
      {encendidas.length === 0 && <p style={s.vacio}>Elegí al menos una moneda.</p>}
      {encendidas.map(m => (
        <ReglaMoneda key={m.id} id={m.id} nombre={m.nombre} f={cfg.financiacion[m.id]} editar={editar} dis={dis} />
      ))}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function ReglaMoneda({ id, nombre, f, editar, dis }) {
  const inc = f.incremento;
  const n = num(inc.cadaMeses);
  const nValido = Number.isInteger(n) && n >= 1 && n <= CADA_MESES_MAX;
  const tipoInfo = TIPOS_INCREMENTO.find(t => t.id === inc.tipo) || TIPOS_INCREMENTO[0];

  const calendario = inc.modo === "calendario";

  function setTipo(t) {
    editar(c => {
      const x = c.financiacion[id];
      x.incremento.tipo = t;
      if (t !== "no" && x.incremento.modo !== "calendario") x.grupos = ajustarGrupos(x.grupos, x.incremento.cadaMeses);
    });
  }
  function setModo(m) {
    editar(c => {
      const x = c.financiacion[id];
      x.incremento.modo = m;
      if (m !== "calendario") x.grupos = ajustarGrupos(x.grupos, x.incremento.cadaMeses);
    });
  }
  function setCada(v) {
    editar(c => {
      const x = c.financiacion[id];
      x.incremento.cadaMeses = v;
      const nv = num(v);
      // Mientras se escribe un número inválido no se tocan los grupos (así no se pierden los nombres).
      if (Number.isInteger(nv) && nv >= 1 && nv <= CADA_MESES_MAX) x.grupos = ajustarGrupos(x.grupos, nv);
    });
  }

  return (
    <div style={s.plan}>
      <div style={{ ...s.h3, fontSize: 15 }}>Cuotas en {nombre.toLowerCase()}</div>
      <div style={{ ...s.grid, marginTop: 10 }}>
        <Campo label="¿Incrementan?">
          <select style={s.input} disabled={dis} value={inc.tipo} onChange={e => setTipo(e.target.value)}>
            {TIPOS_INCREMENTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Campo>
        {inc.tipo !== "no" && (
          <Campo label="¿Cada cuántos meses?">
            <input style={s.input} disabled={dis} type="number" min="1" max={CADA_MESES_MAX} value={inc.cadaMeses} onChange={e => setCada(e.target.value)} />
          </Campo>
        )}
        {inc.tipo !== "no" && (
          <Campo label="¿Cómo se reparten los aumentos?">
            <select style={s.input} disabled={dis} value={calendario ? "calendario" : "grupos"} onChange={e => setModo(e.target.value)}>
              {MODOS_AUMENTO.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Campo>
        )}
        {inc.tipo !== "no" && calendario && (
          <Campo label="Mes del primer aumento">
            <select style={s.input} disabled={dis} value={String(inc.mesInicio || 1)} onChange={e => editar(c => { c.financiacion[id].incremento.mesInicio = Number(e.target.value); })}>
              {MESES_CORTO.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </select>
          </Campo>
        )}
        {inc.tipo === "fijo" && (
          <Campo label="Porcentaje por aumento (%)">
            <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={inc.porcentaje} onChange={e => editar(c => { c.financiacion[id].incremento.porcentaje = e.target.value; })} />
          </Campo>
        )}
      </div>
      <p style={s.nota}>{tipoInfo.ayuda}</p>

      {inc.tipo !== "no" && nValido && calendario && (
        <div style={{ ...s.grupoFila, marginTop: 14, display: "block" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>Aumentan todos juntos en: {textoCalendario(inc.mesInicio || 1, n)}</div>
          <div style={{ fontSize: 12.5, color: "var(--text2)", marginTop: 4 }}>Aunque un cliente haya firmado hace poco, aumenta igual que todos en esos meses.</div>
        </div>
      )}

      {inc.tipo !== "no" && nValido && !calendario && f.grupos.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={s.h3}>Grupos de aumento: {f.grupos.length}</div>
          <p style={{ ...s.sub, marginBottom: 10 }}>
            {n === 1
              ? "Aumenta todos los meses: un solo grupo."
              : `Como aumenta cada ${n} meses, los clientes se reparten en ${n} grupos: cada mes aumenta un grupo distinto. A qué grupo va cada cliente se decide al firmar su lote. Si querés, cambiales el nombre y el color.`}
          </p>
          {f.grupos.map((g, gi) => (
            <div key={g.id} style={s.grupoFila}>
              <span style={{ ...s.leyDot, background: g.color, width: 14, height: 14 }} />
              <input
                style={{ ...s.input, flex: "0 1 170px", minWidth: 120 }}
                disabled={dis}
                value={g.nombre}
                onChange={e => editar(c => { c.financiacion[id].grupos[gi].nombre = e.target.value; })}
              />
              <span style={{ fontSize: 12.5, color: "var(--text2)", flex: 1, minWidth: 150 }}>{textoGrupo(gi + 1, n)}</span>
              {!dis && (
                <div style={s.colores}>
                  {COLORES.map(col => (
                    <button
                      key={col}
                      type="button"
                      aria-label={`Color ${col}`}
                      onClick={() => editar(c => { c.financiacion[id].grupos[gi].color = col; })}
                      style={{ ...s.colorDot, width: 16, height: 16, background: col, outline: g.color === col ? "2px solid var(--text)" : "none" }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionMora({ cfg, editar, dis }) {
  const m = cfg.cobranza.mora;
  return (
    <div>
      <SeccionTitulo icono="⚠️" nombre="Mora" desc="Hasta qué día del mes el cliente puede pagar la cuota sin interés, y cuánto interés se cobra por cada día de atraso." />
      <div style={s.grid}>
        <Campo label="Interés por mora">
          <select style={s.input} disabled={dis} value={m.activa ? "si" : "no"} onChange={e => editar(c => { c.cobranza.mora.activa = e.target.value === "si"; })}>
            <option value="no">Sin mora</option>
            <option value="si">Activo</option>
          </select>
        </Campo>
        {m.activa && (
          <>
            <Campo label="Último día del mes para pagar sin interés">
              <input style={s.input} disabled={dis} type="number" min="1" max="31" value={m.ultimoDia} onChange={e => editar(c => { c.cobranza.mora.ultimoDia = e.target.value; })} />
            </Campo>
            <Campo label="Interés por día de atraso (%)">
              <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={m.porcentajeDia} onChange={e => editar(c => { c.cobranza.mora.porcentajeDia = e.target.value; })} />
            </Campo>
            <Campo label="¿Sobre qué valor se calcula el interés?">
              <select style={s.input} disabled={dis} value={m.base === "primera" ? "primera" : "anterior"} onChange={e => editar(c => { c.cobranza.mora.base = e.target.value; })}>
                {BASES_MORA.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </Campo>
          </>
        )}
      </div>
      <p style={s.nota}>
        {m.activa
          ? (Number.isInteger(num(m.ultimoDia)) && num(m.ultimoDia) >= 1 && num(m.ultimoDia) < 31
            ? `Ejemplo: quien paga el día ${num(m.ultimoDia) + 1} tiene 1 día de atraso${num(m.porcentajeDia) > 0 ? ` (${num(m.porcentajeDia)}% de ${m.base === "primera" ? "la primera cuota" : "la última cuota del mes anterior"})` : ""}. Si el mes tiene menos días, vale el último día del mes.`
            : "Si el mes tiene menos días, vale el último día del mes.")
          : "Los clientes que no pagan a tiempo no generan interés."}
      </p>
      {m.activa && <TopeMora cfg={cfg} editar={editar} dis={dis} />}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionTransferencias({ cfg, editar, dis }) {
  const t = cfg.cobranza.transferencia;
  return (
    <div>
      <SeccionTitulo icono="🏦" nombre="Transferencias" desc="Cuánto se suma sobre el valor de la cuota cuando el cliente paga por transferencia." />
      <div style={s.grid}>
        <Campo label="Recargo sobre el valor base (%)">
          <input style={s.input} disabled={dis} type="number" min="0" step="0.01" value={t.impuestoPct} onChange={e => editar(c => { c.cobranza.transferencia.impuestoPct = e.target.value; })} />
        </Campo>
      </div>
      <p style={s.nota}>
        {num(t.impuestoPct) > 0
          ? `Ejemplo: una cuota de $100.000 pagada por transferencia se cobra $${Math.round(100000 * (1 + num(t.impuestoPct) / 100)).toLocaleString("es-AR")}.`
          : "Con 0, las transferencias se cobran sin recargo."}
      </p>
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionDistribucion({ cfg, editar, dis }) {
  // Orden en que la persona fue tocando los %: los que NO tocó absorben la diferencia.
  const [tocados, setTocados] = useState([]);
  function cambiarPct(id, valor) {
    const r = rebalancearDuenos(cfg.duenos, id, valor, tocados);
    setTocados(r.tocados);
    editar(c => { c.duenos = r.duenos; });
  }
  function quitar(id) {
    const r = quitarDueno(cfg.duenos, id, tocados);
    setTocados(r.tocados);
    editar(c => { c.duenos = r.duenos; });
  }
  const suma = cfg.duenos.reduce((acc, du) => acc + (Number.isFinite(num(du.porcentaje)) ? num(du.porcentaje) : 0), 0);
  const sumaR = Math.round(suma * 100) / 100;
  const ok = Math.abs(suma - 100) <= 0.01;
  return (
    <div>
      <SeccionTitulo
        icono="📊"
        nombre="Dueños y distribución de ganancias"
        desc="Si el proyecto se divide entre varios dueños, cargá cada uno con su porcentaje. Lo que entra queda separado según esos porcentajes, listo para repartir las ganancias. Si hay un solo dueño, dejalo con 100%."
      />
      {cfg.duenos.map((du, i) => (
        <div key={du.id} style={s.caja}>
          <input
            style={{ ...s.input, flex: 2, minWidth: 180 }}
            disabled={dis}
            placeholder="Nombre del dueño (ej. Socio A)"
            value={du.nombre}
            onChange={e => editar(c => { c.duenos[i].nombre = e.target.value; })}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 120 }}>
            <input
              style={s.input}
              disabled={dis}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={du.porcentaje}
              onChange={e => cambiarPct(du.id, e.target.value)}
            />
            <span style={{ color: "var(--text2)" }}>%</span>
          </div>
          {!dis && cfg.duenos.length > 1 && (
            <button type="button" style={s.quitar} onClick={() => quitar(du.id)}>Quitar</button>
          )}
        </div>
      ))}
      <p style={{ ...s.nota, color: ok ? "var(--green, #16a34a)" : "var(--red, #dc2626)", fontWeight: 600 }}>
        {ok ? "✓ Suman 100%" : `Suman ${sumaR}%: tienen que sumar 100%.`}
      </p>
      {!dis && (
        <button
          type="button"
          style={{ ...s.btnSec, marginTop: 10 }}
          onClick={() => editar(c => {
            const resto = Math.max(0, Math.round((100 - suma) * 100) / 100);
            c.duenos.push({ id: nuevoId(), nombre: "", porcentaje: resto });
          })}
        >
          + Agregar dueño
        </button>
      )}
    </div>
  );
}

// Grilla para marcar lotes (se usa en Cajas especiales; más adelante también en el asistente).
// estado(l) → "on" (marcado), "otro" (tomado por otra cosa; se muestra con aviso) u "off".
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SelectorLotes({ lotes, estado, textoOtro, onCambiar, dis }) {
  const grupos = agruparLotes(lotes);
  return (
    <div>
      {grupos.map(g => (
        <div key={g.etapa} style={{ marginTop: 10 }}>
          <div style={{ ...s.etapaTitulo, fontSize: 13 }}>{g.etapa}</div>
          {g.manzanas.map(mz => {
            const todosOn = mz.lotes.every(l => estado(l) === "on");
            return (
              <div key={mz.manzana || "_sin"} style={s.mzBloque}>
                <div style={s.mzTop}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{mz.manzana || "Sin manzana"}</span>
                  {!dis && (
                    <button type="button" style={s.linkBtn} onClick={() => onCambiar(mz.lotes.map(l => l.id), !todosOn)}>
                      {todosOn ? "Quitar todos" : "Marcar todos"}
                    </button>
                  )}
                </div>
                <div style={s.chips}>
                  {mz.lotes.map(l => {
                    const e = estado(l);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        title={e === "otro" ? `${etiquetaLote(l)} — ${textoOtro(l)}` : etiquetaLote(l)}
                        onClick={() => { if (!dis) onCambiar([l.id], e !== "on"); }}
                        style={{
                          ...s.chip,
                          border: e === "on" ? "2px solid #BA7517" : "2px dashed var(--border2)",
                          background: e === "on" ? "#BA751722" : "var(--bg)",
                          color: e === "otro" ? "var(--text2)" : "var(--text)",
                          cursor: dis ? "default" : "pointer",
                        }}
                      >
                        {l.numero}
                        {e === "otro" && <span style={s.marcaChip}>★</span>}
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

// "avisoLotes": dónde se cargan los lotes (cambia según la pantalla que la usa).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionCajas({ cfg, editar, dis, lotes, editarLotes, lotesCargando, avisoLotes, errorLotes }) {
  const [abierta, setAbierta] = useState(null);

  function agregarCaja() {
    const id = nuevoId();
    editar(c => { c.cajasEspeciales.push({ id, nombre: "", nota: "" }); });
    setAbierta(id);
  }

  function quitarCaja(i, caja) {
    const n = lotes.filter(l => l.cajaId === caja.id).length;
    if (n > 0 && !window.confirm(`La caja "${caja.nombre || "sin nombre"}" tiene ${n} lote(s). Si la quitás, esos lotes vuelven a la caja principal. ¿Seguir?`)) return;
    if (n > 0) editarLotes(c => { c.forEach(l => { if (l.cajaId === caja.id) l.cajaId = null; }); });
    editar(x => { x.cajasEspeciales.splice(i, 1); });
    if (abierta === caja.id) setAbierta(null);
  }

  const nombreCaja = (id) => { const c = cfg.cajasEspeciales.find(x => x.id === id); return c ? (c.nombre || "otra caja") : "otra caja"; };

  return (
    <div>
      <SeccionTitulo
        icono="🗃️"
        nombre="Cajas separadas de la caja central"
        desc={'Por ejemplo: si a un participante del desarrollo se le pagó con lotes, su caja separa esos lotes y los pagos de esos lotes van solo ahí, sin mezclarse con la caja central. Creá las cajas que necesites y elegí qué lotes le corresponden a cada una.'}
      />
      {cfg.cajasEspeciales.length === 0 && <p style={s.vacio}>Todavía no hay cajas separadas.</p>}
      {cfg.cajasEspeciales.map((c, i) => {
        const cant = lotes.filter(l => l.cajaId === c.id).length;
        const open = abierta === c.id;
        return (
          <div key={c.id} style={s.plan}>
            <div style={s.caja}>
              <input
                style={{ ...s.input, flex: 1, minWidth: 160, fontWeight: 700 }}
                disabled={dis}
                placeholder="Nombre de la caja (ej. Agrimensores)"
                value={c.nombre}
                onChange={e => editar(x => { x.cajasEspeciales[i].nombre = e.target.value; })}
              />
              <input
                style={{ ...s.input, flex: 2, minWidth: 200 }}
                disabled={dis}
                placeholder="Nota (opcional)"
                value={c.nota}
                onChange={e => editar(x => { x.cajasEspeciales[i].nota = e.target.value; })}
              />
              {!dis && <button type="button" style={s.quitar} onClick={() => quitarCaja(i, c)}>Quitar</button>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>{cant} lote(s) en esta caja</span>
              {lotes.length > 0 && (
                <button type="button" style={s.btnSec} onClick={() => setAbierta(open ? null : c.id)}>
                  {open ? "Listo" : (dis ? "Ver lotes" : "Elegir lotes")}
                </button>
              )}
            </div>
            {open && (
              <div style={{ marginTop: 8 }}>
                <p style={{ ...s.nota, marginTop: 0 }}>
                  Tocá los lotes que le corresponden a esta caja. Los que tienen ★ están en otra caja: si los tocás, pasan a esta.
                </p>
                <SelectorLotes
                  lotes={lotes}
                  dis={dis}
                  estado={l => (l.cajaId === c.id ? "on" : (l.cajaId ? "otro" : "off"))}
                  textoOtro={l => `está en ${nombreCaja(l.cajaId)}`}
                  onCambiar={(ids, marcar) => editarLotes(arr => {
                    const set = new Set(ids);
                    arr.forEach(l => { if (set.has(l.id)) l.cajaId = marcar ? c.id : null; });
                  })}
                />
              </div>
            )}
          </div>
        );
      })}
      {errorLotes && <p style={{ ...s.nota, color: "var(--red, #dc2626)" }}>{errorLotes}</p>}
      {!lotesCargando && !errorLotes && lotes.length === 0 && cfg.cajasEspeciales.length > 0 && (
        <p style={s.nota}>Todavía no hay lotes para elegir. {avisoLotes || "Cargalos primero."}</p>
      )}
      {!lotesCargando && lotes.length > 0 && avisoLotes && <p style={s.nota}>{avisoLotes}</p>}
      {!dis && <button type="button" style={{ ...s.btnSec, marginTop: 6 }} onClick={agregarCaja}>+ Nueva caja</button>}
    </div>
  );
}

// "¿En cuántas partes está partido cada lote?" → se guarda como rango de letras ("A-C" = A, B, C).
// Si viene algo escrito a mano de antes (ej. "A, D"), se muestra como opción aparte para no perderlo.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SelectorPartes({ value, onChange, sinEntero, disabled }) {
  const opciones = OPCIONES_PARTES.filter(o => !(sinEntero && o.v === ""));
  const conocido = opciones.some(o => o.v === (value || ""));
  return (
    <select style={s.input} disabled={disabled} value={value || ""} onChange={e => onChange(e.target.value)}>
      {sinEntero && <option value="">Elegí…</option>}
      {!conocido && value ? <option value={value}>Letras: {value}</option> : null}
      {opciones.map(o => <option key={o.v || "entero"} value={o.v}>{o.label}</option>)}
    </select>
  );
}


// Estilos compartidos con el asistente de proyecto nuevo y Desarrollos.
export { s as estilosConfig, Campo, SeccionTitulo };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
AdministracionConfig.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
