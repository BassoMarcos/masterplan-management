// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
import { useState, useEffect } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { conectarDrive, estadoDrive, desconectarDrive, subirArchivo } from "../utils/drive";
import { s, SeccionTitulo } from "./configUI";

// Piezas de ⚙️ Configuración → Empresa. Valen para TODOS los proyectos de la empresa.
// Se ven en la configuración central de cada proyecto y en la de la empresa (pantalla de proyectos):
// es la misma pieza y los mismos datos, así que siempre están sincronizadas.

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function CuentaEmpresa() {
  const { currentUser, empresaData, empleadoData } = useAuth();
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const email = currentUser?.email || "";

  async function cambiarClave() {
    setEnviando(true);
    setMsg("");
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg(`✓ Te mandamos un mail a ${email} para que elijas la contraseña nueva.`);
    } catch (e) {
      setMsg("No se pudo mandar el mail. Probá de nuevo en un rato.");
    }
    setEnviando(false);
  }

  return (
    <div>
      <SeccionTitulo icono="👤" nombre="Cuenta" desc="Con qué mail entrás y tu contraseña." />
      <div style={s.grid}>
        <div>
          <div style={s.label}>Empresa</div>
          <div style={st.valor}>{empresaData?.nombre || empleadoData?.empresaNombre || "—"}</div>
        </div>
        <div>
          <div style={s.label}>Mail de la cuenta</div>
          <div style={st.valor}>{email || "—"}</div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={s.h3}>Contraseña</div>
        <p style={{ ...s.sub, fontSize: 12.5, marginBottom: 8 }}>Por seguridad, se cambia desde un link que te llega al mail.</p>
        <button type="button" style={s.btnSec} onClick={cambiarClave} disabled={enviando || !email}>
          {enviando ? "Enviando…" : "🔒 Cambiar contraseña"}
        </button>
        {msg && <p style={s.nota}>{msg}</p>}
      </div>
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function CodigoEmpresa() {
  const { empresaData, empresaUid } = useAuth();
  const [codigoLocal, setCodigoLocal] = useState(null);
  const [editando, setEditando] = useState(false);
  const [input, setInput] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState("");
  const codigo = codigoLocal || empresaData?.codigoEmpresa || "—";

  async function guardar() {
    const nuevo = input.trim();
    if (!nuevo) { setError("El código no puede quedar vacío."); return; }
    setGuardando(true);
    setError("");
    try {
      await updateDoc(doc(db, "empresas", empresaUid), { codigoEmpresa: nuevo });
      setCodigoLocal(nuevo);
      setEditando(false);
    } catch (e) {
      setError("No se pudo guardar el código. Revisá tu conexión e intentá de nuevo.");
    }
    setGuardando(false);
  }

  return (
    <div>
      <SeccionTitulo icono="🔑" nombre="Código de la empresa" desc='Pasale este código a tu equipo. Lo necesitan una sola vez, al registrarse por primera vez en "Acceso Personal".' />
      {editando ? (
        <div style={{ maxWidth: 360 }}>
          <input style={{ ...s.input, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }} value={input} onChange={e => setInput(e.target.value)} placeholder="Escribí un código" autoFocus />
          <p style={s.nota}>Escribilo como quieras (prefijo y números).</p>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" style={s.btnPri} onClick={guardar} disabled={guardando}>{guardando ? "Guardando..." : "Guardar"}</button>
            <button type="button" style={s.btnSec} onClick={() => { setEditando(false); setError(""); }} disabled={guardando}>Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <div style={st.codigo}>{codigo}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              style={s.btnPri}
              onClick={() => {
                if (codigo === "—") return;
                try { navigator.clipboard.writeText(codigo); } catch (e) { /* sin portapapeles */ }
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
            >
              {copiado ? "✓ Copiado" : "📋 Copiar"}
            </button>
            <button type="button" style={s.btnSec} onClick={() => { setInput(codigo === "—" ? "" : codigo); setEditando(true); }}>✏️ Editar</button>
          </div>
        </>
      )}
      {error && <p style={{ ...s.nota, color: "var(--red, #dc2626)" }}>{error}</p>}
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export function DriveEmpresa() {
  const { empresaUid } = useAuth();
  const [ok, setOk] = useState(false);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [prueba, setPrueba] = useState("");
  const [subiendo, setSubiendo] = useState(false);

  // Estado de la conexión (guardada en el servidor, por empresa).
  useEffect(() => {
    let vivo = true;
    estadoDrive().then(r => {
      if (!vivo) return;
      setOk(!!r.conectado);
      setEmail(r.email || "");
    }).catch(() => {});
    return () => { vivo = false; };
  }, [empresaUid]);

  return (
    <div>
      <SeccionTitulo icono="📁" nombre="Google Drive" desc="Conectá el Drive de tu empresa para guardar ahí los planos, boletos y archivos. Los archivos quedan en tu cuenta, no en la nuestra." />
      {ok ? (
        <>
          <div style={{ color: "var(--green, #16a34a)", fontWeight: 700, fontSize: 14 }}>✓ Drive conectado</div>
          {email && <div style={{ ...s.nota, marginTop: 4 }}>{email}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <label style={{ ...s.btnSec, display: "inline-block" }}>
              {subiendo ? "Subiendo…" : "🧪 Probar subida de archivo"}
              <input
                type="file"
                style={{ display: "none" }}
                disabled={subiendo}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setSubiendo(true);
                  setPrueba("");
                  try {
                    const r = await subirArchivo(f, "Pruebas");
                    setPrueba("✓ Subido a tu Drive: " + r.nombre);
                  } catch (err) {
                    setPrueba("✗ Error: " + (err?.message || "no se pudo subir"));
                  }
                  setSubiendo(false);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" style={s.btnSec} onClick={async () => { await desconectarDrive(); setOk(false); setMsg(""); setEmail(""); }}>Desconectar</button>
          </div>
          {prueba && <p style={s.nota}>{prueba}</p>}
        </>
      ) : (
        <button
          type="button"
          style={s.btnPri}
          onClick={async () => {
            setMsg("");
            try { const r = await conectarDrive(); setOk(true); setEmail(r?.email || ""); }
            catch (e) { setMsg("No se pudo conectar: " + e.message); }
          }}
        >
          🔗 Conectar Google Drive
        </button>
      )}
      {msg && <p style={{ ...s.nota, color: "var(--red, #dc2626)" }}>{msg}</p>}
    </div>
  );
}

const st = {
  valor: { fontSize: 15, fontWeight: 700, color: "var(--text)", marginTop: 4, wordBreak: "break-all" },
  codigo: { fontSize: 28, fontWeight: 800, color: "var(--acc)", letterSpacing: 1, fontFamily: "monospace" },
};

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
CuentaEmpresa.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
