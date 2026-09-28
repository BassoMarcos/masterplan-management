// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// Piezas visuales compartidas por las pantallas de configuración (Administración, asistente,
// Desarrollos): estilos, título de sección y campo con etiqueta.

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SeccionTitulo({ icono, nombre, desc }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={s.h2}>{icono} {nombre}</h2>
      <p style={s.sub}>{desc}</p>
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function Campo({ label, children }) {
  return (
    <label style={s.campo}>
      <span style={s.label}>{label}</span>
      {children}
    </label>
  );
}

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: "16px" },
  intro: { fontSize: "14px", color: "var(--text2)", lineHeight: 1.5 },
  layout: { display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" },
  lista: { flex: "0 0 240px", minWidth: "220px", display: "flex", flexDirection: "column", gap: "6px", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "8px" },
  item: { display: "flex", alignItems: "center", gap: "10px", textAlign: "left", background: "transparent", border: "none", borderRadius: "10px", padding: "10px 10px", cursor: "pointer", color: "var(--text)" },
  itemActivo: { background: "var(--surface)" },
  itemIcono: { fontSize: "18px", flexShrink: 0 },
  itemNombre: { fontSize: "13.5px", fontWeight: "700" },
  itemResumen: { fontSize: "11.5px", color: "var(--text2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  grupoLista: { fontSize: "11px", fontWeight: "800", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.6px", padding: "10px 10px 2px" },
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

// Botones para elegir una opción (como pestañas chicas).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function Opciones({ valor, opciones, onCambiar, dis }) {
  return (
    <div style={{ ...s.modoFila, margin: "4px 0 0" }}>
      {opciones.map(o => (
        <button
          key={String(o.id)}
          type="button"
          disabled={dis}
          onClick={() => onCambiar(o.id)}
          style={{ ...s.modoBtn, ...(valor === o.id ? s.modoBtnOn : {}) }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Sí / No con una explicación corta.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function SiNo({ label, ayuda, valor, onCambiar, dis }) {
  return (
    <div style={{ margin: "0 0 14px" }}>
      <div style={s.h3}>{label}</div>
      {ayuda && <p style={{ ...s.sub, fontSize: 12.5 }}>{ayuda}</p>}
      <Opciones valor={!!valor} opciones={[{ id: true, label: "Sí" }, { id: false, label: "No" }]} onCambiar={onCambiar} dis={dis} />
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
SeccionTitulo.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
