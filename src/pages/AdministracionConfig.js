import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { doc, collection, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { areaActivaEnProyecto } from "../config/appConfig";
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
// Layout: lista de secciones a la izquierda, el detalle de la sección elegida a la derecha
// (como los Ajustes de cualquier app grande) — para no mezclar todo en una sola pantalla larga.
//
// Financiación = las REGLAS del proyecto por moneda (pesos / dólares): si aumentan, cómo y cada
// cuánto, con los grupos de aumento automáticos. La cantidad de cuotas, el valor y a qué grupo va
// cada cliente se definen al FIRMAR cada lote (contrato), no acá.
//
// Lotes: lista única del proyecto en proyectos/{id}/lotes ({etapa, manzana, numero, cajaId}).
// Se cargan en Desarrollos → Manzanas y lotes (o en la configuración del proyecto si no usa
// Desarrollos). Acá solo se elige en qué caja va cada lote (Cajas separadas); ese cambio se
// guarda junto con la configuración (mismo botón, misma tanda).

// Las secciones que aparecen en la lista de la izquierda.
const SECCIONES = [
  { id: "financiacion", icono: "💳", nombre: "Financiación", resumen: "Monedas e incrementos" },
  { id: "mora", icono: "⚠️", nombre: "Mora", resumen: "Interés por atraso" },
  { id: "transferencias", icono: "🏦", nombre: "Transferencias", resumen: "Impuesto sobre transferencias" },
  { id: "distribucion", icono: "📊", nombre: "Dueños", resumen: "Distribución de ganancias" },
  { id: "cajas", icono: "🗃️", nombre: "Cajas separadas", resumen: "Lotes que no van a la caja central" },
];

// Guarda configuración y lotes juntos (lo usan esta pantalla y el asistente de proyecto nuevo).
// - Lotes: solo se escribe lo que cambió (nuevos, modificados, borrados).
// - "extra": otros campos del documento del proyecto que se guardan en la misma tanda.
// Firestore acepta hasta 500 escrituras por tanda: si entra todo en una, se guarda todo junto
// (o nada); si son muchos lotes, se parte y el documento del proyecto va en la última.
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
export function mensajeErrorGuardar(e) {
  if (e && e.code === "permission-denied") return "No se pudo guardar: falta permiso en las reglas de Firebase. Avisale a Mark.";
  if (e && e.code === "not-found") return "Alguien borró uno de estos lotes mientras editabas. Recargá la página y volvé a hacer el cambio.";
  return "No se pudo guardar. Revisá tu conexión e intentá de nuevo.";
}

export default function AdministracionConfig({ proyecto, puedeEditar, onGuardado }) {
  const [inicial, setInicial] = useState(() => completarConfig(proyecto?.adminConfig));
  // Arranca desde el MISMO objeto que "inicial": si se armara dos veces, los ids nuevos
  // saldrían distintos y aparecería "cambios sin guardar" sin haber tocado nada.
  const [cfg, setCfg] = useState(inicial);
  const [activa, setActiva] = useState("financiacion");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lotesIni, setLotesIni] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [lotesCargando, setLotesCargando] = useState(true);
  const [lotesErrorCarga, setLotesErrorCarga] = useState("");

  const proyectoId = proyecto.id;
  const navigate = useNavigate();
  const rutaLotes = areaActivaEnProyecto(proyecto, "desarrollos")
    ? `/proyecto/${proyectoId}/desarrollos/lotes`
    : `/proyecto/${proyectoId}/configurar`;

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
      <div style={s.intro}>
        Acá definís cómo funciona la administración de este proyecto. Cada empresa arma sus reglas.
        {!puedeEditar && <b> Solo lectura: no tenés permiso para cambiar estas opciones.</b>}
        {puedeEditar && (
          <div style={{ marginTop: 8 }}>
            Repasar con preguntas:{" "}
            <button type="button" style={s.linkBtnInline} onClick={() => navigate(`/proyecto/${proyectoId}/administracion/configurar`)}>
              asistente de Administración
            </button>
            {" · "}Áreas, lotes y datos del proyecto:{" "}
            <button type="button" style={s.linkBtnInline} onClick={() => navigate(`/proyecto/${proyectoId}/configurar`)}>
              configuración del proyecto
            </button>
          </div>
        )}
      </div>

      <div style={s.layout}>
        <nav style={s.lista}>
          {SECCIONES.map(sec => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiva(sec.id)}
              style={{ ...s.item, ...(activa === sec.id ? s.itemActivo : {}) }}
            >
              <span style={s.itemIcono}>{sec.icono}</span>
              <span style={{ minWidth: 0 }}>
                <div style={s.itemNombre}>{sec.nombre}</div>
                <div style={s.itemResumen}>{sec.resumen}</div>
              </span>
            </button>
          ))}
        </nav>

        <div style={s.detalle}>
          {activa === "financiacion" && <SeccionFinanciacion cfg={cfg} editar={editar} dis={dis} />}
          {activa === "mora" && <SeccionMora cfg={cfg} editar={editar} dis={dis} />}
          {activa === "transferencias" && <SeccionTransferencias cfg={cfg} editar={editar} dis={dis} />}
          {activa === "distribucion" && <SeccionDistribucion cfg={cfg} editar={editar} dis={dis} />}
          {activa === "cajas" && (
            <SeccionCajas
              cfg={cfg} editar={editar} dis={dis} lotes={lotes} editarLotes={editarLotes} lotesCargando={lotesCargando}
              errorLotes={lotesErrorCarga}
              avisoLotes={<>
                Los lotes se cargan en{" "}
                <button type="button" style={s.linkBtnInline} onClick={() => navigate(rutaLotes)}>
                  {areaActivaEnProyecto(proyecto, "desarrollos") ? "Desarrollos → Manzanas y lotes" : "la configuración del proyecto"}
                </button>.
              </>}
            />
          )}
        </div>
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
    </div>
  );
}

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

export function SeccionTitulo({ icono, nombre, desc }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={s.h2}>{icono} {nombre}</h2>
      <p style={s.sub}>{desc}</p>
    </div>
  );
}

export function Campo({ label, children }) {
  return (
    <label style={s.campo}>
      <span style={s.label}>{label}</span>
      {children}
    </label>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: "16px" },
  intro: { fontSize: "14px", color: "var(--text2)", lineHeight: 1.5 },
  layout: { display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" },
  lista: { flex: "0 0 240px", minWidth: "220px", display: "flex", flexDirection: "column", gap: "6px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "8px" },
  item: { display: "flex", alignItems: "center", gap: "10px", textAlign: "left", background: "transparent", border: "none", borderRadius: "10px", padding: "10px 10px", cursor: "pointer", color: "var(--text)" },
  itemActivo: { background: "var(--surface)" },
  itemIcono: { fontSize: "18px", flexShrink: 0 },
  itemNombre: { fontSize: "13.5px", fontWeight: "700" },
  itemResumen: { fontSize: "11.5px", color: "var(--text2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  detalle: { flex: "1 1 420px", minWidth: "280px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "22px 24px" },
  h2: { margin: "0 0 4px", fontSize: "18px", fontWeight: "700", color: "var(--text)" },
  h3: { fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "2px" },
  sub: { margin: 0, fontSize: "13px", color: "var(--text2)", lineHeight: 1.5 },
  nota: { margin: "10px 0 0", fontSize: "12.5px", color: "var(--text2)", lineHeight: 1.5 },
  vacio: { margin: "0 0 10px", fontSize: "13px", color: "var(--text2)", fontStyle: "italic" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" },
  campo: { display: "flex", flexDirection: "column", gap: "5px" },
  label: { fontSize: "12px", color: "var(--text2)" },
  input: { padding: "9px 11px", border: "1.5px solid var(--border)", borderRadius: "8px", fontSize: "14px", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", width: "100%" },
  plan: { border: "1.5px solid var(--border)", borderRadius: "14px", padding: "16px", marginBottom: "14px", background: "var(--surface)" },
  planTop: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "14px" },
  planNombre: { flex: 1, minWidth: 180, fontWeight: "700" },
  grupo: { border: "1px solid var(--border)", borderRadius: "12px", padding: "12px", marginBottom: "10px", background: "var(--card)" },
  grupoTop: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" },
  colores: { display: "flex", gap: "6px", alignItems: "center" },
  colorDot: { width: "20px", height: "20px", borderRadius: "50%", border: "none", cursor: "pointer", outlineOffset: "2px", padding: 0 },
  meses: { display: "flex", flexWrap: "wrap", gap: "6px" },
  mes: { padding: "5px 10px", borderRadius: "20px", border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", fontSize: "12px", cursor: "pointer" },
  caja: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" },
  quitar: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "7px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" },
  btnSec: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text)", padding: "9px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px" },
  btnPri: { background: "var(--acc)", border: "none", color: "#fff", padding: "10px 18px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  grupoFila: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "10px", marginBottom: "8px", background: "var(--card)" },
  bloque: { border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", background: "var(--surface)", marginBottom: "14px" },
  modoFila: { display: "flex", gap: "6px", flexWrap: "wrap", margin: "8px 0 12px" },
  modoBtn: { padding: "6px 12px", borderRadius: "20px", border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", fontSize: "12.5px", cursor: "pointer" },
  modoBtnOn: { background: "var(--acc)", color: "#fff", borderColor: "var(--acc)" },
  leyenda: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", fontSize: "12.5px", color: "var(--text2)" },
  resumenLotes: { fontWeight: "700", color: "var(--text)" },
  leyItem: { display: "inline-flex", alignItems: "center", gap: "6px" },
  leyDot: { width: "12px", height: "12px", borderRadius: "4px", display: "inline-block", boxSizing: "border-box" },
  marcaCaja: { color: "#BA7517", fontSize: "12px" },
  barraSel: { position: "sticky", top: "8px", zIndex: 2, border: "1.5px solid var(--acc)", borderRadius: "12px", padding: "12px", background: "var(--card)", marginBottom: "12px" },
  selAcciones: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "10px" },
  etapaTitulo: { fontSize: "14px", fontWeight: "800", color: "var(--text)", marginBottom: "8px" },
  mzBloque: { border: "1px solid var(--border)", borderRadius: "12px", padding: "10px 12px", marginBottom: "10px" },
  mzTop: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" },
  linkBtnInline: { background: "none", border: "none", color: "var(--acc2, var(--acc))", fontSize: "14px", cursor: "pointer", padding: 0, textDecoration: "underline" },
  linkBtn: { background: "none", border: "none", color: "var(--acc2, var(--acc))", fontSize: "12px", cursor: "pointer", padding: 0, marginLeft: "auto" },
  chips: { display: "flex", flexWrap: "wrap", gap: "6px" },
  chip: { position: "relative", minWidth: "44px", padding: "7px 8px", borderRadius: "8px", background: "var(--bg)", color: "var(--text)", fontSize: "13px", fontWeight: "600", textAlign: "center" },
  marcaChip: { position: "absolute", top: "-7px", right: "-5px", fontSize: "11px", color: "#BA7517" },
  barra: { position: "sticky", bottom: "12px", display: "flex", alignItems: "center", gap: "10px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "12px", padding: "12px 16px" },
};

// Estilos compartidos con el asistente de proyecto nuevo.
export { s as estilosConfig };
