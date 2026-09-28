// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { empleadoNivelPanel } from "../config/appConfig";
import { tieneConfiguracion } from "../config/configuracionGrupos";

// ⚙️ de la entrada de cada área: abre la configuración de SOLO esa área
// (/proyecto/:id/:areaId/configuracion). Aparece solo si la persona tiene algo para configurar ahí.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export default function BotonConfiguracion({ proyecto, areaId }) {
  const { empresaData, empleadoData, esEmpleado } = useAuth();
  const navigate = useNavigate();
  if (!proyecto) return null;
  const esAdminEf = !esEmpleado || !!empleadoData?.accesoTotal;
  const nivel = (a, panel) => (esEmpleado ? empleadoNivelPanel(empleadoData, proyecto.id, a, panel) : "editar");
  if (!tieneConfiguracion(areaId, { proyecto, empresaData, esAdminEf, nivel })) return null;
  return (
    <button
      type="button"
      style={estilo}
      title="Configuración de esta área"
      onClick={() => navigate(`/proyecto/${proyecto.id}/${areaId}/configuracion`)}
    >
      ⚙️ Configuración
    </button>
  );
}

const estilo = { background: "transparent", border: "1px solid var(--border2)", color: "var(--text)", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" };

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
BotonConfiguracion.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
