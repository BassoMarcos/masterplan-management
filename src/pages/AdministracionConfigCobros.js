// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
import { s, Campo, SeccionTitulo, Opciones, SiNo } from "../components/configUI";
import {
  COLORES,
  MONEDAS,
  VARIABLES_MENSAJE,
  NIVELES_PERMISO,
  ACCIONES_COBRO,
  CASOS_ESPECIALES,
  rangosCategorias,
  nuevoId,
  num,
} from "../config/adminConfigLogica";

// Secciones de Configuración de Administración que salen de fyj (2026-09-26):
// adelantos, avisos de mora, permisos de cobro, diferencias, recibos, cierre del mes,
// casos especiales y lotes terminados. Todas editan proyectos/{id}.adminConfig.
// Todavía no mueven plata: las usan los cobros cuando se armen.

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function TopeMora({ cfg, editar, dis }) {
  const t = cfg.moraExtra.tope;
  return (
    <div style={{ marginTop: 16 }}>
      <SiNo
        label="¿El interés tiene un tope?"
        ayuda="Para que la mora no crezca sin límite."
        valor={t.activo}
        dis={dis}
        onCambiar={v => editar(c => { c.moraExtra.tope.activo = v; })}
      />
      {t.activo && (
        <div style={s.grid}>
          <Campo label="Como máximo, el interés llega al (% de la cuota)">
            <input style={s.input} disabled={dis} type="number" min="1" step="1" value={t.pct} onChange={e => editar(c => { c.moraExtra.tope.pct = e.target.value; })} />
          </Campo>
        </div>
      )}
      {t.activo && num(t.pct) > 0 && (
        <p style={s.nota}>Ejemplo: en una cuota de $100.000, el interés nunca pasa de ${Math.round(100000 * num(t.pct) / 100).toLocaleString("es-AR")}.</p>
      )}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionAvisosMora({ cfg, editar, dis }) {
  const me = cfg.moraExtra;
  // Se muestran en el orden en que están (ordenar mientras se escribe haría saltar la lista);
  // al guardar quedan ordenadas por "desde".
  const rangos = rangosCategorias(me.categorias);
  const textoDe = Object.fromEntries(rangos.map(c => [c.id, c.texto]));
  const ejemplo = {
    "{nombre}": "Juan Pérez", "{lote}": "Etapa 1 · M1 · Lote 4", "{cuotas}": "2",
    "{meses}": "Agosto, Septiembre", "{monto}": "$250.000", "{cuotapura}": "$200.000",
  };
  const rellenar = (txt) => String(txt || "").replace(/\{[a-z]+\}/g, m => (ejemplo[m] !== undefined ? ejemplo[m] : m));
  const primera = rangos[0];

  function agregar() {
    const max = me.categorias.reduce((m, c) => Math.max(m, num(c.desde) || 0), 0);
    editar(c => { c.moraExtra.categorias.push({ id: nuevoId(), desde: max + 1, nombre: "", color: COLORES[c.moraExtra.categorias.length % COLORES.length], mensaje: "" }); });
  }

  return (
    <div>
      <SeccionTitulo
        icono="📲"
        nombre="Avisos de mora"
        desc="Los morosos se agrupan según cuántas cuotas deben. Cada grupo tiene su color y su mensaje de WhatsApp."
      />
      {me.categorias.map((c, i) => {
        return (
          <div key={c.id} style={{ ...s.grupo, borderLeft: `5px solid ${c.color}` }}>
            <div style={s.grupoTop}>
              <input
                style={{ ...s.input, flex: 2, minWidth: 150, fontWeight: 700 }}
                disabled={dis}
                placeholder="Nombre (ej. Atraso)"
                value={c.nombre}
                onChange={e => editar(x => { x.moraExtra.categorias[i].nombre = e.target.value; })}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 150 }}>
                <span style={{ fontSize: 12.5, color: "var(--text2)", whiteSpace: "nowrap" }}>Desde</span>
                <input
                  style={{ ...s.input, width: 70 }}
                  disabled={dis}
                  type="number"
                  min="1"
                  value={c.desde}
                  onChange={e => editar(x => { x.moraExtra.categorias[i].desde = e.target.value; })}
                />
                <span style={{ fontSize: 12.5, color: "var(--text2)" }}>cuotas</span>
              </div>
              {!dis && me.categorias.length > 1 && (
                <button type="button" style={s.quitar} onClick={() => editar(x => { x.moraExtra.categorias.splice(i, 1); })}>Quitar</button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <b style={{ fontSize: 12.5 }}>{textoDe[c.id]}</b>
              <div style={s.colores}>
                {COLORES.map(col => (
                  <button
                    key={col}
                    type="button"
                    disabled={dis}
                    title="Color"
                    onClick={() => editar(x => { x.moraExtra.categorias[i].color = col; })}
                    style={{ ...s.colorDot, background: col, outline: c.color === col ? "2px solid var(--text)" : "none" }}
                  />
                ))}
              </div>
            </div>
            <textarea
              style={{ ...s.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
              disabled={dis}
              placeholder="Mensaje de WhatsApp para este grupo"
              value={c.mensaje}
              onChange={e => editar(x => { x.moraExtra.categorias[i].mensaje = e.target.value; })}
            />
          </div>
        );
      })}
      {!dis && <button type="button" style={s.btnSec} onClick={agregar}>+ Agregar grupo</button>}

      <div style={{ ...s.grid, marginTop: 16 }}>
        <Campo label="Saludo (va arriba de todos los mensajes)">
          <input style={s.input} disabled={dis} value={me.saludo} onChange={e => editar(c => { c.moraExtra.saludo = e.target.value; })} />
        </Campo>
        <Campo label="Firma (va abajo de todos los mensajes)">
          <input style={s.input} disabled={dis} value={me.firma} onChange={e => editar(c => { c.moraExtra.firma = e.target.value; })} />
        </Campo>
      </div>
      <p style={s.nota}>Se completan solos: {VARIABLES_MENSAJE.join(" ")} (nombre, lote, cantidad de cuotas, meses, total con interés, total sin interés).</p>
      {primera && (
        <div style={{ ...s.bloque, marginTop: 12, whiteSpace: "pre-wrap", fontSize: 13 }}>
          <div style={{ ...s.label, marginBottom: 6 }}>Así le llega a un cliente de "{primera.nombre || "sin nombre"}":</div>
          {[rellenar(me.saludo), rellenar(primera.mensaje), rellenar(me.firma)].filter(Boolean).join("\n\n")}
        </div>
      )}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionAdelantos({ cfg, editar, dis }) {
  const a = cfg.adelantos;
  const hayAumentos = MONEDAS.some(m => cfg.financiacion[m.id].habilitada && cfg.financiacion[m.id].incremento.tipo !== "no");
  return (
    <div>
      <SeccionTitulo icono="⏩" nombre="Adelantos" desc="Cuando un cliente paga cuotas antes de tiempo." />
      <SiNo label="¿Se permiten adelantos?" valor={a.permitidos} dis={dis} onCambiar={v => editar(c => { c.adelantos.permitidos = v; })} />
      {a.permitidos && (
        <>
          <div style={{ margin: "0 0 14px" }}>
            <div style={s.h3}>¿Qué cuotas cancela el adelanto?</div>
            <Opciones
              valor={a.cuotas}
              dis={dis}
              onCambiar={v => editar(c => { c.adelantos.cuotas = v; })}
              opciones={[
                { id: "ultimas", label: "Las últimas (termina antes)" },
                { id: "proximas", label: "Las próximas (no paga los meses que siguen)" },
                { id: "elige", label: "Lo elige quien cobra" },
              ]}
            />
          </div>
          {a.cuotas !== "ultimas" && hayAumentos && (
            <div style={{ margin: "0 0 14px" }}>
              <div style={s.h3}>Si en el medio hay un aumento…</div>
              <Opciones
                valor={a.conAumento}
                dis={dis}
                onCambiar={v => editar(c => { c.adelantos.conAumento = v; })}
                opciones={[
                  { id: "hoy", label: "Quedan pagas al precio de hoy" },
                  { id: "diferencia", label: "Cuando llega el aumento, paga la diferencia" },
                ]}
              />
            </div>
          )}
          <SiNo
            label="¿Necesitan aprobación de Administración?"
            ayuda="Si es sí, el adelanto que cobra Cobranzas queda pendiente hasta que Administración lo apruebe."
            valor={a.aprobacion}
            dis={dis}
            onCambiar={v => editar(c => { c.adelantos.aprobacion = v; })}
          />
        </>
      )}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionPermisos({ cfg, editar, dis }) {
  return (
    <div>
      <SeccionTitulo icono="🔐" nombre="Permisos de cobro" desc="Quién puede hacer las cosas delicadas al cobrar. Siempre queda anotado quién lo hizo." />
      {ACCIONES_COBRO.map(a => (
        <div key={a.id} style={{ margin: "0 0 14px" }}>
          <div style={s.h3}>{a.label}</div>
          <Opciones
            valor={cfg.permisos[a.id]}
            dis={dis}
            onCambiar={v => editar(c => { c.permisos[a.id] = v; })}
            opciones={NIVELES_PERMISO}
          />
        </div>
      ))}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionDiferencias({ cfg, editar, dis }) {
  const d = cfg.diferencias;
  const hasta = num(d.ignorarHasta);
  return (
    <div>
      <SeccionTitulo
        icono="⚖️"
        nombre="Diferencias al cobrar"
        desc="Cuando el cliente paga un poco más o un poco menos de lo que corresponde."
      />
      <div style={s.grid}>
        <Campo label="Diferencias de hasta ($) se ignoran">
          <input style={s.input} disabled={dis} type="number" min="0" step="1" value={d.ignorarHasta} onChange={e => editar(c => { c.diferencias.ignorarHasta = e.target.value; })} />
        </Campo>
      </div>
      <p style={s.nota}>
        {hasta > 0
          ? `Ejemplo: si faltan o sobran $${hasta.toLocaleString("es-AR")} o menos, no se anota nada. Si es más, queda como saldo a favor o en contra del cliente.`
          : "Con 0, cualquier diferencia queda anotada como saldo a favor o en contra del cliente."}
      </p>
      <div style={{ marginTop: 14 }}>
        <SiNo
          label="¿El saldo se aplica solo en el próximo pago?"
          ayuda="Sí: el próximo mes se le descuenta (o se le suma) automáticamente. No: queda anotado y se resuelve a mano."
          valor={d.alProximoPago}
          dis={dis}
          onCambiar={v => editar(c => { c.diferencias.alProximoPago = v; })}
        />
      </div>
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionRecibos({ cfg, editar, dis }) {
  const r = cfg.recibos;
  return (
    <div>
      <SeccionTitulo icono="🧾" nombre="Recibos" desc="El comprobante que se le da al cliente cuando paga." />
      <div style={s.grid}>
        <Campo label="Título del recibo">
          <input style={s.input} disabled={dis} value={r.titulo} onChange={e => editar(c => { c.recibos.titulo = e.target.value; })} />
        </Campo>
        <Campo label="Número del primer recibo">
          <input style={s.input} disabled={dis} type="number" min="1" step="1" value={r.numeroInicial} onChange={e => editar(c => { c.recibos.numeroInicial = e.target.value; })} />
        </Campo>
      </div>
      <div style={{ marginTop: 14 }}>
        <Campo label="Texto al pie (opcional)">
          <textarea style={{ ...s.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} disabled={dis} placeholder="Ej: Conserve este comprobante." value={r.pie} onChange={e => editar(c => { c.recibos.pie = e.target.value; })} />
        </Campo>
      </div>
      <div style={{ marginTop: 14 }}>
        <SiNo label="¿Ofrecer mandarlo por WhatsApp?" valor={r.whatsapp} dis={dis} onCambiar={v => editar(c => { c.recibos.whatsapp = v; })} />
      </div>
      <p style={s.nota}>Los datos de la empresa (razón social, CUIT, domicilio) se van a tomar de Legales.</p>
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionCierre({ cfg, editar, dis }) {
  const c0 = cfg.cierre;
  return (
    <div>
      <SeccionTitulo icono="🗓️" nombre="Cierre del mes" desc="Cuidados antes de cerrar el mes, para no perder nada." />
      <SiNo
        label="¿Respaldos obligatorios?"
        ayuda="Uno al empezar el mes (antes de cobrar) y otro antes del cierre final."
        valor={c0.respaldos}
        dis={dis}
        onCambiar={v => editar(c => { c.cierre.respaldos = v; })}
      />
      <SiNo
        label="¿Revisar con el simulador antes de cerrar?"
        ayuda="Muestra qué va a pasar con el cierre antes de hacerlo de verdad."
        valor={c0.simulador}
        dis={dis}
        onCambiar={v => editar(c => { c.cierre.simulador = v; })}
      />
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionEspeciales({ cfg, editar, dis }) {
  return (
    <div>
      <SeccionTitulo icono="⭐" nombre="Casos especiales" desc="Tipos de contrato o de lote que este proyecto usa. Los que dejes en No no aparecen al firmar." />
      {CASOS_ESPECIALES.map(x => (
        <SiNo key={x.id} label={x.label} ayuda={x.ayuda} valor={cfg.especiales[x.id]} dis={dis} onCambiar={v => editar(c => { c.especiales[x.id] = v; })} />
      ))}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionTerminados({ cfg, editar, dis }) {
  const t = cfg.terminados;
  function mover(i, d) {
    editar(c => {
      const p = c.terminados.pasos;
      const j = i + d;
      if (j < 0 || j >= p.length) return;
      [p[i], p[j]] = [p[j], p[i]];
    });
  }
  return (
    <div>
      <SeccionTitulo icono="🏁" nombre="Lotes terminados" desc="Qué pasa cuando un lote termina de pagar." />
      <SiNo
        label="¿Se entrega un certificado?"
        ayuda="Si es sí, cada lote terminado sigue estos pasos hasta la entrega."
        valor={t.certificado}
        dis={dis}
        onCambiar={v => editar(c => { c.terminados.certificado = v; })}
      />
      {t.certificado && (
        <>
          {t.pasos.map((p, i) => (
            <div key={p.id} style={s.grupoFila}>
              <b style={{ fontSize: 13, width: 22 }}>{i + 1}.</b>
              <input
                style={{ ...s.input, flex: 1, minWidth: 160 }}
                disabled={dis}
                placeholder="Nombre del paso"
                value={p.nombre}
                onChange={e => editar(c => { c.terminados.pasos[i].nombre = e.target.value; })}
              />
              {!dis && (
                <>
                  <button type="button" style={s.quitar} disabled={i === 0} onClick={() => mover(i, -1)} title="Subir">↑</button>
                  <button type="button" style={s.quitar} disabled={i === t.pasos.length - 1} onClick={() => mover(i, 1)} title="Bajar">↓</button>
                  <button type="button" style={s.quitar} onClick={() => editar(c => { c.terminados.pasos.splice(i, 1); })}>Quitar</button>
                </>
              )}
            </div>
          ))}
          {!dis && (
            <button type="button" style={s.btnSec} onClick={() => editar(c => { c.terminados.pasos.push({ id: nuevoId(), nombre: "" }); })}>+ Agregar paso</button>
          )}
        </>
      )}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
TopeMora.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
