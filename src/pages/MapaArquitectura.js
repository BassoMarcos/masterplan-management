// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
import { useNavigate } from "react-router-dom";
import { MAPA_HTML } from "../generado/mapaArquitectura";

// 🧠 Mapa de arquitectura (FJ App + MasterPlan) — SOLO SuperAdmin (ruta protegida en App.js).
// Se carga aparte (lazy) y trae los datos adentro: ya no existe /mapa.html público.
// Fuente: mapa.html + mapa-data.json en la raíz del repo (ver scripts/generar-mapa.js).
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export default function MapaArquitectura() {
  const navigate = useNavigate();
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#04060a" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", background: "#0b0f16", borderBottom: "1px solid #1c2430" }}>
        <button
          type="button"
          onClick={() => navigate("/superadmin")}
          style={{ background: "transparent", border: "1px solid #2a3442", color: "#c9d3df", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
        >
          ← Volver
        </button>
        <span style={{ color: "#c9d3df", fontSize: 14, fontWeight: 700 }}>🧠 Mapa de arquitectura</span>
        <span style={{ color: "#6b7785", fontSize: 12 }}>Solo SuperAdmin</span>
      </div>
      <iframe title="Mapa de arquitectura" srcDoc={MAPA_HTML} style={{ flex: 1, border: "none", width: "100%" }} />
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
MapaArquitectura.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
