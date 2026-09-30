// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
import { useNavigate, useLocation } from "react-router-dom";

// 📚 de la entrada de cada área: abre la biblioteca del proyecto directo en la carpeta de ESA área
// (/proyecto/:id/biblioteca/area/:areaId). Quien trabaja en el área siempre ve su carpeta.
// "Volver" desde la biblioteca regresa acá.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export default function BotonBiblioteca({ proyectoId, areaId }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (!proyectoId || !areaId) return null;
  return (
    <button
      type="button"
      style={estilo}
      title="Archivos de esta área (en la biblioteca del proyecto)"
      onClick={() => navigate(`/proyecto/${proyectoId}/biblioteca/area/${areaId}`, { state: { volver: location.pathname } })}
    >
      📚 Biblioteca
    </button>
  );
}

const estilo = { background: "transparent", border: "1px solid var(--border2)", color: "var(--text)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
BotonBiblioteca.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
